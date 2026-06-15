import "./_setup.js";
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSafeWindows } from "../boatwise-card.js";

const t = (iso) => new Date(iso);

test("empty input returns empty array", () => {
  assert.deepEqual(extractSafeWindows([], 4), []);
});

test("all-unsafe input returns empty array", () => {
  const series = [
    { time: t("2026-06-14T10:00"), value: 1.0 },
    { time: t("2026-06-14T10:06"), value: 1.2 },
    { time: t("2026-06-14T10:12"), value: 1.4 }
  ];
  assert.deepEqual(extractSafeWindows(series, 4), []);
});

test("all-safe input returns one window spanning full range", () => {
  const series = [
    { time: t("2026-06-14T10:00"), value: 5.0 },
    { time: t("2026-06-14T10:06"), value: 5.2 },
    { time: t("2026-06-14T10:12"), value: 5.4 }
  ];
  const windows = extractSafeWindows(series, 4);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].start.toISOString(), "2026-06-14T10:00:00.000Z");
  assert.equal(windows[0].end.toISOString(), "2026-06-14T10:12:00.000Z");
});

test("rising crossing produces interpolated start", () => {
  // value crosses 4.0 halfway between 3.0 (10:00) and 5.0 (10:06) -> 10:03
  const series = [
    { time: t("2026-06-14T10:00"), value: 3.0 },
    { time: t("2026-06-14T10:06"), value: 5.0 },
    { time: t("2026-06-14T10:12"), value: 5.5 }
  ];
  const [win] = extractSafeWindows(series, 4);
  assert.equal(win.start.toISOString(), "2026-06-14T10:03:00.000Z");
  assert.equal(win.end.toISOString(), "2026-06-14T10:12:00.000Z");
});

test("falling crossing produces interpolated end", () => {
  // value crosses 4.0 halfway between 5.0 (10:06) and 3.0 (10:12) -> 10:09
  const series = [
    { time: t("2026-06-14T10:00"), value: 4.5 },
    { time: t("2026-06-14T10:06"), value: 5.0 },
    { time: t("2026-06-14T10:12"), value: 3.0 }
  ];
  const [win] = extractSafeWindows(series, 4);
  assert.equal(win.start.toISOString(), "2026-06-14T10:00:00.000Z");
  assert.equal(win.end.toISOString(), "2026-06-14T10:09:00.000Z");
});

test("multiple windows in one series", () => {
  // Up - down - up - down: two windows
  const series = [
    { time: t("2026-06-14T00:00"), value: 1 },
    { time: t("2026-06-14T03:00"), value: 6 },
    { time: t("2026-06-14T06:00"), value: 1 },
    { time: t("2026-06-14T09:00"), value: 6 },
    { time: t("2026-06-14T12:00"), value: 1 }
  ];
  const windows = extractSafeWindows(series, 4);
  assert.equal(windows.length, 2);
});

test("accepts NOAA {t, v} input shape", () => {
  const series = [
    { t: "2026-06-14 10:00", v: "3.0" },
    { t: "2026-06-14 10:06", v: "5.0" }
  ];
  const [win] = extractSafeWindows(series, 4);
  assert.equal(win.start.toISOString(), "2026-06-14T10:03:00.000Z");
});

test("window has duration_minutes and tide_direction_at_start/end", () => {
  const series = [
    { time: t("2026-06-14T10:00"), value: 3.0 },
    { time: t("2026-06-14T10:30"), value: 5.0 },
    { time: t("2026-06-14T11:00"), value: 3.0 }
  ];
  const [win] = extractSafeWindows(series, 4);
  assert.equal(win.tide_direction_at_start, "rising");
  assert.equal(win.tide_direction_at_end, "falling");
  assert.equal(typeof win.duration_minutes, "number");
  assert.ok(win.duration_minutes > 0);
});

test("threshold above max returns empty", () => {
  const series = [
    { time: t("2026-06-14T10:00"), value: 5 },
    { time: t("2026-06-14T10:06"), value: 6 }
  ];
  assert.deepEqual(extractSafeWindows(series, 100), []);
});

test("skips rows with invalid time or value", () => {
  const series = [
    { time: t("invalid"), value: 5 },
    { time: t("2026-06-14T10:00"), value: NaN },
    { time: t("2026-06-14T10:06"), value: 5 },
    { time: t("2026-06-14T10:12"), value: 5 }
  ];
  const windows = extractSafeWindows(series, 4);
  assert.equal(windows.length, 1);
  assert.equal(windows[0].start.toISOString(), "2026-06-14T10:06:00.000Z");
});
