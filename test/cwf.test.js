import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseCWFZonePeriods, parseMarineForecastPeriod } from "../boatwise-card.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const cwfText = readFileSync(join(__dirname, "fixtures/cwf-box.txt"), "utf8");

// Issuance: "704 PM EDT Wed Jun 24 2026" — EDT is UTC-4, so 23:04 UTC on 2026-06-24.
const ISSUANCE = new Date("2026-06-24T23:05:00Z");

test("parseCWFZonePeriods finds ANZ250 in the real CWF text", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ250", ISSUANCE);
  assert.ok(periods.length >= 5, `expected several periods, got ${periods.length}`);
});

test("ANZ250 periods include TONIGHT, THU, THU NIGHT", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ250", ISSUANCE);
  const labels = periods.map((p) => p.label);
  assert.ok(labels.includes("TONIGHT"));
  assert.ok(labels.includes("THU"));
  assert.ok(labels.includes("THU NIGHT"));
});

test("TONIGHT seas parse as 2-3 ft", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ250", ISSUANCE);
  const tonight = periods.find((p) => p.label === "TONIGHT");
  assert.ok(tonight);
  assert.ok(tonight.parsed?.seas, `seas missing for TONIGHT: ${tonight.text}`);
  assert.equal(tonight.parsed.seas.min, 2);
  assert.equal(tonight.parsed.seas.max, 3);
});

test('"around 2 ft" parses as 2-2', () => {
  const r = parseMarineForecastPeriod("S winds 5 to 10 kt. Seas around 2 ft.");
  assert.deepEqual(r.seas, { min: 2, max: 2, unit: "ft" });
});

test('"1 foot" singular parses', () => {
  const r = parseMarineForecastPeriod("N winds 5 kt. Seas 1 foot.");
  assert.deepEqual(r.seas, { min: 1, max: 1, unit: "ft" });
});

test('"Seas 1 foot or less" parses as 1', () => {
  const r = parseMarineForecastPeriod("N winds 5 to 10 kt. Seas 1 foot or less.");
  assert.deepEqual(r.seas, { min: 1, max: 1, unit: "ft" });
});

test("TONIGHT label maps to overnight hours after issuance", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ250", ISSUANCE);
  const tonight = periods.find((p) => p.label === "TONIGHT");
  assert.ok(tonight.start instanceof Date);
  assert.ok(tonight.end instanceof Date);
  // start should be in the evening of issuance day, end in the morning of next day
  assert.ok(tonight.end > tonight.start);
  assert.ok(tonight.start.getTime() >= ISSUANCE.getTime() - 6 * 3600000);
});

test("THU label maps to a Thursday daytime range", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ250", ISSUANCE);
  const thu = periods.find((p) => p.label === "THU");
  assert.ok(thu);
  assert.equal(thu.start.getUTCDay(), 4 /* Thu */);
});

test("THU NIGHT label is overnight", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ250", ISSUANCE);
  const thuNight = periods.find((p) => p.label === "THU NIGHT");
  assert.ok(thuNight);
  // duration roughly 12 hours
  const durHrs = (thuNight.end - thuNight.start) / 3600000;
  assert.ok(durHrs >= 10 && durHrs <= 14, `dur ${durHrs}`);
});

test("ANZ251 (Mass Bay & Ipswich Bay) is also parseable from the same product", () => {
  const periods = parseCWFZonePeriods(cwfText, "ANZ251", ISSUANCE);
  assert.ok(periods.length >= 3);
  const tonight = periods.find((p) => p.label === "TONIGHT");
  assert.deepEqual(tonight.parsed.seas, { min: 2, max: 2, unit: "ft" });
});

test("unknown zone returns empty array", () => {
  const periods = parseCWFZonePeriods(cwfText, "XYZ999", ISSUANCE);
  assert.deepEqual(periods, []);
});
