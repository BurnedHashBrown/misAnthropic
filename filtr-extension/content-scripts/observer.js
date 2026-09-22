/**
 * Filtr. Content Script — MutationObserver
 * Watches for new messages in the chat DOM and sends them to the service worker.
 * Uses requestAnimationFrame to batch reads and avoid blocking the main thread.
 */

(() => {
  "use strict";

  const BATCH_INTERVAL = 1500; /* ms — debounce rapid message bursts */
  const MAX_INITIAL_SCAN = 30; /* max messages to scan on first load */

  let config = null;
  let observer = null;
  let pendingElements = [];
  let batchTimer = null;
  let processedTexts = new Set(); /* avoid re-sending same message text */
  let isWatching = true;

  /**
   * Find the chat container element using config selectors.
   * @returns {Element|null}
   */
  function findChatContainer() {
    if (!config) return null;
    let container = document.querySelector(config.chatContainer);
    if (container) return container;
    /* Try fallbacks */
    if (config.chatContainerFallbacks) {
      for (const sel of config.chatContainerFallbacks) {
        container = document.querySelector(sel);
        if (container) return container;
      }
    }
    return null;
  }

  /**
   * Process a batch of new message elements — extract text and send to service worker.
   */
  function processBatch() {
    batchTimer = null;
    if (!isWatching || pendingElements.length === 0) {
      pendingElements = [];
      return;
    }

    const extractor = window.__FILTR_EXTRACTOR;
    if (!extractor) return;

    const elements = pendingElements.splice(0);
    const messages = [];

    requestAnimationFrame(() => {
      for (const el of elements) {
        const msg = extractor.extractMessage(el, config);
        if (msg && msg.text && !processedTexts.has(msg.text)) {
          processedTexts.add(msg.text);
          messages.push(msg);
        }
      }

      if (messages.length > 0) {
        chrome.runtime.sendMessage({
          type: "NEW_MESSAGES",
          platform: config.name || config.id,
          messages,
        });
      }
    });
  }

  /**
   * Queue message elements for batched processing.
   * @param {Element[]} elements
   */
  function queueElements(elements) {
    pendingElements.push(...elements);
    if (!batchTimer) {
      batchTimer = setTimeout(processBatch, BATCH_INTERVAL);
    }
  }

  /**
   * Do an initial scan of existing messages on the page.
   */
  function initialScan() {
    if (!config) return;
    const existing = document.querySelectorAll(config.messageSelector);
    const recent = [...existing].slice(-MAX_INITIAL_SCAN);
    if (recent.length > 0) {
      queueElements(recent);
    }
  }

  /**
   * Start the MutationObserver on the chat container.
   */
  function startObserving() {
    const container = findChatContainer();
    if (!container) {
      /* Container not yet in DOM — retry with polling */
      setTimeout(startObserving, 2000);
      return;
    }

    /* Initial scan of visible messages */
    initialScan();

    /* Observe for new message nodes */
    observer = new MutationObserver((mutations) => {
      if (!isWatching) return;
      const newMessages = [];

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          /* Check if the added node itself is a message */
          if (node.matches && node.matches(config.messageSelector)) {
            newMessages.push(node);
          }

          /* Check children of the added node */
          if (node.querySelectorAll) {
            const children = node.querySelectorAll(config.messageSelector);
            for (const child of children) {
              newMessages.push(child);
            }
          }
        }
      }

      if (newMessages.length > 0) {
        queueElements(newMessages);
      }
    });

    observer.observe(container, { childList: true, subtree: true });

    /* Notify service worker that watching has started */
    chrome.runtime.sendMessage({
      type: "WATCH_STARTED",
      platform: config.name || config.id,
    });
  }

  /**
   * Listen for commands from the service worker (pause/resume/reset).
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "PAUSE_WATCH") {
      isWatching = false;
      sendResponse({ ok: true });
    } else if (message.type === "RESUME_WATCH") {
      isWatching = true;
      sendResponse({ ok: true });
    } else if (message.type === "RESET_WATCH") {
      processedTexts.clear();
      isWatching = true;
      initialScan();
      sendResponse({ ok: true });
    }
    return false; /* synchronous response */
  });

  /**
   * Initialize — detect platform and start observing.
   */
  function init() {
    const extractor = window.__FILTR_EXTRACTOR;
    if (!extractor) {
      console.warn("Filtr: Extractor not loaded");
      return;
    }
    config = extractor.detectPlatform();
    if (!config) {
      console.warn("Filtr: No matching platform config for", window.location.hostname);
      return;
    }
    startObserving();
  }

  /* Wait for page to settle, then initialize */
  if (document.readyState === "complete") {
    setTimeout(init, 1000);
  } else {
    window.addEventListener("load", () => setTimeout(init, 1000));
  }
})();
