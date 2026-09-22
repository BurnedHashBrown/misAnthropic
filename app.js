const stages = [
  {
    messages: [
      {
        day: "Day 2",
        text: "I cannot believe how easy it is to talk to you. I feel like we really get each other.",
        from: "them",
      },
      {
        day: "Day 3",
        text: "I like it too. No rush, I am happy getting to know you.",
        from: "user",
      },
      {
        day: "Day 6",
        text: "The distance is annoying, but I would love to video call when we are both free.",
        from: "them",
      },
    ],
    status: "No concerning pattern yet",
    title: "A new connection can be exciting.",
    copy: "Early affection and distance alone are not warning signs. There is nothing to act on yet.",
    nudge:
      "Enjoy the conversation, and keep sharing only what feels right to you.",
    signals: ["Warmth", "Long-distance"],
    risk: false,
    button: "Show what happens next",
  },
  {
    messages: [
      {
        day: "Week 2",
        text: "I have not told anyone about us. People would not understand what this is yet. Can you keep it just between us?",
        from: "them",
      },
      {
        day: "Week 2",
        text: "Sure, I would rather keep it private for now too.",
        from: "user",
      },
    ],
    status: "A change worth noticing",
    title: "A request for secrecy appeared.",
    copy: "Privacy can be normal. But paired with intense attention, it is worth slowing down and keeping your support circle close.",
    nudge:
      "Before sharing more, consider mentioning this connection to one trusted person.",
    signals: ["Warmth", "Long-distance", "Secrecy request"],
    risk: true,
    button: "Keep checking in",
  },
  {
    messages: [
      {
        day: "Week 3",
        text: "Please do not send a regular photo. I want one that is only for me. If you trust me, you will not make me wait.",
        from: "them",
      },
      {
        day: "Week 3",
        text: "Also, I have a problem with my account right now. Could you help me with a small transfer? I will send it back tonight.",
        from: "them",
      },
    ],
    status: "Pause before you reply",
    title: "This is pressure, not proof of care.",
    copy: "The pattern now combines secrecy, an intimate image request, urgency, and money. That is a meaningful escalation.",
    nudge:
      "Do not send money, private images, codes, or IDs. Verify independently and talk to someone you trust.",
    signals: ["Secrecy request", "Intimate image pressure", "Urgent money ask"],
    risk: true,
    button: "Review the safety plan",
  },
];
document.addEventListener("DOMContentLoaded", () => {
const $ = (s) => document.querySelector(s),
  timeline = $("#timeline"),
  statusLabel = $("#statusLabel"),
  insightTitle = $("#insightTitle"),
  insightCopy = $("#insightCopy"),
  recommendationCopy = $("#recommendationCopy"),
  signalList = $("#signalList"),
  nextButton = $("#nextButton"),
  supportDialog = $("#supportDialog"),
  pulseBars = [...document.querySelectorAll(".pulse-visual span")];
let stageIndex = 0,
  watching = true;
function notice(title, message) {
  const n = document.createElement("article");
  n.className = "splash-notification";
  n.innerHTML = `<span class="splash-icon">!</span><div><strong>${title}</strong><p>${message}</p></div><button aria-label="Dismiss">×</button>`;
  $("#notificationStack").append(n);
  const remove = () => n.remove();
  n.querySelector("button").onclick = remove;
  setTimeout(remove, 7000);
}
function render() {
  const s = stages[stageIndex],
    shown = stages.slice(0, stageIndex + 1).flatMap((x) => x.messages);
  timeline.innerHTML = shown
    .map(
      (m, i) =>
        `<div class="message message-${m.from} ${stageIndex === 2 && i > 4 ? "alert" : ""}"><span class="message-day">${m.day}</span><div class="message-text">${m.text}</div></div>`,
    )
    .join("");
  timeline.scrollTop = timeline.scrollHeight;
  statusLabel.textContent = s.status;
  insightTitle.textContent = s.title;
  insightCopy.textContent = s.copy;
  recommendationCopy.textContent = s.nudge;
  signalList.innerHTML = s.signals
    .map(
      (x) =>
        `<span class="signal ${s.risk && !["Warmth", "Long-distance"].includes(x) ? "risk" : ""}">${x}</span>`,
    )
    .join("");
  document.body.classList.toggle("high-risk", s.risk);
  [
    [23, 35, 25, 44, 30],
    [28, 51, 37, 63, 45],
    [38, 75, 53, 92, 66],
  ][stageIndex].forEach((x, i) => (pulseBars[i].style.height = `${x}%`));
  nextButton.querySelector("span").textContent = s.button;
  if (stageIndex === 2)
    notice(
      "Pressure pattern detected",
      "Pause before sending money, private photos, codes, or ID.",
    );
}
function open(d) {
  if (!d.open) d.showModal();
}
nextButton.onclick = () => {
  stageIndex < 2 ? (stageIndex++, render()) : open(supportDialog);
};
$("#resetButton").onclick = () => {
  stageIndex = 0;
  render();
};
$("#helpButton").onclick = () => open(supportDialog);
$("#footerHelp").onclick = () => open(supportDialog);
$("#reviewPreviewButton").onclick = () => open(supportDialog);
$("#demoAlertButton").onclick = () =>
  notice(
    "A pattern is changing",
    "Secrecy and urgency appeared together. Take a moment before you reply.",
  );
$("#watchToggle").onclick = (e) => {
  watching = !watching;
  e.target.textContent = watching ? "Pause watch" : "Resume watch";
  $(".watch-state").classList.toggle("paused", !watching);
};
$("#closeDialog").onclick = () => supportDialog.close();
$("#closePlan").onclick = () => supportDialog.close();
$("#storyButton").onclick = () => open($("#infoDialog"));
$("#privacyButton").onclick = () => window.location.href = "privacy.html";
$("#closeInfo").onclick = () => $("#infoDialog").close();
$("#leaveButton").onclick = () => location.assign("https://www.google.com");
$("#copyPlan").onclick = async () => {
  const t =
    "I need to pause. I do not send money or private content online. I will only continue after we verify through a video call and a trusted channel.";
  try {
    await navigator.clipboard.writeText(t);
    $("#copyFeedback").textContent =
      "Pause message copied. You can change it to sound like you.";
  } catch {
    $("#copyFeedback").textContent =
      "Copy this instead: I need to pause. I do not send money or private content online.";
  }
};
$("#navToggle").onclick = (e) => {
  const x = e.currentTarget.getAttribute("aria-expanded") === "true";
  e.currentTarget.setAttribute("aria-expanded", String(!x));
  $(".toggle-nav").classList.toggle("nav-open", !x);
};
document.querySelectorAll("#primaryNav a").forEach(
  (a) =>
    (a.onclick = () => {
      $(".toggle-nav").classList.remove("nav-open");
      $("#navToggle").setAttribute("aria-expanded", "false");
    }),
);

const review = $("#reviewDialog");
const reviewButton = $("#reviewButton");
if (reviewButton && reviewButton.tagName === "BUTTON") {
  reviewButton.onclick = () => {
    window.location.href = "review.html";
  };
}
if ($("#closeReview") && review) $("#closeReview").onclick = () => review.close();
$("#analyzeButton").onclick = () => {
  const t = $("#reviewText").value.toLowerCase().trim(),
    err = $("#reviewError"),
    out = $("#reviewResult");
  if (!t) {
    err.textContent =
      "Paste a few messages before asking Filtr. to review them.";
    return;
  }
  err.textContent = "";
  const found = [
      [/money|transfer/, "money request"],
      [/secret|don't tell/, "secrecy request"],
      [/urgent|today/, "urgency"],
      [/photo|pic/, "private image request"],
    ]
      .filter(([r]) => r.test(t))
      .map(([, x]) => x),
    concern = found.length > 1;
  out.hidden = false;
  out.innerHTML = `<strong>${concern ? "Pause before replying." : "No escalation pattern found yet."}</strong><p>${concern ? `Filtr. noticed: ${found.join(", ")}. Consider verifying independently and involving someone you trust.` : "Warmth or distance alone does not mean danger. Keep your boundaries and check in again if pressure appears."}</p>`;
  if (concern)
    notice(
      "Review completed",
      "More than one pressure signal appeared in the messages you pasted.",
    );
};
const authModal = $("#authDialog");
const authButton = $("#authButton");
if (authButton && authModal) authButton.onclick = () => open(authModal);
if ($("#closeAuth") && authModal) $("#closeAuth").onclick = () => authModal.close();

render();
(function () {
  const dot = document.querySelector(".watch-state i");
  if (!dot) return;
  let on = true;
  setInterval(() => {
    if (document.querySelector(".watch-state.paused")) {
      dot.style.opacity = "1";
      dot.style.transform = "scale(1)";
      return;
    }
    on = !on;
    dot.style.opacity = on ? "1" : "0.35";
    dot.style.transform = on ? "scale(1)" : "scale(0.7)";
  }, 750);
})();
});
