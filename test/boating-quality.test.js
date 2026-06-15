import { test } from "node:test";
import assert from "node:assert/strict";
import { boatingQualityScore } from "../boatwise-card.js";

test("calm conditions return GREAT", () => {
  const r = boatingQualityScore({ windKt: 5, seasFt: 1, alerts: [], conditions: "clear" });
  assert.equal(r.label, "GREAT");
  assert.equal(r.score, 4);
});

test("moderate wind drops to GOOD", () => {
  const r = boatingQualityScore({ windKt: 12, seasFt: 2, alerts: [], conditions: "partly cloudy" });
  assert.equal(r.label, "GOOD");
});

test("higher wind drops to FAIR", () => {
  const r = boatingQualityScore({ windKt: 18, seasFt: 3, alerts: [], conditions: null });
  assert.equal(r.label, "FAIR");
});

test("strong wind goes to BAD", () => {
  const r = boatingQualityScore({ windKt: 26, seasFt: 5, alerts: [], conditions: null });
  assert.equal(r.label, "BAD");
});

test("seas dominate when worse than wind", () => {
  const r = boatingQualityScore({ windKt: 5, seasFt: 5, alerts: [], conditions: "clear" });
  assert.equal(r.label, "BAD");
});

test("any active alert forces BAD", () => {
  const r = boatingQualityScore({
    windKt: 5,
    seasFt: 1,
    alerts: [{ event: "Small Craft Advisory", severity: "Moderate" }],
    conditions: "clear"
  });
  assert.equal(r.label, "BAD");
  assert.ok(r.reasons.some((s) => /advisory|warning/i.test(s)));
});

test("thunderstorms cap quality at FAIR", () => {
  const r = boatingQualityScore({ windKt: 5, seasFt: 1, alerts: [], conditions: "thunderstorms" });
  assert.equal(r.label, "FAIR");
});

test("heavy rain caps quality at FAIR", () => {
  const r = boatingQualityScore({ windKt: 5, seasFt: 1, alerts: [], conditions: "heavy rain" });
  assert.equal(r.label, "FAIR");
});

test("light rain does not cap", () => {
  const r = boatingQualityScore({ windKt: 5, seasFt: 1, alerts: [], conditions: "rain" });
  assert.notEqual(r.label, "BAD");
});

test("missing wind/seas returns FAIR with reason", () => {
  const r = boatingQualityScore({ windKt: null, seasFt: null, alerts: [], conditions: null });
  assert.equal(r.label, "FAIR");
  assert.ok(r.reasons.some((s) => /unknown|missing/i.test(s)));
});

test("reasons include the dominating factor", () => {
  const r = boatingQualityScore({ windKt: 22, seasFt: 1, alerts: [], conditions: "clear" });
  assert.match(r.reasons.join(" "), /wind/i);
});

test("score is 0..4 integer", () => {
  for (const wind of [0, 5, 12, 18, 22, 30]) {
    for (const seas of [0, 1, 2, 3, 5, 8]) {
      const r = boatingQualityScore({ windKt: wind, seasFt: seas, alerts: [], conditions: null });
      assert.ok(Number.isInteger(r.score));
      assert.ok(r.score >= 0 && r.score <= 4);
    }
  }
});
