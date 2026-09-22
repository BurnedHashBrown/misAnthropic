/**
 * Filtr. Pattern Engine
 * Detects romance scam / sextortion pressure signals in message text.
 * Ported from the Filtr. website's regexFallback() with time-aware accumulation.
 *
 * Usage (service worker):
 *   import { analyzeMessages, resetHistory } from './pattern-engine.js';
 *   const result = analyzeMessages(newMessages, existingHistory);
 */

const SIGNAL_CHECKS = [
  {
    id: "money-request",
    label: "Money request",
    pattern:
      /\b(?:money|cash|funds|dollar|dollars|usd|cent|cents|buck|bucks|euro|euros|eur|pound|pounds|gbp|rupee|rupees|inr)\b|[\$€£₹]\s*\d+|\b(?:wire|transfer|deposit|pay|payment|borrow|lend|loan|owe|reimburse)\b|\b(?:send|give|need|lend|wire)\b.{0,30}\b(?:me|us)?\b.{0,20}(?:\d+|cash|money|dollars|bucks|funds|gift\s*card|crypto)|\b(?:venmo|zelle|paypal|cash\s*app|apple\s*pay|google\s*pay|western\s*union|moneygram)\b|\b(?:bank\s*account|routing\s*number|credit\s*card|debit\s*card)\b|\b(?:gift\s*card|apple\s*(?:gift\s*)?card|steam\s*(?:gift\s*)?card|itunes\s*(?:gift\s*)?card|amazon\s*(?:gift\s*)?card|google\s*play|prepaid\s*card)\b|\b(?:crypto|cryptocurrency|bitcoin|btc|eth|ethereum|usdt|tether|binance|coinbase|wallet\s*address|invest(?:ment|ing)?|forex)\b/i,
  },
  {
    id: "secrecy-request",
    label: "Secrecy request",
    pattern:
      /\b(?:secret|private|don['']t\s+tell|between\s+us|no\s+one\s+(?:else\s+)?(?:can|should|must|needs\s+to)\s+know|hide\s+(?:this|it)\s+from|delete\s+(?:our\s+)?(?:chat|messages|convo)|disappearing\s+messages)\b/i,
  },
  {
    id: "urgency",
    label: "Urgency",
    pattern:
      /\b(?:urgent(?:ly)?|right\s+now|immediately|hurry|asap|time\s+(?:is\s+)?running\s*(?:out)?|before\s+it(?:['']s)?\s+too\s+late|deadline|emergency|at\s+once)\b|\b(?:today\s+only|by\s+today|need\s+(?:it\s+)?today|must\s+(?:be\s+)?today|only\s+today)\b/i,
  },
  {
    id: "private-image-pressure",
    label: "Private-image pressure",
    pattern:
      /\b(?:photo|photos|pic|pics|picture|pictures|nude|nudes|nsfw|selfie|selfies|show\s+me|snap\s+me|video\s*call\s*private|body\s*pic|undress|take\s+(?:it|them)\s+off|send\s+(?:a\s+)?(?:pic|photo|photos|video))\b/i,
  },
  {
    id: "threat-blackmail",
    label: "Threat / blackmail",
    pattern:
      /\b(?:blackmail|expose|ruin\s+you|share\s+(?:this|these|it|them|everything)\s+with|send\s+(?:this|these|it|them)\s+to\s+(?:your|everyone)|screenshot(?:s|ed)?|leak|leaked|post\s+(?:online|them|it)|tell\s+everyone|pay\s+(?:or|me\s+or))\b/i,
  },
  {
    id: "emotional-coercion",
    label: "Emotional coercion",
    pattern:
      /\b(?:only\s+love|for\s+(?:the\s+)?sake\s+of\s+(?:our\s+)?love|prove\s+(?:your\s+)?love|prove\s+(?:your\s+)?trust|if\s+you\s+(?:really\s+)?care|don['']t\s+you\s+love\s+me|you\s+don['']t\s+trust\s+me|after\s+all\s+i(?:['']ve)?\s+done|you\s+owe\s+me)\b/i,
  },
  {
    id: "isolation",
    label: "Isolation",
    pattern:
      /\b(?:don['']t\s+tell\s+(?:your\s+)?(?:parents|mom|dad|family|friends|anyone)|they\s+don['']t\s+understand\s+us|turn\s+(?:them|everyone)\s+against|keep\s+us\s+secret|you\s+only\s+need\s+me)\b/i,
  },
];

