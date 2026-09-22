import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Create a mock window environment
function createMockElement({ tagName = "div", classes = [], textContent = "", attributes = {}, children = [] } = {}) {
  const classList = new Set(classes);
  const element = {
    tagName: tagName.toUpperCase(),
    classList: {
      contains: (c) => classList.has(c),
      add: (c) => classList.add(c),
      remove: (c) => classList.delete(c)
    },
    textContent,
    attributes,
    getAttribute: (attr) => attributes[attr] || null,
    children: [...children],
    parent: null,
    querySelector: (selector) => {
      // Basic selector matcher for our test cases
      for (const child of element.children) {
        if (selector === ".selectable-text" && child.classList.contains("selectable-text")) return child;
        if (selector === "span.selectable-text" && child.tagName === "SPAN" && child.classList.contains("selectable-text")) return child;
        if (selector === "[data-pre-plain-text]" && child.getAttribute("data-pre-plain-text")) return child;
        if (selector === "[data-pre-plain-text] span" && child.getAttribute("data-pre-plain-text")) {
          const span = child.children.find(c => c.tagName === "SPAN");
          if (span) return span;
        }
        const found = child.querySelector(selector);
        if (found) return found;
      }
      return null;
    },
    closest: (selector) => {
      let curr = element;
      while (curr) {
        if (selector.includes(".message-in") && curr.classList.contains("message-in")) return curr;
        if (selector.includes(".message-out") && curr.classList.contains("message-out")) return curr;
        curr = curr.parent;
      }
      return null;
    }
  };

  for (const c of children) {
    c.parent = element;
  }
  return element;
}

test("Extractor & Platform Config — WhatsApp Web platform detection", () => {
  const platformCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/platform-config.js", "utf8");
  const extractorCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/content-scripts/extractor.js", "utf8");

  // Set up mock window
  const mockWindow = {
    location: { hostname: "web.whatsapp.com" }
  };

  const fn = new Function("window", `${platformCode}\n${extractorCode}`);
  fn(mockWindow);

  const extractor = mockWindow.__FILTR_EXTRACTOR;
  assert.ok(extractor, "Extractor should be attached to window.__FILTR_EXTRACTOR");

  const platform = extractor.detectPlatform();
  assert.ok(platform, "Should detect WhatsApp platform");
  assert.equal(platform.id, "whatsapp");
  assert.equal(platform.name, "WhatsApp Web");
});

test("Extractor & Platform Config — extracts incoming message text and sender", () => {
  const platformCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/platform-config.js", "utf8");
  const extractorCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/content-scripts/extractor.js", "utf8");

  const mockWindow = {
    location: { hostname: "web.whatsapp.com" }
  };
  const fn = new Function("window", `${platformCode}\n${extractorCode}`);
  fn(mockWindow);
  const extractor = mockWindow.__FILTR_EXTRACTOR;
  const platform = extractor.detectPlatform();

  // Create an incoming message DOM element simulating WhatsApp Web
  const textSpan = createMockElement({
    tagName: "span",
    classes: ["selectable-text", "copyable-text"],
    textContent: "Please send me 100 dollars immediately"
  });

  const messageBubble = createMockElement({
    tagName: "div",
    classes: ["message-in", "focusable-list-item"],
    children: [textSpan]
  });

  const extracted = extractor.extractMessage(messageBubble, platform);
  assert.ok(extracted);
  assert.equal(extracted.sender, "them");
  assert.equal(extracted.text, "Please send me 100 dollars immediately");
});

test("Extractor & Platform Config — extracts outgoing message with sender 'user'", () => {
  const platformCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/platform-config.js", "utf8");
  const extractorCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/content-scripts/extractor.js", "utf8");

  const mockWindow = {
    location: { hostname: "web.whatsapp.com" }
  };
  const fn = new Function("window", `${platformCode}\n${extractorCode}`);
  fn(mockWindow);
  const extractor = mockWindow.__FILTR_EXTRACTOR;
  const platform = extractor.detectPlatform();

  const textSpan = createMockElement({
    tagName: "span",
    classes: ["selectable-text"],
    textContent: "No, I cannot do that."
  });

  const messageBubble = createMockElement({
    tagName: "div",
    classes: ["message-out"],
    children: [textSpan]
  });

  const extracted = extractor.extractMessage(messageBubble, platform);
  assert.ok(extracted);
  assert.equal(extracted.sender, "user");
  assert.equal(extracted.text, "No, I cannot do that.");
});

test("Extractor — skips empty or 1-character messages", () => {
  const platformCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/platform-config.js", "utf8");
  const extractorCode = fs.readFileSync("d:/GrpVetteAndRolex/filtr-extension/content-scripts/extractor.js", "utf8");

  const mockWindow = {
    location: { hostname: "web.whatsapp.com" }
  };
  const fn = new Function("window", `${platformCode}\n${extractorCode}`);
  fn(mockWindow);
  const extractor = mockWindow.__FILTR_EXTRACTOR;
  const platform = extractor.detectPlatform();

  const emptyBubble = createMockElement({
    tagName: "div",
    classes: ["message-in"],
    textContent: "  "
  });

  const singleCharBubble = createMockElement({
    tagName: "div",
    classes: ["message-in"],
    textContent: "a"
  });

  assert.equal(extractor.extractMessage(emptyBubble, platform), null);
  assert.equal(extractor.extractMessage(singleCharBubble, platform), null);
});
