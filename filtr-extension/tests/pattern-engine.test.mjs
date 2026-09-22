import test from "node:test";
import assert from "node:assert/strict";
import { detectSignals, assessRisk, analyzeMessages } from "../pattern-engine.js";

test("Pattern Engine — detects all 7 individual signal categories", () => {
  // 1. Money request
  const money = detectSignals("Can you wire me $200 via cash app or apple gift card?");
  assert.ok(money.includes("money-request"), "Should detect money-request");

  // 2. Secrecy request
  const secrecy = detectSignals("Please don't tell your friends, keep this strictly between us and delete our chat.");
  assert.ok(secrecy.includes("secrecy-request"), "Should detect secrecy-request");

  // 3. Urgency
  const urgency = detectSignals("I need this right now immediately, hurry time is running out today only!");
  assert.ok(urgency.includes("urgency"), "Should detect urgency");

  // 4. Private-image pressure
  const image = detectSignals("Send me a private selfie pic or body pic to prove you like me.");
  assert.ok(image.includes("private-image-pressure"), "Should detect private-image-pressure");

  // 5. Threat / blackmail
  const blackmail = detectSignals("Pay or I will expose you and leak your screenshots to everyone.");
  assert.ok(blackmail.includes("threat-blackmail"), "Should detect threat-blackmail");

  // 6. Emotional coercion
  const emotional = detectSignals("If you really care, prove your love. Don't you love me?");
  assert.ok(emotional.includes("emotional-coercion"), "Should detect emotional-coercion");

  // 7. Isolation
  const isolation = detectSignals("Don't tell your mom or dad, they don't understand us, you only need me.");
  assert.ok(isolation.includes("isolation"), "Should detect isolation");
});

test("Pattern Engine — benign text produces safe assessment", () => {
  const benign = detectSignals("Good morning! How are you doing today? Let's grab coffee this weekend.");
  assert.deepEqual(benign, []);

  const assessment = assessRisk([]);
  assert.equal(assessment.concernLevel, "safe");
  assert.equal(assessment.signals.length, 0);
  assert.ok(assessment.title.length > 0);
  assert.ok(assessment.summary.length > 0);
});

test("Pattern Engine — single non-blackmail signal escalates to watch level", () => {
  const assessment = assessRisk(["money-request"]);
  assert.equal(assessment.concernLevel, "watch");
  assert.equal(assessment.signals.length, 1);
  assert.equal(assessment.signals[0], "Money request");
  assert.ok(assessment.title.includes("financial"));
});

test("Pattern Engine — threat/blackmail immediately escalates to alert level even if solo", () => {
  const assessment = assessRisk(["threat-blackmail"]);
  assert.equal(assessment.concernLevel, "alert");
  assert.ok(assessment.title.toLowerCase().includes("blackmail") || assessment.title.toLowerCase().includes("threat"));
});

test("Pattern Engine — multi-signal combination escalates to alert level", () => {
  const assessment = assessRisk(["money-request", "urgency"]);
  assert.equal(assessment.concernLevel, "alert");
  assert.equal(assessment.signals.length, 2);
  assert.ok(assessment.title.includes("pressure"));
});

test("Pattern Engine — ignores messages sent by user ('user') and only analyzes 'them'", () => {
  const messages = [
    { text: "I have no money right now and I am not sending crypto.", sender: "user" },
    { text: "Sounds good, see you soon!", sender: "them" }
  ];

  const result = analyzeMessages(messages, []);
  assert.deepEqual(result.signalHistory, []);
  assert.equal(result.assessment.concernLevel, "safe");
});

test("Pattern Engine — accumulates signals across messages over time", () => {
  // Turn 1: Other person mentions urgency
  const batch1 = [
    { text: "Hey are you awake? Need your help immediately asap!", sender: "them" }
  ];
  const turn1 = analyzeMessages(batch1, []);
  assert.deepEqual(turn1.signalHistory, ["urgency"]);
  assert.equal(turn1.assessment.concernLevel, "watch");

  // Turn 2: User replies innocently
  const batch2 = [
    { text: "What's wrong?", sender: "user" }
  ];
  const turn2 = analyzeMessages(batch2, turn1.signalHistory);
  assert.deepEqual(turn2.signalHistory, ["urgency"]);
  assert.equal(turn2.assessment.concernLevel, "watch");

  // Turn 3: Other person asks for money + secrecy
  const batch3 = [
    { text: "I'm in an emergency, wire me $300 and keep it secret don't tell anyone!", sender: "them" }
  ];
  const turn3 = analyzeMessages(batch3, turn2.signalHistory);
  assert.ok(turn3.signalHistory.includes("urgency"));
  assert.ok(turn3.signalHistory.includes("money-request"));
  assert.ok(turn3.signalHistory.includes("secrecy-request"));
  assert.equal(turn3.assessment.concernLevel, "alert");
  assert.ok(turn3.assessment.signals.length >= 3);
});
