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
  reviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const output = $("#pasteReviewOutput");
    const isPhotoMode = tabPhotos.classList.contains("active");
    const user = window.FiltrAuth?.getUser() || (typeof firebase !== "undefined" && firebase.auth ? firebase.auth().currentUser : null);
    const db = window.FiltrAuth?.db || (typeof firebase !== "undefined" && firebase.firestore ? firebase.firestore() : null);

    if (isPhotoMode) {
      if (uploadedFiles.length === 0) {
        notify("Upload at least one screenshot before reviewing.");
        return;
      }
      output.hidden = false;
      const count = uploadedFiles.length;

      let saveNote = "";
      if (user && db) {
        saveNote = `
          <div class="save-status" style="margin-top:16px; padding:12px 14px; background:rgba(0,0,0,0.04); border-left:3px solid var(--tomato); font-size:11px; display:flex; justify-content:space-between; align-items:center;">
            <span>✓ <strong>Saved check-in to your private timeline.</strong></span>
            <a href="timeline.html" style="font-weight:800; text-decoration:underline; text-transform:uppercase; letter-spacing:0.04em;">View Timeline →</a>
          </div>
        `;
        db.collection("users").doc(user.uid).collection("reviews").add({
          type: "screenshot",
          photoCount: count,
          signals: [],
          concernLevel: "safe",
          title: `${count} screenshot${count > 1 ? "s" : ""} reviewed`,
          summary: "Screenshots kept securely in your local browser and logged in your private timeline.",
          snippet: `${count} file${count > 1 ? "s" : ""}: ${uploadedFiles.map((f) => f.name).slice(0, 3).join(", ")}`,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch((err) => console.warn("Could not save screenshot review:", err));
      } else {
        saveNote = `
          <div class="save-status" style="margin-top:16px; padding:12px 14px; background:rgba(255,188,13,0.12); border-left:3px solid var(--amber); font-size:11px;">
            Want to save your check-ins to track patterns over time? <a href="login.html" style="font-weight:800; text-decoration:underline;">Log in</a> or <a href="signup.html" style="font-weight:800; text-decoration:underline;">sign up</a>.
          </div>
        `;
      }

      output.innerHTML = `<strong>${count} screenshot${count > 1 ? "s" : ""} saved locally.</strong><p>Your images stay in this browser and were not sent anywhere. If you see concerning messages in these screenshots, paste the text in the "Paste text" tab for pattern analysis.</p>${saveNote}`;
      return;
    }

    /* Text mode — pattern analysis */
    const text = $("#pasteReviewText").value.trim().toLowerCase();
    if (!text) {
      notify("Paste some messages before reviewing.");
      return;
    }
    const checks = [
      [/money|transfer|gift card|crypto/, "a money request"],
      [/secret|don't tell|between us/, "a secrecy request"],
      [/urgent|today|right now|immediately/, "urgency"],
      [/photo|pic|nude|image/, "private-image pressure"],
    ];
    const signals = checks
      .filter(([pattern]) => pattern.test(text))
      .map(([, label]) => label);
    const concern = signals.length > 1;
    const concernLevel = concern ? "alert" : (signals.length === 1 ? "watch" : "safe");
    const title = concern ? "Pause before replying." : (signals.length === 1 ? "A signal worth noticing." : "No combined pressure pattern found yet.");
    const summary = concern
      ? `Filtr. noticed ${signals.join(", ")}. Save the messages, verify through a separate channel, and involve someone you trust.`
      : (signals.length === 1
        ? `Filtr. noticed ${signals[0]}. Keep your boundaries and observe how the conversation develops.`
        : "Warmth or distance alone is not a warning. Keep your boundaries and review again if a request or pressure appears.");

    let saveNote = "";
    if (user && db) {
      saveNote = `
        <div class="save-status" style="margin-top:16px; padding:12px 14px; background:rgba(0,0,0,0.04); border-left:3px solid var(--tomato); font-size:11px; display:flex; justify-content:space-between; align-items:center;">
          <span>✓ <strong>Saved check-in to your private timeline.</strong></span>
          <a href="timeline.html" style="font-weight:800; text-decoration:underline; text-transform:uppercase; letter-spacing:0.04em;">View Timeline →</a>
        </div>
      `;
      db.collection("users").doc(user.uid).collection("reviews").add({
        type: "text",
        signals: signals,
        concernLevel: concernLevel,
        title: title,
        summary: summary,
        snippet: text.length > 140 ? text.slice(0, 140) + "..." : text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).catch((err) => console.warn("Could not save review to Firestore:", err));
    } else {
      saveNote = `
        <div class="save-status" style="margin-top:16px; padding:12px 14px; background:rgba(255,188,13,0.12); border-left:3px solid var(--amber); font-size:11px;">
          Want to save your check-ins to track patterns over time? <a href="login.html" style="font-weight:800; text-decoration:underline;">Log in</a> or <a href="signup.html" style="font-weight:800; text-decoration:underline;">sign up</a>.
        </div>
      `;
    }

    output.hidden = false;
    output.innerHTML = `<strong>${title}</strong><p>${summary}</p>${saveNote}`;
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



