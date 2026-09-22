/**
 * Filtr. AI Review Client
 * Handles communication between the frontend review page and the FastAPI backend.
 * Features:
 * - Direct Multimodal Vision LLM (Gemini Flash / Claude 3.5 Sonnet) via backend
 * - In-browser Tesseract.js OCR fallback when backend vision is unconfigured or offline
 * - Seamless spaCy NLP + regex pattern matching for safety evaluation
 */

const FILTR_AI = (() => {
  const API_BASE = "http://127.0.0.1:8000";
  let _backendAvailable = null; // null = unknown, true/false = cached

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /**
   * Check if the backend is running.
   */
  async function checkBackend() {
    if (_backendAvailable !== null) return _backendAvailable;
    try {
      const res = await fetch(`${API_BASE}/health`, {
        method: "GET",
        signal: AbortSignal.timeout(2000),
      });
      _backendAvailable = res.ok;
    } catch {
      _backendAvailable = false;
    }
    // Re-check after 30 seconds
    setTimeout(() => { _backendAvailable = null; }, 30000);
    return _backendAvailable;
  }

  /**
   * Extract text from an image file using in-browser Tesseract.js
   * @param {File} file - Image file to OCR
   * @param {Function} onProgress - Optional callback for percent progress (0-100)
   * @returns {Promise<string>} Extracted text
   */
  async function extractTextWithOcr(file, onProgress) {
    if (typeof Tesseract === "undefined") {
      console.warn("Filtr AI: Tesseract.js is not loaded.");
      return "";
    }
    try {
      const res = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (onProgress && m.status === "recognizing text" && typeof m.progress === "number") {
            onProgress(Math.round(m.progress * 100));
          }
        },
      });
      return res?.data?.text?.trim() || "";
    } catch (err) {
      console.error("Filtr AI: Tesseract OCR error", err);
      return "";
    }
  }

  /**
   * Analyze pasted text messages via the backend.
   * @param {string} text - The message text to analyze
   * @returns {Promise<object>} Analysis result
   */
  async function analyzeText(text) {
    const available = await checkBackend();
    if (!available) return null; // caller should use regex fallback

    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) {
        console.warn("Filtr AI: text analysis failed", res.status);
        return null;
      }

      return await res.json();
    } catch (e) {
      console.warn("Filtr AI: network error during analyzeText", e);
      return null;
    }
  }

  /**
   * Analyze a single screenshot via the backend, with seamless OCR fallback.
   * @param {File} file - Image file to analyze
   * @param {Function} onProgress - Optional callback for progress updates
   * @returns {Promise<object>} Analysis result
   */
  async function analyzeImage(file, onProgress) {
    const available = await checkBackend();

    // 1. Try Backend Vision LLM if available
    if (available) {
      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch(`${API_BASE}/analyze-image`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          // If server successfully processed with Gemini or Claude Vision
          if (!data.requiresClientOcr && data.source !== "fallback-no-vision") {
            return data;
          }
        }
      } catch (err) {
        console.warn("Filtr AI: backend image analysis request error, trying OCR fallback", err);
      }
    }

    // 2. Client-side OCR Fallback via Tesseract.js
    if (typeof Tesseract !== "undefined") {
      if (onProgress) onProgress(15);
      const text = await extractTextWithOcr(file, onProgress);
      if (text) {
        // If backend is running, send OCR text to backend for spaCy NLP / LLM evaluation
        if (available) {
          const backendResult = await analyzeText(text);
          if (backendResult) {
            backendResult.extractedText = text;
            backendResult.source = (backendResult.source || "ai") + " (OCR)";
            return backendResult;
          }
        }
        // If backend is offline, return text with flag for client-side regex evaluation
        return {
          extractedText: text,
          needsClientRegex: true,
        };
      }
    }

    return null;
  }

  /**
   * Analyze multiple screenshots via backend with OCR fallback.
   * @param {File[]} files - Array of image files
   * @param {Function} onProgress - Optional progress callback
   * @returns {Promise<object>} Aggregated analysis results
   */
  async function analyzeImages(files, onProgress) {
    const available = await checkBackend();

    if (available) {
      try {
        const formData = new FormData();
        files.slice(0, 5).forEach((f) => formData.append("files", f));

        const res = await fetch(`${API_BASE}/analyze-images`, {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          const data = await res.json();
          const hasUnconfigured = data.imageResults?.some((r) => r.requiresClientOcr);
          if (!hasUnconfigured) {
            return data;
          }
        }
      } catch (err) {
        console.warn("Filtr AI: multi-image backend request failed, falling back to OCR", err);
      }
    }

    // OCR Fallback: iterate images and extract text
    if (typeof Tesseract !== "undefined") {
      const texts = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const t = await extractTextWithOcr(file, (p) => {
          if (onProgress) onProgress(Math.round(((i + p / 100) / files.length) * 100));
        });
        if (t) texts.push(`[Screenshot ${i + 1} - ${file.name}]\n${t}`);
      }

      const combinedText = texts.join("\n\n");
      if (combinedText) {
        if (available) {
          const backendResult = await analyzeText(combinedText);
          if (backendResult) {
            backendResult.extractedText = combinedText;
            backendResult.source = (backendResult.source || "ai") + " (OCR)";
            return backendResult;
          }
        }
        return {
          extractedText: combinedText,
          needsClientRegex: true,
        };
      }
    }

    return null;
  }

  /**
   * Format an AI result into display HTML.
   * @param {object} result - The analysis result
   * @param {string} saveNote - Optional save status HTML
   * @returns {string} Formatted HTML
   */
  function formatResult(result, saveNote = "") {
    const levelClass = result.concernLevel || "safe";
    const levelLabel =
      levelClass === "alert"
        ? "⚠ Alert"
        : levelClass === "watch"
          ? "◉ Watch"
          : "✓ Safe";

    const signalsHtml =
      result.signals && result.signals.length
        ? `<div class="ai-signals">${result.signals
            .map(
              (s) =>
                `<span class="ai-signal ${levelClass}">${escapeHtml(s)}</span>`
            )
            .join("")}</div>`
        : "";

    const recHtml = result.recommendation
      ? `<div class="ai-recommendation"><strong>Next step:</strong> ${escapeHtml(result.recommendation)}</div>`
      : "";

    let sourceLabel = "Pattern-matched locally";
    const src = (result.source || "").toLowerCase();
    if (src.includes("gemini-vision")) {
      sourceLabel = "Analyzed by Gemini Vision";
    } else if (src.includes("claude-vision")) {
      sourceLabel = "Analyzed by Claude Vision";
    } else if (src.includes("gemini-ai")) {
      sourceLabel = "Analyzed by Gemini AI";
    } else if (src.includes("claude-ai")) {
      sourceLabel = "Analyzed by Claude AI";
    } else if (src.includes("ocr")) {
      sourceLabel = "Extracted via OCR & analyzed";
    }

    const extractedBoxHtml = result.extractedText
      ? `
        <details class="ai-extracted-box" style="margin-top:14px; font-size:11px; border:1px solid rgba(0,0,0,0.08); border-radius:4px; padding:6px 10px; background:rgba(255,255,255,0.6);">
          <summary style="cursor:pointer; font-weight:700; color:var(--onyx); outline:none;">
            Detected text from screenshot (${result.extractedText.length} characters)
          </summary>
          <pre style="margin-top:8px; white-space:pre-wrap; word-break:break-word; font-family:monospace; font-size:10px; color:#333; max-height:160px; overflow-y:auto; background:rgba(0,0,0,0.04); padding:8px; border-radius:3px; line-height:1.4;">${escapeHtml(result.extractedText)}</pre>
        </details>
      `
      : "";

    return `
      <div class="ai-result ai-result--${levelClass}">
        <div class="ai-result-header">
          <span class="ai-level-badge ${levelClass}">${levelLabel}</span>
          <span class="ai-source">${sourceLabel}</span>
        </div>
        <strong>${escapeHtml(result.title || "Analysis complete.")}</strong>
        <p>${escapeHtml(result.summary || "")}</p>
        ${signalsHtml}
        ${recHtml}
        ${extractedBoxHtml}
      </div>
      ${saveNote}
    `;
  }

  return { checkBackend, analyzeText, analyzeImage, analyzeImages, formatResult, extractTextWithOcr };
})();

