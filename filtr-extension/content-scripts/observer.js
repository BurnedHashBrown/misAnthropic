/**
 * Filtr. Content Script — MutationObserver & Real-Time Scanner
 * Continuously watches for messages on web.whatsapp.com and reports
 * them to the Filtr service worker for on-device pattern analysis.
 */

(() => {
  "use strict";

  if (window.__FILTR_OBSERVER_ACTIVE) {
    return;
  }
  window.__FILTR_OBSERVER_ACTIVE = true;

  const DEBOUNCE_DELAY = 250; /* ms — debounce DOM mutation bursts */
  const HEARTBEAT_INTERVAL = 1200; /* ms — periodic scan for virtualized scrolling / chat switches */
  const MAX_BATCH_SIZE = 50; /* max messages to process in a single batch */

  let config = null;
  let isWatching = true;
  let debounceTimer = null;
  let heartbeatTimer = null;
  let currentChatTitle = null;

  /* Track processed message keys to avoid duplicate processing */
  const processedKeys = new Set();

  /**
   * Find candidate message bubble elements across WhatsApp Web using
   * multiple redundant selector layers without duplicating containers.
   * @returns {Element[]}
   */
  function findMessages() {
    const seen = new Set();
    const messageElements = [];

    function addElement(el) {
      if (!el || seen.has(el)) return;
      /* Ignore footer compose input or emoji picker elements */
      if (el.closest && el.closest("footer")) return;
      seen.add(el);
      messageElements.push(el);
    }

    /* Strategy 1: WhatsApp's internal data-id message bubbles */
    try {
      const dataIdNodes = document.querySelectorAll('[data-id^="false_"], [data-id^="true_"]');
      for (const node of dataIdNodes) {
        addElement(node);
      }
    } catch { /* skip */ }

    /* Strategy 2: data-testid="msg-container" */
    try {
      const testIdNodes = document.querySelectorAll('[data-testid="msg-container"]');
      for (const node of testIdNodes) {
        addElement(node);
      }
    } catch { /* skip */ }

    /* Strategy 3: message-in / message-out CSS classes */
    try {
      const classNodes = document.querySelectorAll(
        "div.message-in, div.message-out, div[class*='message-in'], div[class*='message-out']"
      );
      for (const node of classNodes) {
        addElement(node);
      }
    } catch { /* skip */ }

    /* Strategy 4: If no direct bubbles found, resolve from row containers */
    if (messageElements.length === 0) {
      try {
        const main =
          document.querySelector("#main") ||
          document.querySelector('[data-testid="conversation-panel-wrapper"]') ||
          document.querySelector('[role="region"]');
        if (main) {
          const rows = main.querySelectorAll('[role="row"], [role="article"]');
          for (const row of rows) {
            const innerBubble = row.querySelector(
              '[data-id], [data-testid="msg-container"], .message-in, .message-out, [class*="message-in"], [class*="message-out"]'
            );
            addElement(innerBubble || row);
          }
        }
      } catch { /* skip */ }
    }

    return messageElements;
  }

  /**
   * Detect if the active conversation changed (e.g. user clicked a different contact).
   */
  function checkConversationChange() {
    try {
      const headerTitleEl =
        document.querySelector("#main header span[title]") ||
        document.querySelector("#main header h2") ||
        document.querySelector("header span[title]") ||
        document.querySelector("#main header span.x1rg5ohu") ||
        document.querySelector("header .x1rg5ohu");

      const title =
        headerTitleEl?.getAttribute("title") ||
        headerTitleEl?.textContent?.trim() ||
        null;

      if (title && title !== currentChatTitle) {
        console.log("Filtr: Switched conversation to:", title);
        currentChatTitle = title;
        processedKeys.clear();
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Scan the DOM for message elements, extract unread messages,
   * and send them to the service worker.
   */
  function scanMessages() {
    if (!isWatching || !config) return;

    const extractor = window.__FILTR_EXTRACTOR;
    if (!extractor) return;

    /* Check if contact changed */
    checkConversationChange();

    const candidateElements = findMessages();
    if (candidateElements.length === 0) return;

    const newMessages = [];

    for (const el of candidateElements) {
      if (newMessages.length >= MAX_BATCH_SIZE) break;

      const msg = extractor.extractMessage(el, config);
      if (!msg || !msg.text) continue;

      const idKey = msg.id ? `id:${msg.id}` : null;
      const textKey = `txt:${msg.sender}:${msg.text}`;

      if (idKey && processedKeys.has(idKey)) continue;
      if (processedKeys.has(textKey)) continue;

      if (idKey) processedKeys.add(idKey);
      processedKeys.add(textKey);

      newMessages.push(msg);
    }

    if (newMessages.length > 0) {
      console.log(
        "Filtr: Detected",
        newMessages.length,
        "new message(s):",
        newMessages.map((m) => `[${m.sender}] ${m.text}`)
      );

      chrome.runtime
        .sendMessage({
          type: "NEW_MESSAGES",
          platform: config.name || "WhatsApp Web",
          messages: newMessages,
        })
        .catch((err) => {
          console.debug("Filtr: Send message status", err);
        });
    }
  }

  /**
   * Schedule a scan with debouncing.
   */
  function scheduleScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      requestAnimationFrame(scanMessages);
    }, DEBOUNCE_DELAY);
  }

  /**
   * Start observing the DOM.
   */
  function startObserving() {
    const root = document.body || document.documentElement;
    if (!root) {
      setTimeout(startObserving, 500);
      return;
    }

    const observer = new MutationObserver(() => {
      if (!isWatching) return;
      scheduleScan();
    });

    observer.observe(root, { childList: true, subtree: true });

    /* Immediate initial scan */
    scheduleScan();

    /* Recurring heartbeat for virtualized scrolling */
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => {
      if (!isWatching) return;
      scanMessages();
    }, HEARTBEAT_INTERVAL);

    console.log("Filtr: Observer active on", config.name);
  }

  /**
   * Listen for commands from the service worker.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PING") {
      sendResponse({ ok: true, platform: config?.name || "WhatsApp Web" });
      return false;
    }

    if (message.type === "PAUSE_WATCH") {
      isWatching = false;
      sendResponse({ ok: true });
    } else if (message.type === "RESUME_WATCH") {
      isWatching = true;
      scheduleScan();
      sendResponse({ ok: true });
    } else if (message.type === "RESET_WATCH") {
      processedKeys.clear();
      currentChatTitle = null;
      isWatching = true;
      scheduleScan();
      sendResponse({ ok: true });
    }
    return false;
  });

  /**
   * Initialize content script on page load.
   */
  function init() {
    const extractor = window.__FILTR_EXTRACTOR;
    if (!extractor) {
      setTimeout(init, 300);
      return;
    }

    config = extractor.detectPlatform();
    if (!config) {
      return;
    }

    /* Immediately notify service worker that watching has started */
    chrome.runtime
      .sendMessage({
        type: "WATCH_STARTED",
        platform: config.name || "WhatsApp Web",
      })
      .catch(() => {});

    startObserving();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
