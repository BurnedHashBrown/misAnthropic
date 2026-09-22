/**
 * Filtr. Service Worker (Background Script)
 * Orchestrates message analysis, state management, and badge updates.
 * All state is stored in chrome.storage.local — never in global variables.
 */

import { analyzeMessages } from "./pattern-engine.js";

/* ── Badge Config ──────────────────────────────────────────────────────────── */
const BADGE_STATES = {
  idle: { text: "", color: "#888888" },
  watching: { text: "●", color: "#2D8A4E" },
  safe: { text: "●", color: "#2D8A4E" },
  watch: { text: "!", color: "#FFBC0D" },
  alert: { text: "⚠", color: "#E8503A" },
};

/**
 * Update the extension badge based on concern level.
 * @param {string} level - "idle" | "safe" | "watch" | "alert"
 */
async function updateBadge(level) {
  const badge = BADGE_STATES[level] || BADGE_STATES.idle;
  await chrome.action.setBadgeText({ text: badge.text });
  await chrome.action.setBadgeBackgroundColor({ color: badge.color });
}

/**
 * Get the current watch state from storage.
 */
async function getState() {
  const defaults = {
    isWatching: false,
    platform: null,
    signalHistory: [],
    assessment: null,
    messageCount: 0,
    lastUpdated: null,
  };
  const stored = await chrome.storage.local.get("filtrState");
  return { ...defaults, ...(stored.filtrState || {}) };
}

/**
 * Save watch state to storage.
 */
async function saveState(state) {
  await chrome.storage.local.set({ filtrState: state });
}

/* ── Message Handlers ──────────────────────────────────────────────────────── */

/**
 * Handle new messages from a content script.
 */
async function handleNewMessages(data) {
  const state = await getState();
  if (!state.isWatching) return;

  const { assessment, signalHistory } = analyzeMessages(
    data.messages,
    state.signalHistory
  );

  state.signalHistory = signalHistory;
  state.assessment = assessment;
  state.messageCount += data.messages.length;
  state.lastUpdated = Date.now();

  await saveState(state);
  await updateBadge(assessment.concernLevel);

  /* Notify the side panel (if open) */
  try {
    await chrome.runtime.sendMessage({
      type: "STATE_UPDATED",
      assessment,
      messageCount: state.messageCount,
      signalHistory: state.signalHistory,
    });
  } catch {
    /* Side panel not open — that's fine */
  }

  /* Show notification on alert level */
  if (assessment.concernLevel === "alert") {
    /* Use badge flash for notification since chrome.notifications needs icon files */
    await chrome.action.setBadgeText({ text: "⚠" });
  }
}

/**
 * Handle watch started signal from content script.
 */
async function handleWatchStarted(data) {
  const state = await getState();
  state.isWatching = true;
  state.platform = data.platform;
  state.lastUpdated = Date.now();
  await saveState(state);
  await updateBadge("watching");

  /* Notify the side panel (if open) */
  try {
    await chrome.runtime.sendMessage({
      type: "STATE_UPDATED",
      assessment: state.assessment,
      messageCount: state.messageCount,
      signalHistory: state.signalHistory,
    });
  } catch {
    /* Side panel not open */
  }
}

/* ── Side Panel Open Trigger ───────────────────────────────────────────────── */

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

/* ── Message Listener ──────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.type) {
      case "NEW_MESSAGES":
        await handleNewMessages(message);
        sendResponse({ ok: true });
        break;

      case "WATCH_STARTED":
        await handleWatchStarted(message);
        sendResponse({ ok: true });
        break;

      case "GET_STATE": {
        const state = await getState();
        sendResponse(state);
        break;
      }

      case "TOGGLE_WATCH": {
        const st = await getState();
        st.isWatching = !st.isWatching;
        await saveState(st);
        await updateBadge(st.isWatching ? (st.assessment?.concernLevel || "watching") : "idle");

        /* Tell content scripts to pause/resume */
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, {
              type: st.isWatching ? "RESUME_WATCH" : "PAUSE_WATCH",
            });
          } catch {
            /* Tab doesn't have content script */
          }
        }
        sendResponse({ isWatching: st.isWatching });
        break;
      }

      case "RESET_ALL": {
        await saveState({
          isWatching: false,
          platform: null,
          signalHistory: [],
          assessment: null,
          messageCount: 0,
          lastUpdated: null,
        });
        await updateBadge("idle");

        /* Tell content scripts to reset */
        const allTabs = await chrome.tabs.query({});
        for (const tab of allTabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { type: "RESET_WATCH" });
          } catch {
            /* Tab doesn't have content script */
          }
        }
        sendResponse({ ok: true });
        break;
      }

      default:
        sendResponse({ error: "Unknown message type" });
    }
  })();
  return true; /* Keep channel open for async response */
});

/* ── Install / Update ──────────────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await saveState({
      isWatching: false,
      platform: null,
      signalHistory: [],
      assessment: null,
      messageCount: 0,
      lastUpdated: null,
    });
    await updateBadge("idle");
  }
});
