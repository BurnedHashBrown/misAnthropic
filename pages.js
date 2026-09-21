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

    if (isPhotoMode) {
      if (uploadedFiles.length === 0) {
        notify("Upload at least one screenshot before reviewing.");
        return;
      }
      output.hidden = false;
      output.innerHTML = `<strong>${uploadedFiles.length} screenshot${uploadedFiles.length > 1 ? "s" : ""} saved locally.</strong><p>Your images stay in this browser and were not sent anywhere. If you see concerning messages in these screenshots, paste the text in the "Paste text" tab for pattern analysis.</p>`;
      return;
    }

    /* Text mode — existing keyword analysis */
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
    output.hidden = false;
    output.innerHTML = `<strong>${concern ? "Pause before replying." : "No combined pressure pattern found yet."}</strong><p>${concern ? `Filtr. noticed ${signals.join(", ")}. Save the messages, verify through a separate channel, and involve someone you trust.` : "Warmth or distance alone is not a warning. Keep your boundaries and review again if a request or pressure appears."}</p>`;
  });
}

document.querySelectorAll("[data-accordion]").forEach((button) => {
  button.addEventListener("click", () => {
    const item = button.closest("article");
    const open = item.classList.toggle("is-open");
    button.setAttribute("aria-expanded", String(open));
  });
});

const authForm = $("#accountForm");
if (authForm)
  authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    notify("Demo only: no account was created and no details were saved.");
  });
