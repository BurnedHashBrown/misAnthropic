const $ = (selector) => document.querySelector(selector);

function notify(text) {
  const notice = $("#pageNotice");
  if (!notice) return;
  notice.textContent = text;
  notice.hidden = false;
  clearTimeout(window.filtrNoticeTimer);
  window.filtrNoticeTimer = setTimeout(() => { notice.hidden = true; }, 5000);
}

const reviewForm = $("#pasteReviewForm");
if (reviewForm) {
  reviewForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = $("#pasteReviewText").value.trim().toLowerCase();
    const output = $("#pasteReviewOutput");
    if (!text) { notify("Paste some messages before reviewing."); return; }
    const checks = [[/money|transfer|gift card|crypto/, "a money request"], [/secret|don't tell|between us/, "a secrecy request"], [/urgent|today|right now|immediately/, "urgency"], [/photo|pic|nude|image/, "private-image pressure"]];
    const signals = checks.filter(([pattern]) => pattern.test(text)).map(([, label]) => label);
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
if (authForm) authForm.addEventListener("submit", (event) => { event.preventDefault(); notify("Demo only: no account was created and no details were saved."); });
