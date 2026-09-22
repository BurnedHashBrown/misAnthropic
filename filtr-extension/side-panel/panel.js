/**
 * Filtr. Side Panel — Logic
 * Reads state from chrome.storage, renders the insight panel, handles user interactions.
 */

(() => {
  "use strict";

  /* ── DOM References ────────────────────────────────────────────────────── */
  const $ = (s) => document.querySelector(s);
  const watchBar = $("#watchBar");
  const watchLabel = $("#watchLabel");
  const watchToggle = $("#watchToggle");
  const insightSection = $("#insightSection");
  const statusOrb = $("#statusOrb");
  const statusLabel = $("#statusLabel");
  const insightTitle = $("#insightTitle");
  const insightCopy = $("#insightCopy");
  const signalList = $("#signalList");
  const recommendationBlock = $("#recommendationBlock");
  const recommendationCopy = $("#recommendationCopy");
  const messageCount = $("#messageCount");
  const helpButton = $("#helpButton");
  const safetyPlan = $("#safetyPlan");
  const backButton = $("#backButton");
  const copyPlan = $("#copyPlan");
  const closePlan = $("#closePlan");
  const copyFeedback = $("#copyFeedback");
  const resetButton = $("#resetButton");
  const pulseBars = [...document.querySelectorAll(".pulse-visual span")];

  /* ── Pulse Heights by Risk Level ───────────────────────────────────────── */
  const PULSE_HEIGHTS = {
    safe: [23, 35, 25, 44, 30],
    watch: [28, 51, 37, 63, 45],
    alert: [38, 75, 53, 92, 66],
  };

  /* Benign signals that should not get the .risk class */
  const BENIGN_LABELS = new Set(["Warmth", "Long-distance"]);

  /* ── Render ────────────────────────────────────────────────────────────── */

  function render(state) {
    const { assessment, isWatching, messageCount: count, platform } = state;

    /* Watch bar */
    watchBar.classList.toggle("paused", !isWatching);
    watchToggle.textContent = isWatching ? "Pause" : "Resume";

    if (!isWatching) {
      watchLabel.textContent = "Watch is paused";
    } else if (platform) {
      watchLabel.textContent = `Watching · ${platform}`;
    } else {
      watchLabel.textContent = "Waiting for WhatsApp Web…";
    }

    /* Message count */
    messageCount.textContent = `${count || 0} message${count !== 1 ? "s" : ""} checked`;

    /* If no assessment yet, show default state */
    if (!assessment) {
      insightSection.className = "insight-section level-safe";
      statusLabel.textContent = platform ? "Watching for pressure patterns" : "Waiting for chat page";
      insightTitle.textContent = platform
        ? "Open a conversation to start."
        : "Open WhatsApp Web in Chrome to start";
      insightCopy.textContent = platform
        ? "Filtr. watches for patterns like secrecy, urgency, money requests, and image pressure. It stays quiet until combinations appear."
        : "Filtr Live Watch monitors conversations on web.whatsapp.com inside Chrome. Open or refresh your WhatsApp Web tab to begin.";
      signalList.innerHTML = "";
      recommendationBlock.hidden = true;
      pulseBars.forEach((b) => (b.style.height = "25%"));
      return;
    }

    /* Apply risk-level class */
    insightSection.className = `insight-section level-${assessment.concernLevel}`;

    /* Status */
    const statusTexts = {
      safe: "No concerning pattern yet",
      watch: "A change worth noticing",
      alert: "Pause before you reply",
    };
    statusLabel.textContent =
      statusTexts[assessment.concernLevel] || statusTexts.safe;

    /* Title and copy */
    insightTitle.textContent = assessment.title;
    insightCopy.textContent = assessment.summary;

    /* Signals */
    if (assessment.signals && assessment.signals.length > 0) {
      signalList.innerHTML = assessment.signals
        .map((s) => {
          const isRisk =
            assessment.concernLevel !== "safe" && !BENIGN_LABELS.has(s);
          return `<span class="signal ${isRisk ? "risk" : ""}">${s}</span>`;
        })
        .join("");
    } else {
      signalList.innerHTML = "";
    }

    /* Recommendation */
    if (assessment.nudge) {
      recommendationBlock.hidden = false;
      recommendationCopy.textContent = assessment.nudge;
    } else {
      recommendationBlock.hidden = true;
    }

    /* Pulse bars */
    const heights =
      PULSE_HEIGHTS[assessment.concernLevel] || PULSE_HEIGHTS.safe;
    heights.forEach((h, i) => {
      if (pulseBars[i]) pulseBars[i].style.height = `${h}%`;
    });
  }

  /* ── Load State ────────────────────────────────────────────────────────── */

  async function loadState() {
    try {
      const state = await chrome.runtime.sendMessage({ type: "GET_STATE" });
      render(state);
    } catch (err) {
      console.warn("Filtr panel: Could not load state", err);
    }
  }

  /* ── Event Handlers ────────────────────────────────────────────────────── */

  /* Toggle watch on/off */
  watchToggle.addEventListener("click", async () => {
    try {
      const result = await chrome.runtime.sendMessage({ type: "TOGGLE_WATCH" });
      await loadState();
    } catch (err) {
      console.warn("Filtr panel: Toggle failed", err);
    }
  });

  /* Open safety plan */
  helpButton.addEventListener("click", () => {
    insightSection.hidden = true;
    safetyPlan.hidden = false;
  });

  /* Back from safety plan */
  backButton.addEventListener("click", () => {
    safetyPlan.hidden = true;
    insightSection.hidden = false;
  });

  /* Close safety plan */
  closePlan.addEventListener("click", () => {
    safetyPlan.hidden = true;
    insightSection.hidden = false;
  });

  /* Copy pause message */
  copyPlan.addEventListener("click", async () => {
    const pauseMessage =
      "I need to pause. I do not send money or private content online. I will only continue after we verify through a video call and a trusted channel.";
    try {
      await navigator.clipboard.writeText(pauseMessage);
      copyFeedback.textContent =
        "Pause message copied. You can change it to sound like you.";
    } catch {
      copyFeedback.textContent =
        "Copy this instead: I need to pause. I do not send money or private content online.";
    }
    setTimeout(() => {
      copyFeedback.textContent = "";
    }, 5000);
  });

  /* Reset all data */
  resetButton.addEventListener("click", async () => {
    if (!confirm("Clear all Filtr. data? This removes signal history and resets the watch.")) {
      return;
    }
    try {
      await chrome.runtime.sendMessage({ type: "RESET_ALL" });
      await loadState();
    } catch (err) {
      console.warn("Filtr panel: Reset failed", err);
    }
  });

  /* ── Listen for State Updates from Service Worker ──────────────────────── */

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "STATE_UPDATED") {
      loadState();
    }
    return false;
  });

  /* ── Initial Load & Auto-Sync ─────────────────────────────────────────── */
  loadState();
  window.addEventListener("focus", loadState);
  setInterval(loadState, 2000);
})();
