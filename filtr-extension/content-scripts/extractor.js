/**
 * Filtr. Content Script — Message Extractor
 * Reads message text + sender from platform-specific DOM elements.
 * Called by observer.js when new messages appear.
 *
 * Uses multi-strategy text extraction to handle WhatsApp's
 * frequently changing DOM structure and invisible unicode direction marks.
 */

(() => {
  "use strict";

  /**
   * Detect which platform config applies to the current page.
   * @returns {object|null}
   */
  function detectPlatform() {
    const configs = window.__FILTR_PLATFORMS;
    if (!configs) return null;
    const host = window.location.hostname;
    for (const key of Object.keys(configs)) {
      if (host.includes(configs[key].hostMatch)) return configs[key];
    }
    return null;
  }

  /**
   * Strip invisible unicode formatting marks that WhatsApp embeds
   * (e.g. LRM \u200E, RLM \u200F, directional isolates, zero-width spaces).
   * @param {string} text
   * @returns {string}
   */
  function stripInvisibleMarks(text) {
    if (!text) return "";
    return text.replace(/[\u200E\u200F\u202A-\u202E\u2060\uFEFF\u00AD\u200B-\u200D]/g, "");
  }

  /**
   * Clean trailing or leading timestamp strings.
   * e.g. "Send me 1000 2:32 AM" -> "Send me 1000"
   * @param {string} text
   * @returns {string}
   */
  function cleanMessageText(text) {
    if (!text) return "";
    const clean = stripInvisibleMarks(text);
    return clean
      .replace(/\s*\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*$/i, "")
      .replace(/^\s*\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\s*/i, "")
      .trim();
  }

  /**
   * Extract text content from a message element using the platform config.
   * Tries multiple strategies for resilience against DOM changes.
   * @param {Element} el - Message DOM element
   * @param {object} config - Platform config
   * @returns {string}
   */
  function extractText(el, config) {
    if (!el || typeof el.querySelector !== "function") return "";

    /* Strategy 1: Try primary text selector */
    if (config.textSelector) {
      try {
        const textEl = el.querySelector(config.textSelector);
        if (textEl && textEl.textContent) {
          const cleaned = cleanMessageText(textEl.textContent);
          if (cleaned && cleaned.length >= 2) return cleaned;
        }
      } catch {
        /* skip invalid selector */
      }
    }

    /* Strategy 2: Try fallback selectors */
    if (config.textFallbacks) {
      for (const sel of config.textFallbacks) {
        try {
          const fb = el.querySelector(sel);
          if (fb && fb.textContent) {
            const cleaned = cleanMessageText(fb.textContent);
            if (cleaned && cleaned.length >= 2) return cleaned;
          }
        } catch {
          /* skip */
        }
      }
    }

    /* Strategy 3: Look for child spans with actual readable text */
    if (el.querySelectorAll) {
      const spans = el.querySelectorAll("span");
      for (const span of spans) {
        /* Skip if part of timestamp metadata, checkmarks, author names, or reactions */
        if (
          span.closest &&
          (span.closest('[data-testid="msg-meta"]') ||
            span.closest('[data-testid="msg-time"]') ||
            span.closest('[data-testid="author-name"]') ||
            span.closest('[data-testid="quoted-message"]') ||
            span.closest(".sender-tag") ||
            span.closest("[data-icon]"))
        ) {
          continue;
        }

        const raw = span.textContent?.trim();
        const cleaned = cleanMessageText(raw);
        /* Skip if empty, tiny, or pure timestamp */
        if (cleaned && cleaned.length >= 2 && !/^\d{1,2}:\d{2}\s*(?:AM|PM)?$/i.test(cleaned)) {
          return cleaned;
        }
      }
    }

    /* Strategy 4: Element's own text, trimmed and cleaned */
    const raw = el.textContent?.trim() || "";
    return cleanMessageText(raw);
  }

  /**
   * Extract a structured message from a DOM element.
   * @param {Element} el
   * @param {object} config
   * @returns {{ id: string|null, text: string, sender: "them"|"user", timestamp: string|null }|null}
   */
  function extractMessage(el, config) {
    if (!el || typeof el.querySelector !== "function") return null;

    /* If given an outer container (e.g. role="row"), locate the message bubble */
    const bubble =
      (el.matches &&
        el.matches(
          '[data-id], [data-testid="msg-container"], .message-in, .message-out, [class*="message-in"], [class*="message-out"]'
        ))
        ? el
        : el.querySelector &&
          el.querySelector(
            '[data-id], [data-testid="msg-container"], .message-in, .message-out, [class*="message-in"], [class*="message-out"]'
          );

    const targetEl = bubble || el;

    /* Skip system messages (date headers, encryption notices, revoked messages) */
    if (
      targetEl.querySelector('[data-testid="system-msg"]') ||
      targetEl.querySelector('[data-testid="msg-revoked"]') ||
      targetEl.getAttribute?.("data-id")?.includes("@broadcast")
    ) {
      return null;
    }

    const text = extractText(targetEl, config);
    if (!text || text.length < 2) return null; /* skip empty/tiny */

    /* Skip common non-message headers */
    const upper = text.toUpperCase();
    if (
      upper === "TODAY" ||
      upper === "YESTERDAY" ||
      upper.includes("MESSAGES AND CALLS ARE END-TO-END ENCRYPTED") ||
      upper.includes("DISAPPEARING MESSAGES")
    ) {
      return null;
    }

    const id =
      (targetEl.getAttribute && targetEl.getAttribute("data-id")) ||
      (targetEl.closest && targetEl.closest("[data-id]")?.getAttribute("data-id")) ||
      (el.getAttribute && el.getAttribute("data-id")) ||
      null;

    return {
      id,
      text,
      sender: config.getSender(targetEl),
      timestamp: config.getTimestamp ? config.getTimestamp(targetEl) : null,
    };
  }

  /* Expose to observer.js */
  window.__FILTR_EXTRACTOR = { detectPlatform, extractMessage, extractText, cleanMessageText, stripInvisibleMarks };
})();
