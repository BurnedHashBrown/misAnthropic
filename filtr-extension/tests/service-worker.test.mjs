import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Mock Chrome Extension API
function createMockChrome() {
  let storageData = {};
  let badgeText = "";
  let badgeColor = "";
  let sidePanelBehavior = null;
  const messageListeners = [];
  const installListeners = [];
  const sentRuntimeMessages = [];
  const sentTabMessages = [];

  const mockTabs = [{ id: 101, url: "https://web.whatsapp.com/" }];

  const chrome = {
    storage: {
      local: {
        get: async (key) => {
          if (typeof key === "string") {
            return { [key]: storageData[key] };
          }
          return storageData;
        },
        set: async (obj) => {
          storageData = { ...storageData, ...obj };
        },
        _getData: () => storageData,
      },
    },
    action: {
      setBadgeText: async ({ text }) => {
        badgeText = text;
      },
      setBadgeBackgroundColor: async ({ color }) => {
        badgeColor = color;
      },
      _getBadge: () => ({ text: badgeText, color: badgeColor }),
    },
    sidePanel: {
      setPanelBehavior: async (config) => {
        sidePanelBehavior = config;
      },
      _getBehavior: () => sidePanelBehavior,
    },
    tabs: {
      query: async () => mockTabs,
      sendMessage: async (tabId, msg) => {
        sentTabMessages.push({ tabId, msg });
        return { ok: true };
      },
      _getSentTabMessages: () => sentTabMessages,
    },
    runtime: {
      onMessage: {
        addListener: (fn) => {
          messageListeners.push(fn);
        },
      },
      onInstalled: {
        addListener: (fn) => {
          installListeners.push(fn);
        },
      },
      sendMessage: async (msg) => {
        sentRuntimeMessages.push(msg);
        return { ok: true };
      },
      _getSentRuntimeMessages: () => sentRuntimeMessages,
      _dispatchMessage: (message, sender = {}) => {
        return new Promise((resolve) => {
          for (const listener of messageListeners) {
            const keepOpen = listener(message, sender, resolve);
            if (!keepOpen) resolve(undefined);
          }
        });
      },
      _triggerInstall: async (reason = "install") => {
        for (const listener of installListeners) {
          await listener({ reason });
        }
      },
    },
  };

  return chrome;
}

test("Service Worker — install initializes empty state and idle badge", async () => {
  const mockChrome = createMockChrome();
  const swCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/service-worker.js", "utf8");

  // Load pattern-engine
  const { analyzeMessages } = await import("../pattern-engine.js");

  // Service worker runs in an environment with chrome and imported analyzeMessages
  const fn = new Function("chrome", "analyzeMessages", swCode.replace(/import\s+.*?;/, ""));
  fn(mockChrome, analyzeMessages);

  // Trigger onInstalled
  await mockChrome.runtime._triggerInstall("install");

  const state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.ok(state);
  assert.equal(state.isWatching, false);
  assert.equal(state.messageCount, 0);
  assert.deepEqual(state.signalHistory, []);

  const badge = mockChrome.action._getBadge();
  assert.equal(badge.text, "");
  assert.equal(badge.color, "#888888");
});

test("Service Worker — handles WATCH_STARTED and updates badge to watching", async () => {
  const mockChrome = createMockChrome();
  const swCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/service-worker.js", "utf8");
  const { analyzeMessages } = await import("../pattern-engine.js");
  const fn = new Function("chrome", "analyzeMessages", swCode.replace(/import\s+.*?;/, ""));
  fn(mockChrome, analyzeMessages);

  const res = await mockChrome.runtime._dispatchMessage({
    type: "WATCH_STARTED",
    platform: "WhatsApp Web",
  });
  assert.deepEqual(res, { ok: true });

  const state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.equal(state.isWatching, true);
  assert.equal(state.platform, "WhatsApp Web");

  const badge = mockChrome.action._getBadge();
  assert.equal(badge.text, "●");
  assert.equal(badge.color, "#2D8A4E");
});

