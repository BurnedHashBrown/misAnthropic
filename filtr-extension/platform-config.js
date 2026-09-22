/**
 * Filtr. Platform Configurations
 * Data-driven DOM selectors for each supported messaging platform.
 * Adding a new platform = adding a config object here.
 */

const PLATFORM_CONFIGS = {
  whatsapp: {
    id: "whatsapp",
    name: "WhatsApp Web",
    hostMatch: "web.whatsapp.com",

    /* The container where new message nodes appear */
    chatContainer: '[role="application"]',

    /* Fallback container selectors (WhatsApp DOM changes frequently) */
    chatContainerFallbacks: [
      "#main",
      '[data-tab="8"]',
      ".two > div:last-child",
    ],

    /* Selector for individual message bubbles */
    messageSelector: ".message-in, .message-out",

    /* Selector for the text content within a message bubble */
    textSelector: ".selectable-text",

    /* Fallback text selectors */
    textFallbacks: ["span.selectable-text", '[data-pre-plain-text] span'],

    /**
     * Determine if a message element is from "them" or "user".
     * @param {Element} el - A message element matching messageSelector
     * @returns {"them"|"user"}
     */
    getSender(el) {
      if (el.classList.contains("message-in")) return "them";
      if (el.classList.contains("message-out")) return "user";
      /* Fallback: walk up to find .message-in or .message-out */
      const parent = el.closest(".message-in, .message-out");
      if (parent) return parent.classList.contains("message-in") ? "them" : "user";
      return "them"; /* default to "them" for safety */
    },

    /**
     * Extract timestamp text from a message element (optional, best-effort).
     * @param {Element} el
     * @returns {string|null}
     */
    getTimestamp(el) {
      const timeEl = el.querySelector("[data-pre-plain-text]");
      if (timeEl) return timeEl.getAttribute("data-pre-plain-text");
      const small = el.querySelector(".copyable-text");
      if (small) return small.getAttribute("data-pre-plain-text") || null;
      return null;
    },
  },
};

/* Export for content script access (non-module context) */
if (typeof window !== "undefined") {
  window.__FILTR_PLATFORMS = PLATFORM_CONFIGS;
}
