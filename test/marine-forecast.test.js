import { test } from "node:test";
import assert from "node:assert/strict";
import { parseMarineForecastPeriod } from "../boatwise-card.js";

test("parses caps-style NWS marine forecast", () => {
  const text = "NW WINDS 15 TO 20 KT WITH GUSTS UP TO 25 KT. SEAS 3 TO 5 FT. CHANCE OF SHOWERS.";
  const r = parseMarineForecastPeriod(text);
  assert.deepEqual(r.wind, { min: 15, max: 20, unit: "kt", direction: "NW" });
  assert.equal(r.gusts, 25);
  assert.deepEqual(r.seas, { min: 3, max: 5, unit: "ft" });
});

test("parses lowercase NWS marine forecast", () => {
  const text = "Wind east 10 to 15 kt. Seas 2 ft. Patchy fog.";
  const r = parseMarineForecastPeriod(text);
  assert.deepEqual(r.wind, { min: 10, max: 15, unit: "kt", direction: "E" });
  assert.deepEqual(r.seas, { min: 2, max: 2, unit: "ft" });
});

test("returns null fields when nothing parses", () => {
  const r = parseMarineForecastPeriod("Variable conditions.");
  assert.equal(r.wind, null);
  assert.equal(r.gusts, null);
  assert.equal(r.seas, null);
});

test("preserves raw text", () => {
  const text = "Wind north 5 kt. Seas 1 ft.";
  const r = parseMarineForecastPeriod(text);
  assert.equal(r.raw, text);
});

test("handles single wind value (no range)", () => {
  const r = parseMarineForecastPeriod("S winds 10 kt. Seas 2 ft.");
  assert.deepEqual(r.wind, { min: 10, max: 10, unit: "kt", direction: "S" });
});

test("handles empty or null input", () => {
  assert.equal(parseMarineForecastPeriod("").wind, null);
  assert.equal(parseMarineForecastPeriod(null).wind, null);
});
