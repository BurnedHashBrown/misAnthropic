/**
 * Filtr. Content Script — Message Extractor
 * Reads message text + sender from platform-specific DOM elements.
 * Called by observer.js when new messages appear.
 */

(() => {
  "use strict";

  /**
   * Detect which platform config applies to the current page.
   * @returns {object|null}
   */
  function detectPlatform() {
    const configs = window.__FILTR_PLATFORMS;
    if (!configs) return null;
    const host = window.location.hostname;
    for (const key of Object.keys(configs)) {
      if (host.includes(configs[key].hostMatch)) return configs[key];
    }
    return null;
  }

  /**
   * Extract text content from a message element using the platform config.
   * @param {Element} el - Message DOM element
   * @param {object} config - Platform config
   * @returns {string}
   */
  function extractText(el, config) {
    /* Try primary text selector */
    const textEl = el.querySelector(config.textSelector);
    if (textEl && textEl.textContent.trim()) {
      return textEl.textContent.trim();
    }
    /* Try fallbacks */
    if (config.textFallbacks) {
      for (const sel of config.textFallbacks) {
        const fb = el.querySelector(sel);
        if (fb && fb.textContent.trim()) return fb.textContent.trim();
      }
    }
    /* Last resort: element's own text, trimmed */
    return el.textContent?.trim() || "";
  }

  /**
   * Extract a structured message from a DOM element.
   * @param {Element} el
   * @param {object} config
   * @returns {{ text: string, sender: "them"|"user", timestamp: string|null }|null}
   */
  function extractMessage(el, config) {
    const text = extractText(el, config);
    if (!text || text.length < 2) return null; /* skip empty/tiny */
    return {
      text,
      sender: config.getSender(el),
      timestamp: config.getTimestamp ? config.getTimestamp(el) : null,
    };
  }

  /* Expose to observer.js */
  window.__FILTR_EXTRACTOR = { detectPlatform, extractMessage, extractText };
})();
