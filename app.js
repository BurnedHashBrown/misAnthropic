const stages = [
  {
    messages: [
      { day: "Day 2", text: "I cannot believe how easy it is to talk to you. I feel like we really get each other.", from: "them" },
      { day: "Day 3", text: "I like it too. No rush, I am happy getting to know you.", from: "user" },
      { day: "Day 6", text: "The distance is annoying, but I would love to video call when we are both free.", from: "them" }
    ],
    status: "No concerning pattern yet",
    title: "A new connection can be exciting.",
    copy: "Early affection and distance alone are not warning signs. There is nothing to act on yet.",
    nudge: "Enjoy the conversation, and keep sharing only what feels right to you.",
    signals: ["Warmth", "Long-distance"],
    risk: false,
    button: "Show what happens next"
  },
  {
    messages: [
      { day: "Week 2", text: "I have not told anyone about us. People would not understand what this is yet. Can you keep it just between us?", from: "them" },
      { day: "Week 2", text: "Sure, I would rather keep it private for now too.", from: "user" }
    ],
    status: "A change worth noticing",
    title: "A request for secrecy appeared.",
    copy: "Privacy can be normal. But paired with intense attention, it is worth slowing down and keeping your support circle close.",
    nudge: "Before sharing more, consider mentioning this connection to one trusted person.",
    signals: ["Warmth", "Long-distance", "Secrecy request"],
    risk: true,
    button: "Keep checking in"
  },
  {
    messages: [
      { day: "Week 3", text: "Please do not send a regular photo. I want one that is only for me. If you trust me, you will not make me wait.", from: "them" },
      { day: "Week 3", text: "Also, I have a problem with my account right now. Could you help me with a small transfer? I will send it back tonight.", from: "them" }
    ],
    status: "Pause before you reply",
    title: "This is pressure, not proof of care.",
    copy: "The pattern now combines secrecy, an intimate image request, urgency, and money. That is a meaningful escalation.",
    nudge: "Do not send money, private images, codes, or IDs. Verify independently and talk to someone you trust.",
    signals: ["Secrecy request", "Intimate image pressure", "Urgent money ask"],
    risk: true,
    button: "Review the safety plan"
  }
];

const timeline = document.querySelector("#timeline");
const nextButton = document.querySelector("#nextButton");
const resetButton = document.querySelector("#resetButton");
const statusLabel = document.querySelector("#statusLabel");
const insightTitle = document.querySelector("#insightTitle");
const insightCopy = document.querySelector("#insightCopy");
const recommendationCopy = document.querySelector("#recommendationCopy");
const signalList = document.querySelector("#signalList");
const supportDialog = document.querySelector("#supportDialog");
const infoDialog = document.querySelector("#infoDialog");
const pulseBars = [...document.querySelectorAll(".pulse-visual span")];
let stageIndex = 0;

function render() {
  const stage = stages[stageIndex];
  const shown = stages.slice(0, stageIndex + 1).flatMap(item => item.messages);
  timeline.innerHTML = shown.map((message, index) => `
    <div class="message message-${message.from} ${stageIndex === 2 && index > 4 ? "alert" : ""}">
      <span class="message-day">${message.day}</span>
      <div class="message-text">${message.text}</div>
    </div>`).join("");
  timeline.scrollTop = timeline.scrollHeight;
  statusLabel.textContent = stage.status;
  insightTitle.textContent = stage.title;
  insightCopy.textContent = stage.copy;
  recommendationCopy.textContent = stage.nudge;
  signalList.innerHTML = stage.signals.map(signal => `<span class="signal ${stage.risk && !["Warmth", "Long-distance"].includes(signal) ? "risk" : ""}">${signal}</span>`).join("");
  document.body.classList.toggle("high-risk", stage.risk);
  pulseBars.forEach((bar, index) => { bar.style.height = `${stageIndex === 0 ? [23, 35, 25, 44, 30][index] : stageIndex === 1 ? [28, 51, 37, 63, 45][index] : [38, 75, 53, 92, 66][index]}%`; });
  nextButton.textContent = stage.button;
}

nextButton.addEventListener("click", () => {
  if (stageIndex < stages.length - 1) { stageIndex += 1; render(); }
  else { supportDialog.showModal(); }
});
resetButton.addEventListener("click", () => { stageIndex = 0; render(); });
document.querySelector("#helpButton").addEventListener("click", () => supportDialog.showModal());
document.querySelector("#footerHelp").addEventListener("click", () => supportDialog.showModal());
document.querySelector("#closeDialog").addEventListener("click", () => supportDialog.close());
document.querySelector("#closePlan").addEventListener("click", () => supportDialog.close());
document.querySelector("#storyButton").addEventListener("click", () => infoDialog.showModal());
document.querySelector("#privacyButton").addEventListener("click", () => infoDialog.showModal());
document.querySelector("#closeInfo").addEventListener("click", () => infoDialog.close());
document.querySelector("#leaveButton").addEventListener("click", () => { window.location.href = "https://www.google.com"; });
document.querySelector("#copyPlan").addEventListener("click", async () => {
  const feedback = document.querySelector("#copyFeedback");
  const message = "I need to pause. I do not send money or private content online. I will only continue after we verify through a video call and a trusted channel.";
  try { await navigator.clipboard.writeText(message); feedback.textContent = "Pause message copied. You can change it to sound like you."; }
  catch { feedback.textContent = "Copy this instead: “I need to pause. I do not send money or private content online.”"; }
});
render();
