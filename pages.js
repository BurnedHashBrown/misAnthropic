const $ = (selector) => document.querySelector(selector);

function notify(text) {
  const notice = $("#pageNotice");
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(window.filtrNoticeTimer);
  window.filtrNoticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 5000);
}

const reviewForm = $("#pasteReviewForm");
if (reviewForm) {
  /* ── Tab switching ── */
  const tabText = $("#tabText");
  const tabPhotos = $("#tabPhotos");
  const panelText = $("#panelText");
  const panelPhotos = $("#panelPhotos");

  function activateTab(activeTab, activePanel, inactiveTab, inactivePanel) {
    activeTab.classList.add("active");
    activeTab.setAttribute("aria-selected", "true");
    activePanel.classList.add("active");
    inactiveTab.classList.remove("active");
    inactiveTab.setAttribute("aria-selected", "false");
    inactivePanel.classList.remove("active");
  }

  tabText.addEventListener("click", () =>
    activateTab(tabText, panelText, tabPhotos, panelPhotos)
  );
  tabPhotos.addEventListener("click", () =>
    activateTab(tabPhotos, panelPhotos, tabText, panelText)
  );

  /* ── Photo upload (drag-and-drop + file picker) ── */
  const zone = $("#reviewUploadZone");
  const fileInput = $("#reviewImageInput");
  const previews = $("#reviewImagePreviews");
  let uploadedFiles = [];

  function previewFiles(files) {
    [...files]
      .filter((f) => f.type.startsWith("image/"))
      .slice(0, 5)
      .forEach((f) => {
        uploadedFiles.push(f);
        const reader = new FileReader();
        reader.onload = (e) => {
          const fig = document.createElement("figure");
          fig.innerHTML = `<img src="${e.target.result}" alt="Preview of ${f.name}"/><figcaption>${f.name}<button type="button" aria-label="Remove">×</button></figcaption>`;
          fig.querySelector("button").onclick = () => {
            uploadedFiles = uploadedFiles.filter((x) => x !== f);
            fig.remove();
          };
          previews.append(fig);
        };
        reader.readAsDataURL(f);
      });
  }

  fileInput.addEventListener("change", () => previewFiles(fileInput.files));

  ["dragenter", "dragover"].forEach((t) =>
    zone.addEventListener(t, (e) => {
      e.preventDefault();
      zone.classList.add("is-dragging");
    })
  );
  ["dragleave", "drop"].forEach((t) =>
    zone.addEventListener(t, (e) => {
      e.preventDefault();
      zone.classList.remove("is-dragging");
    })
  );
  zone.addEventListener("drop", (e) => previewFiles(e.dataTransfer.files));

  /* ── Form submit (handles both modes) ── */
  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const output = $("#pasteReviewOutput");
    const submitBtn = reviewForm.querySelector("button[type='submit']");
    const originalBtnText = submitBtn ? submitBtn.querySelector("span")?.textContent || "Review" : "Review";
    const isPhotoMode = tabPhotos.classList.contains("active");
    const user = window.FiltrAuth?.getUser() || (typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null);
    const db = window.FiltrAuth?.db || (typeof firebase !== "undefined" && firebase.firestore ? firebase.firestore() : null);

    // Build save note
    function buildSaveNote(result) {
      if (user && db) {
        const reviewData = {
          type: isPhotoMode ? "screenshot" : "text",
          signals: result.signals || [],
          concernLevel: result.concernLevel || "safe",
          title: result.title || "Check-in",
          summary: result.summary || "",
          source: result.source || "unknown",
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        if (!isPhotoMode) {
          const text = $("#pasteReviewText").value.trim();
          reviewData.snippet = text.length > 140 ? text.slice(0, 140) + "..." : text;
        } else {
          reviewData.photoCount = uploadedFiles.length;
          const snippetSource = result?.extractedText || "";
          reviewData.snippet = snippetSource
            ? (snippetSource.length > 140 ? snippetSource.slice(0, 140) + "..." : snippetSource)
            : `${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""}: ${uploadedFiles.map((f) => f.name).slice(0, 3).join(", ")}`;
        }
        db.collection("users").doc(user.uid).collection("reviews").add(reviewData)
          .catch((err) => console.warn("Could not save review to Firestore:", err));

        return `
          <div class="save-status" style="margin-top:16px; padding:12px 14px; background:rgba(0,0,0,0.04); border-left:3px solid var(--tomato); font-size:11px; display:flex; justify-content:space-between; align-items:center;">
            <span>✓ <strong>Saved check-in to your private timeline.</strong></span>
            <a href="timeline.html" style="font-weight:800; text-decoration:underline; text-transform:uppercase; letter-spacing:0.04em;">View Timeline →</a>
          </div>
        `;
      } else {
        return `
          <div class="save-status" style="margin-top:16px; padding:12px 14px; background:rgba(255,188,13,0.12); border-left:3px solid var(--amber); font-size:11px;">
            Want to save your check-ins to track patterns over time? <a href="login.html" style="font-weight:800; text-decoration:underline;">Log in</a> or <a href="signup.html" style="font-weight:800; text-decoration:underline;">sign up</a>.
          </div>
        `;
      }
    }

    // Regex fallback with comprehensive pattern detection
    function regexFallback(text) {
      const t = text.toLowerCase();
      const checks = [
        [
          /\b(?:money|cash|funds|dollar|dollars|usd|cent|cents|buck|bucks|euro|euros|eur|pound|pounds|gbp|rupee|rupees|inr)\b|[\$€£₹]\s*\d+|\b(?:wire|transfer|deposit|pay|payment|borrow|lend|loan|owe|reimburse)\b|\b(?:send|give|need|lend|wire)\b.{0,30}\b(?:me|us)?\b.{0,20}(?:\d+|cash|money|dollars|bucks|funds|gift\s*card|crypto)|\b(?:venmo|zelle|paypal|cash\s*app|apple\s*pay|google\s*pay|western\s*union|moneygram)\b|\b(?:bank\s*account|routing\s*number|credit\s*card|debit\s*card)\b|\b(?:gift\s*card|apple\s*(?:gift\s*)?card|steam\s*(?:gift\s*)?card|itunes\s*(?:gift\s*)?card|amazon\s*(?:gift\s*)?card|google\s*play|prepaid\s*card)\b|\b(?:crypto|cryptocurrency|bitcoin|btc|eth|ethereum|usdt|tether|binance|coinbase|wallet\s*address|invest(?:ment|ing)?|forex)\b/i,
          "money request",
        ],
        [
          /\b(?:secret|private|don['’]t\s+tell|between\s+us|no\s+one\s+(?:else\s+)?(?:can|should|must|needs\s+to)\s+know|hide\s+(?:this|it)\s+from|delete\s+(?:our\s+)?(?:chat|messages|convo)|disappearing\s+messages)\b/i,
          "secrecy request",
        ],
        [
          /\b(?:urgent(?:ly)?|right\s+now|immediately|hurry|asap|time\s+(?:is\s+)?running\s*(?:out)?|before\s+it(?:['’]s)?\s+too\s+late|deadline|emergency|at\s+once)\b|\b(?:today\s+only|by\s+today|need\s+(?:it\s+)?today|must\s+(?:be\s+)?today|only\s+today)\b/i,
          "urgency",
        ],
        [
          /\b(?:photo|photos|pic|pics|picture|pictures|nude|nudes|nsfw|selfie|selfies|show\s+me|snap\s+me|video\s*call\s*private|body\s*pic|undress|take\s+(?:it|them)\s+off|send\s+(?:a\s+)?(?:pic|photo|photos|video))\b/i,
          "private-image pressure",
        ],
        [
          /\b(?:blackmail|expose|ruin\s+you|share\s+(?:this|these|it|them|everything)\s+with|send\s+(?:this|these|it|them)\s+to\s+(?:your|everyone)|screenshot(?:s|ed)?|leak|leaked|post\s+(?:online|them|it)|tell\s+everyone|pay\s+(?:or|me\s+or))\b/i,
          "threat/blackmail",
        ],
        [
          /\b(?:only\s+love|prove\s+(?:your\s+)?love|prove\s+(?:your\s+)?trust|if\s+you\s+(?:really\s+)?care|don['’]t\s+you\s+love\s+me|you\s+don['’]t\s+trust\s+me|after\s+all\s+i(?:['’]ve)?\s+done|you\s+owe\s+me)\b/i,
          "emotional coercion",
        ],
        [
          /\b(?:don['’]t\s+tell\s+(?:your\s+)?(?:parents|mom|dad|family|friends|anyone)|they\s+don['’]t\s+understand\s+us|turn\s+(?:them|everyone)\s+against|keep\s+us\s+secret|you\s+only\s+need\s+me)\b/i,
          "isolation",
        ],
      ];
      const signals = checks.filter(([pattern]) => pattern.test(t)).map(([, label]) => label);
      const isBlackmail = signals.includes("threat/blackmail");
      const concern = signals.length > 1 || isBlackmail;
      const concernLevel = concern ? "alert" : (signals.length === 1 ? "watch" : "safe");

      let title = "No combined pressure pattern found yet.";
      let summary = "Warmth or distance alone is not a warning. Keep your boundaries and review again if a request or pressure appears.";
      let recommendation = "Enjoy the conversation, and keep sharing only what feels right.";

      if (concernLevel === "alert") {
        title = isBlackmail ? "Threat or blackmail signals detected." : "Pause before replying.";
        summary = `Filtr. noticed ${signals.join(", ")}. Multiple concerning signals are combining. Save the messages, verify through a separate channel, and involve someone you trust.`;
        recommendation = "Do not send money, private images, codes, or IDs. Step back and talk to a trusted adult or friend.";
      } else if (concernLevel === "watch") {
        title = "A signal worth noticing.";
        if (signals.includes("money request")) {
          summary = "Filtr. noticed a money or financial request. Financial requests from online connections are a primary warning sign for romance and imposter scams.";
          recommendation = "Never send money, wire transfers, crypto, or gift cards to someone you have only met online.";
        } else if (signals.includes("private-image pressure")) {
          summary = "Filtr. noticed pressure for private photos or video. Requests for intimate content can escalate into sextortion or blackmail.";
          recommendation = "Do not feel pressured to share intimate photos. You have the right to keep your privacy.";
        } else if (signals.includes("secrecy request")) {
          summary = "Filtr. noticed a secrecy request. Pressure to keep conversations secret is often used to isolate you from support.";
          recommendation = "Before agreeing to keep secrets, consider discussing this connection with someone you trust.";
        } else {
          summary = `Filtr. noticed ${signals[0]}. Keep your boundaries and observe how the conversation develops.`;
          recommendation = "Stay aware. If more pressure appears, come back and check in again.";
        }
      }

      return { concernLevel, title, summary, signals, recommendation, source: "regex-fallback" };
    }

    // Show loading state
    function showLoading() {
      output.hidden = false;
      output.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span> <span>Analyzing with AI…</span></div>`;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.querySelector("span").textContent = "Analyzing…";
      }
    }

    function resetButton() {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.querySelector("span").textContent = originalBtnText;
      }
    }

    // ── Photo Mode ──
    if (isPhotoMode) {
      if (uploadedFiles.length === 0) {
        notify("Upload at least one screenshot before reviewing.");
        return;
      }

      showLoading();

      try {
        const updateProgress = (pct) => {
          if (output) {
            output.innerHTML = `<div class="ai-loading"><span class="ai-spinner"></span> <span>Reading screenshot text (${pct}%)…</span></div>`;
          }
        };

        // Try AI analysis if FILTR_AI is available
        let result = null;
        if (typeof FILTR_AI !== "undefined") {
          if (uploadedFiles.length === 1) {
            result = await FILTR_AI.analyzeImage(uploadedFiles[0], updateProgress);
          } else {
            result = await FILTR_AI.analyzeImages(uploadedFiles, updateProgress);
          }

          // Handle client-side regex evaluation if backend was unconfigured/offline
          if (result && result.needsClientRegex && result.extractedText) {
            const localAnalysis = regexFallback(result.extractedText);
            result = {
              ...localAnalysis,
              extractedText: result.extractedText,
              source: "Local OCR Pattern Analysis",
            };
          }

          // Normalize multi-image result
          if (result && result.overallConcernLevel) {
            result = {
              concernLevel: result.overallConcernLevel,
              title: result.overallConcernLevel === "alert"
                ? "Concerning patterns detected across screenshots."
                : (result.overallConcernLevel === "watch" ? "Something worth noticing in these screenshots." : "No concerning patterns detected."),
              summary: result.imageResults?.map((r) => `${r.filename}: ${r.title || "Analyzed"}`).join(" · ") || "Screenshots analyzed.",
              signals: result.allSignals || [],
              source: result.imageResults?.[0]?.source || "vision",
              extractedText: result.extractedText,
            };
          }
        }

        // Display result
        const saveNote = buildSaveNote(result || { signals: [], concernLevel: "safe", title: "Screenshots saved locally" });

        if (result && typeof FILTR_AI !== "undefined") {
          output.innerHTML = FILTR_AI.formatResult(result, saveNote);
        } else {
          // Fallback: no AI available
          const count = uploadedFiles.length;
          output.innerHTML = `<strong>${count} screenshot${count > 1 ? "s" : ""} saved locally.</strong><p>Your images stay in this browser. AI analysis is not available right now. Try pasting the text in the "Paste text" tab for pattern analysis.</p>${saveNote}`;
        }
      } catch (err) {
        console.error("Photo analysis error:", err);
        const count = uploadedFiles.length;
        const saveNote = buildSaveNote({ signals: [], concernLevel: "safe", title: "Screenshots saved" });
        output.innerHTML = `<strong>${count} screenshot${count > 1 ? "s" : ""} saved locally.</strong><p>AI analysis encountered an error. Your images stay in this browser and were not sent anywhere.</p>${saveNote}`;
      }

      resetButton();
      return;
    }

    // ── Text Mode ──
    const text = $("#pasteReviewText").value.trim();
    if (!text) {
      notify("Paste some messages before reviewing.");
      return;
    }

    showLoading();

    try {
      // Try AI analysis first
      let result = null;
      if (typeof FILTR_AI !== "undefined") {
        result = await FILTR_AI.analyzeText(text);
      }

      // Fall back to regex if AI is unavailable
      if (!result) {
        result = regexFallback(text);
      }

      const saveNote = buildSaveNote(result);

      if (typeof FILTR_AI !== "undefined" && FILTR_AI.formatResult) {
        output.innerHTML = FILTR_AI.formatResult(result, saveNote);
      } else {
        output.innerHTML = `<strong>${result.title}</strong><p>${result.summary}</p>${saveNote}`;
      }
    } catch (err) {
      console.error("Text analysis error:", err);
      // Final fallback to regex
      const result = regexFallback(text);
      const saveNote = buildSaveNote(result);
      if (typeof FILTR_AI !== "undefined" && FILTR_AI.formatResult) {
        output.innerHTML = FILTR_AI.formatResult(result, saveNote);
      } else {
        output.innerHTML = `<strong>${result.title}</strong><p>${result.summary}</p>${saveNote}`;
      }
    }

    resetButton();
  });
}

document.querySelectorAll("[data-accordion]").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest("article");
    const open = item.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
});

/* ── Dynamic Timeline Loader for Signed-in Users ── */
(function initTimelinePage() {
  const userTimelineSection = document.getElementById("userTimelineSection");
  if (!userTimelineSection) return;

  const authBanner = document.getElementById("timelineAuthBanner");
  const loadingEl = document.getElementById("userTimelineLoading");
  const emptyEl = document.getElementById("userTimelineEmpty");
  const listEl = document.getElementById("userTimelineList");

  const loadUserReviews = async (user) => {
    if (!user) {
      if (authBanner) authBanner.hidden = false;
      userTimelineSection.hidden = true;
      return;
    }

    if (authBanner) authBanner.hidden = true;
    userTimelineSection.hidden = false;
    if (loadingEl) loadingEl.hidden = false;
    if (emptyEl) emptyEl.hidden = true;
    if (listEl) listEl.innerHTML = "";

    try {
      const db = window.FiltrAuth?.db || (typeof firebase !== "undefined" && firebase.firestore ? firebase.firestore() : null);
      if (!db) return;

      const snapshot = await db.collection("users").doc(user.uid).collection("reviews").get();
      if (loadingEl) loadingEl.hidden = true;

      if (snapshot.empty) {
        if (emptyEl) emptyEl.hidden = false;
        return;
      }

      const reviews = [];
      snapshot.forEach((doc) => {
        reviews.push({ id: doc.id, ...doc.data() });
      });

      // Sort client-side by timestamp descending
      reviews.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : (a.createdAt?.seconds ? a.createdAt.seconds * 1000 : 0);
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : (b.createdAt?.seconds ? b.createdAt.seconds * 1000 : 0);
        return timeB - timeA;
      });

      listEl.innerHTML = reviews
        .map((r) => {
          let dateStr = "Recently";
          if (r.createdAt?.toDate) {
            dateStr = r.createdAt.toDate().toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit"
            });
          }
          const badgeClass = r.concernLevel === "alert" ? "alert" : (r.concernLevel === "watch" ? "watch" : "safe");
          const signalsHtml = r.signals && r.signals.length
            ? `<div style="display:flex; flex-wrap:wrap; gap:6px; margin:10px 0 6px;">
                ${r.signals.map((s) => `<span style="font-size:9px; font-weight:800; padding:2px 8px; border-radius:3px; background:${badgeClass === "alert" ? "var(--tomato)" : "var(--amber)"}; color:#fff; text-transform:uppercase; letter-spacing:0.05em;">${s}</span>`).join("")}
              </div>`
            : "";

          return `
            <article class="timeline-step ${badgeClass}" id="review-${r.id}">
              <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:8px;">
                <span>${dateStr} · ${r.type === "screenshot" ? "Screenshot check-in" : "Text check-in"}</span>
                <button class="delete-review-btn" data-id="${r.id}" style="background:none; border:none; color:#888; font-size:10px; cursor:pointer; text-decoration:underline; padding:0; font-family:inherit;">Delete</button>
              </div>
              <h2>${r.title || "Check-in"}</h2>
              <p>${r.summary || ""}</p>
              ${signalsHtml}
              ${r.snippet ? `<div style="font-size:11px; color:#555; font-style:italic; margin-top:8px; background:rgba(0,0,0,0.03); padding:8px 12px; border-radius:3px; border-left:2px solid #ccc;">"${r.snippet}"</div>` : ""}
            </article>
          `;
        })
        .join("");

      // Wire delete buttons
      listEl.querySelectorAll(".delete-review-btn").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
          const docId = e.target.dataset.id;
          if (!confirm("Are you sure you want to delete this saved check-in?")) return;
          try {
            await db.collection("users").doc(user.uid).collection("reviews").doc(docId).delete();
            const stepEl = document.getElementById(`review-${docId}`);
            if (stepEl) stepEl.remove();
            if (listEl.children.length === 0 && emptyEl) emptyEl.hidden = false;
          } catch (err) {
            console.error("Error deleting review:", err);
          }
        });
      });
    } catch (err) {
      console.error("Error loading timeline reviews:", err);
      if (loadingEl) loadingEl.textContent = "Could not load saved reviews. Please check your connection.";
    }
  };

  if (typeof firebase !== "undefined" && firebase.auth) {
    firebase.auth().onAuthStateChanged(loadUserReviews);
  }
})();