test("Service Worker — analyzes messages and updates badge to watch/alert", async () => {
  const mockChrome = createMockChrome();
  const swCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/service-worker.js", "utf8");
  const { analyzeMessages } = await import("../pattern-engine.js");
  const fn = new Function("chrome", "analyzeMessages", swCode.replace(/import\s+.*?;/, ""));
  fn(mockChrome, analyzeMessages);

  // Start watch
  await mockChrome.runtime._dispatchMessage({
    type: "WATCH_STARTED",
    platform: "WhatsApp Web",
  });

  // Batch 1: Single watch signal (e.g. secrecy)
  await mockChrome.runtime._dispatchMessage({
    type: "NEW_MESSAGES",
    messages: [
      { text: "Keep this secret between us.", sender: "them" },
    ],
  });

  let state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.equal(state.messageCount, 1);
  assert.equal(state.assessment.concernLevel, "watch");

  let badge = mockChrome.action._getBadge();
  assert.equal(badge.text, "!");
  assert.equal(badge.color, "#FFBC0D");

  // Batch 2: Urgent money request -> escalates to alert level
  await mockChrome.runtime._dispatchMessage({
    type: "NEW_MESSAGES",
    messages: [
      { text: "Can you wire me 500 dollars right now via gift card?", sender: "them" },
    ],
  });

  state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.equal(state.messageCount, 2);
  assert.equal(state.assessment.concernLevel, "alert");

  badge = mockChrome.action._getBadge();
  assert.equal(badge.text, "⚠");
  assert.equal(badge.color, "#E8503A");

  // Verify side panel received STATE_UPDATED broadcasts
  const runtimeMsgs = mockChrome.runtime._getSentRuntimeMessages();
  const updateMsgs = runtimeMsgs.filter((m) => m.type === "STATE_UPDATED");
  assert.ok(updateMsgs.length >= 2, "Should broadcast STATE_UPDATED to side panel");
});

test("Service Worker — handles TOGGLE_WATCH (pause and resume)", async () => {
  const mockChrome = createMockChrome();
  const swCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/service-worker.js", "utf8");
  const { analyzeMessages } = await import("../pattern-engine.js");
  const fn = new Function("chrome", "analyzeMessages", swCode.replace(/import\s+.*?;/, ""));
  fn(mockChrome, analyzeMessages);

  await mockChrome.runtime._dispatchMessage({
    type: "WATCH_STARTED",
    platform: "WhatsApp Web",
  });

  // Toggle to pause
  const pauseRes = await mockChrome.runtime._dispatchMessage({ type: "TOGGLE_WATCH" });
  assert.equal(pauseRes.isWatching, false);

  let state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.equal(state.isWatching, false);

  let tabMsgs = mockChrome.tabs._getSentTabMessages();
  assert.ok(tabMsgs.some((m) => m.msg.type === "PAUSE_WATCH"));

  // Toggle to resume
  const resumeRes = await mockChrome.runtime._dispatchMessage({ type: "TOGGLE_WATCH" });
  assert.equal(resumeRes.isWatching, true);

  state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.equal(state.isWatching, true);

  tabMsgs = mockChrome.tabs._getSentTabMessages();
  assert.ok(tabMsgs.some((m) => m.msg.type === "RESUME_WATCH"));
});

test("Service Worker — handles RESET_ALL and clears storage and badge", async () => {
  const mockChrome = createMockChrome();
  const swCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/service-worker.js", "utf8");
  const { analyzeMessages } = await import("../pattern-engine.js");
  const fn = new Function("chrome", "analyzeMessages", swCode.replace(/import\s+.*?;/, ""));
  fn(mockChrome, analyzeMessages);

  // Put some data in
  await mockChrome.runtime._dispatchMessage({
    type: "WATCH_STARTED",
    platform: "WhatsApp Web",
  });
  await mockChrome.runtime._dispatchMessage({
    type: "NEW_MESSAGES",
    messages: [{ text: "Send me dollars", sender: "them" }],
  });

  // Reset
  const resetRes = await mockChrome.runtime._dispatchMessage({ type: "RESET_ALL" });
  assert.deepEqual(resetRes, { ok: true });

  const state = (await mockChrome.storage.local.get("filtrState")).filtrState;
  assert.equal(state.isWatching, false);
  assert.equal(state.platform, null);
  assert.deepEqual(state.signalHistory, []);
  assert.equal(state.assessment, null);
  assert.equal(state.messageCount, 0);

  const badge = mockChrome.action._getBadge();
  assert.equal(badge.text, "");

  const tabMsgs = mockChrome.tabs._getSentTabMessages();
  assert.ok(tabMsgs.some((m) => m.msg.type === "RESET_WATCH"));
});
