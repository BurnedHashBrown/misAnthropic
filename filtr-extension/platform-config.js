/**
 * Filtr. Platform Configurations
 * Data-driven DOM selectors for each supported messaging platform.
 * Adding a new platform = adding a config object here.
 *
 * WhatsApp Web frequently updates its DOM structure.
 * We use multiple fallback strategies: data-id attributes, data-testid,
 * role attributes, structural heuristics, and legacy class names.
 */

const PLATFORM_CONFIGS = {
  whatsapp: {
    id: "whatsapp",
    name: "WhatsApp Web",
    hostMatch: "web.whatsapp.com",

    /* ── Chat Container ─────────────────────────────────────────────── */
    /* Container elements that indicate an open chat.                    */
    chatContainer: '#main, [data-testid="conversation-panel-wrapper"], [role="region"]',

    chatContainerFallbacks: [
      '#main',
      '[data-testid="conversation-panel-wrapper"]',
      '[data-testid="conversation-panel-messages"]',
      '#main [role="application"]',
      'div[tabindex="-1"]',
      '[role="region"]',
      'footer',
    ],

    /* ── Message Bubble Selectors ────────────────────────────────────── */
    /* WhatsApp uses data-id (e.g. false_... or true_...), data-testid,  */
    /* role="row", role="article", and message-in/message-out classes.   */
    messageSelector: [
      '[data-id^="false_"], [data-id^="true_"]',
      '[data-id]',
      '[data-testid="msg-container"]',
      'div.message-in, div.message-out',
      'div[class*="message-in"], div[class*="message-out"]',
      'div[role="row"]',
      'div[role="article"]',
    ].join(", "),

    /* ── Text Content Selectors ──────────────────────────────────────── */
    textSelector: 'span[dir="ltr"], span[dir="rtl"], span.selectable-text, span._ao3e, span[data-testid="msg-text"], .selectable-text',

    textFallbacks: [
      'span[dir="ltr"]',
      'span[dir="rtl"]',
      'span._ao3e',
      'span[data-testid="msg-text"]',
      '.selectable-text.copyable-text',
      '.selectable-text',
      'span.selectable-text',
      '.copyable-text',
      '[data-pre-plain-text] span',
    ],

    /**
     * Determine if a message element is from "them" or "user".
     * Uses multiple strategies since WhatsApp DOM changes frequently.
     * @param {Element} el - A message element matching messageSelector
     * @returns {"them"|"user"}
     */
    getSender(el) {
      if (!el || typeof el.getAttribute !== "function") return "them";

      /* Strategy 1: data-id based (WhatsApp internal message ID standard) */
      /* true_... = sent by user, false_... = received from other */
      const dataId =
        el.getAttribute("data-id") ||
        (el.closest && el.closest("[data-id]")?.getAttribute("data-id")) ||
        "";
      if (dataId.startsWith("true_")) return "user";
      if (dataId.startsWith("false_")) return "them";

      /* Strategy 2: Checkmark / status icons (only present on sent messages) */
      if (
        (el.querySelector && (
          el.querySelector('[data-testid="msg-dblcheck"]') ||
          el.querySelector('[data-testid="msg-check"]') ||
          el.querySelector('[data-testid="msg-time"] [data-icon="msg-dblcheck"]') ||
          el.querySelector('[data-testid="msg-time"] [data-icon="msg-check"]') ||
          el.querySelector('[data-icon="msg-dblcheck"]') ||
          el.querySelector('[data-icon="msg-check"]') ||
          el.querySelector('[data-icon="msg-time"]')
        ))
      ) {
        return "user";
      }

      /* Strategy 3: CSS classes */
      if (el.classList) {
        if (el.classList.contains("message-out")) return "user";
        if (el.classList.contains("message-in")) return "them";
      }

      /* Strategy 4: Substring class match */
      const classes = el.className || "";
      if (typeof classes === "string") {
        if (classes.includes("message-out")) return "user";
        if (classes.includes("message-in")) return "them";
      }

      /* Strategy 5: Walk up ancestors */
      if (el.closest) {
        const msgOut = el.closest('.message-out, [class*="message-out"]');
        if (msgOut) return "user";
        const msgIn = el.closest('.message-in, [class*="message-in"]');
        if (msgIn) return "them";
      }

      /* Strategy 6: Tail icons */
      if (el.querySelector) {
        if (
          el.querySelector('[data-testid="tail-out"]') ||
          el.querySelector('[data-icon="tail-out"]')
        ) {
          return "user";
        }
        if (
          el.querySelector('[data-testid="tail-in"]') ||
          el.querySelector('[data-icon="tail-in"]')
        ) {
          return "them";
        }
      }

      /* Strategy 7: Positional heuristic */
      if (el.getBoundingClientRect && el.parentElement?.getBoundingClientRect) {
        const rect = el.getBoundingClientRect();
        const parentRect = el.parentElement.getBoundingClientRect();
        if (parentRect.width > 0 && rect.right > parentRect.right - 60) {
          return "user";
        }
      }

      /* Default to "them" for safety (safer to analyze than miss) */
      return "them";
    },

    /**
     * Extract timestamp text from a message element.
     * @param {Element} el
     * @returns {string|null}
     */
    getTimestamp(el) {
      if (!el || typeof el.querySelector !== "function") return null;

      /* Try data-testid first */
      const timeEl = el.querySelector('[data-testid="msg-meta"]');
      if (timeEl) return timeEl.textContent?.trim() || null;

      /* Legacy: data-pre-plain-text attribute */
      const preText = el.querySelector("[data-pre-plain-text]");
      if (preText) return preText.getAttribute("data-pre-plain-text");

      const copyable = el.querySelector(".copyable-text");
      if (copyable) return copyable.getAttribute("data-pre-plain-text") || null;

      return null;
    },
  },
};

/* Export for content script access (non-module context) */
if (typeof window !== "undefined") {
  window.__FILTR_PLATFORMS = PLATFORM_CONFIGS;
}