/* Signals that are NOT concerning on their own */
const BENIGN_SOLO = new Set(["warmth", "long-distance"]);

/**
 * Scan a single message string for signals.
 * @param {string} text
 * @returns {string[]} Array of signal IDs found
 */
export function detectSignals(text) {
  if (!text || typeof text !== "string") return [];
  const lower = text.toLowerCase();
  return SIGNAL_CHECKS.filter(({ pattern }) => pattern.test(lower)).map(
    ({ id }) => id
  );
}

/**
 * Given an array of signal IDs (accumulated over time), produce a risk assessment.
 * @param {string[]} allSignals - All unique signal IDs seen so far
 * @returns {{ concernLevel: string, title: string, summary: string, nudge: string, signals: string[] }}
 */
export function assessRisk(allSignals) {
  const unique = [...new Set(allSignals)];
  const labels = unique.map(
    (id) => SIGNAL_CHECKS.find((c) => c.id === id)?.label || id
  );
  const hasBlackmail = unique.includes("threat-blackmail");
  const nonBenign = unique.filter((s) => !BENIGN_SOLO.has(s));

  /* No signals at all */
  if (nonBenign.length === 0) {
    return {
      concernLevel: "safe",
      title: "A new connection can be exciting.",
      summary:
        "Early affection and distance alone are not warning signs. There is nothing to act on yet.",
      nudge: "Enjoy the conversation, and keep sharing only what feels right to you.",
      signals: labels,
    };
  }

  /* Single signal (watch) */
  if (nonBenign.length === 1 && !hasBlackmail) {
    const sig = nonBenign[0];
    const specifics = {
      "money-request": {
        title: "A financial request appeared.",
        summary:
          "Financial requests from online connections are a primary warning sign for romance and imposter scams.",
        nudge: "Never send money, wire transfers, crypto, or gift cards to someone you have only met online.",
      },
      "private-image-pressure": {
        title: "Pressure for private images appeared.",
        summary:
          "Requests for intimate content can escalate into sextortion or blackmail.",
        nudge: "Do not feel pressured to share intimate photos. You have the right to keep your privacy.",
      },
      "secrecy-request": {
        title: "A secrecy request appeared.",
        summary:
          "Pressure to keep conversations secret is often used to isolate you from support.",
        nudge: "Before agreeing to keep secrets, consider discussing this connection with someone you trust.",
      },
    };
    const detail = specifics[sig] || {
      title: "A signal worth noticing.",
      summary: `Filtr. noticed ${labels[0] || sig}. Keep your boundaries and observe how the conversation develops.`,
      nudge: "Stay aware. If more pressure appears, come back and check in again.",
    };
    return { concernLevel: "watch", signals: labels, ...detail };
  }

  /* Multiple signals or blackmail (alert) */
  return {
    concernLevel: "alert",
    title: hasBlackmail
      ? "Threat or blackmail signals detected."
      : "This is pressure, not proof of care.",
    summary: `Filtr. noticed: ${labels.join(", ")}. ${hasBlackmail ? "Save the messages, do not comply, and involve someone you trust immediately." : "Multiple concerning signals are combining. Save the messages, verify through a separate channel, and involve someone you trust."}`,
    nudge: "Do not send money, private images, codes, or IDs. Step back and talk to a trusted person.",
    signals: labels,
  };
}

/**
 * Full analysis: scan new messages, merge with history, return assessment.
 * @param {{ text: string, sender: string }[]} newMessages
 * @param {string[]} signalHistory - Previously accumulated signal IDs
 * @returns {{ assessment: object, signalHistory: string[] }}
 */
export function analyzeMessages(newMessages, signalHistory = []) {
  const newSignals = newMessages
    .filter((m) => m.sender === "them")
    .flatMap((m) => detectSignals(m.text));

  const merged = [...new Set([...signalHistory, ...newSignals])];
  const assessment = assessRisk(merged);

  return { assessment, signalHistory: merged };
}
