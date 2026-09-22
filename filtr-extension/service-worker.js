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
    isWatching: true,
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

/**
 * Check if any WhatsApp Web tab is open and ensure content scripts are injected.
 * Automatically injects if the tab was opened before extension was loaded/reloaded.
 */
async function ensureContentScriptInjected() {
  try {
    const tabs = await chrome.tabs.query({ url: "*://web.whatsapp.com/*" });
    if (!tabs || tabs.length === 0) return false;

    let attached = false;
    for (const tab of tabs) {
      if (!tab.id) continue;
      try {
        const res = await chrome.tabs.sendMessage(tab.id, { type: "PING" });
        if (res && res.ok) {
          attached = true;
          continue;
        }
      } catch {
        /* Not responding or not yet injected — inject dynamically */
        try {
          if (chrome.scripting && chrome.scripting.executeScript) {
            await chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [
                "platform-config.js",
                "content-scripts/extractor.js",
                "content-scripts/observer.js",
              ],
            });
            attached = true;
          }
        } catch (injErr) {
          console.debug("Filtr: Injection error for tab", tab.id, injErr);
        }
      }
    }

    if (attached) {
      const state = await getState();
      if (!state.platform) {
        state.platform = "WhatsApp Web";
        state.isWatching = true;
        await saveState(state);
        await updateBadge(state.assessment?.concernLevel || "watching");
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
      return true;
    }
  } catch (err) {
    console.debug("Filtr: Error checking open tabs", err);
  }
  return false;
}

/* ── Message Handlers ──────────────────────────────────────────────────────── */

/**
 * Handle new messages from a content script.
 */
async function handleNewMessages(data) {
  const state = await getState();
  if (data.platform) {
    state.platform = data.platform;
  } else if (!state.platform) {
    state.platform = "WhatsApp Web";
  }
  state.isWatching = true;

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
    await chrome.action.setBadgeText({ text: "⚠" });
  }
}

/**
 * Handle watch started signal from content script.
 */
async function handleWatchStarted(data) {
  const state = await getState();
  state.isWatching = true;
  state.platform = data.platform || "WhatsApp Web";
  state.lastUpdated = Date.now();
  await saveState(state);
  await updateBadge(state.assessment?.concernLevel || "watching");

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
        await ensureContentScriptInjected();
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
          isWatching: true,
          platform: null,
          signalHistory: [],
          assessment: null,
          messageCount: 0,
          lastUpdated: null,
        });
        await updateBadge("watching");

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

/* ── Tab Lifecycle Listeners ───────────────────────────────────────────────── */

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url && tab.url.includes("web.whatsapp.com")) {
    ensureContentScriptInjected();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (tab && tab.url && tab.url.includes("web.whatsapp.com")) {
      ensureContentScriptInjected();
    }
  } catch {
    /* tab closed or inaccessible */
  }
});

/* ── Install / Update ──────────────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getState();
  state.isWatching = true;
  await saveState(state);
  await updateBadge(state.assessment?.concernLevel || "watching");
  await ensureContentScriptInjected();
});
