import { test } from "node:test";
import assert from "node:assert/strict";
import { statusChipState } from "../boatwise-card.js";

const t = (iso) => new Date(iso);
const fmt = (d) => `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}Z`;

test("ADVISORY wins over everything", () => {
  const result = statusChipState({
    windows: [{ start: t("2026-06-14T10:00"), end: t("2026-06-14T14:00") }],
    alerts: [{ event: "Small Craft Advisory", expires: t("2026-06-14T18:00") }],
    now: t("2026-06-14T11:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "ADVISORY");
  assert.match(result.summary, /Small Craft Advisory/);
});

test("GO_NOW when inside a window and no alert", () => {
  const result = statusChipState({
    windows: [{ start: t("2026-06-14T10:00"), end: t("2026-06-14T14:00") }],
    alerts: [],
    now: t("2026-06-14T11:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "GO_NOW");
  assert.match(result.summary, /Open until/);
});

test("GET_TO_WHARF when inside buffer window", () => {
  const result = statusChipState({
    windows: [{ start: t("2026-06-14T10:00"), end: t("2026-06-14T14:00") }],
    alerts: [],
    now: t("2026-06-14T09:45"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "GET_TO_WHARF");
});

test("TOO_SHALLOW when before buffer with future window", () => {
  const result = statusChipState({
    windows: [{ start: t("2026-06-14T10:00"), end: t("2026-06-14T14:00") }],
    alerts: [],
    now: t("2026-06-14T08:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "TOO_SHALLOW");
  assert.match(result.summary, /Next window/);
  assert.match(result.summary, /arrive/);
});

test("TOO_SHALLOW with no future window", () => {
  const result = statusChipState({
    windows: [],
    alerts: [],
    now: t("2026-06-14T08:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "TOO_SHALLOW");
  assert.match(result.summary, /No window in next/);
});

test("TOO_SHALLOW when only past windows remain", () => {
  const result = statusChipState({
    windows: [{ start: t("2026-06-14T05:00"), end: t("2026-06-14T07:00") }],
    alerts: [],
    now: t("2026-06-14T08:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "TOO_SHALLOW");
});

test("expired alerts are ignored", () => {
  const result = statusChipState({
    windows: [{ start: t("2026-06-14T10:00"), end: t("2026-06-14T14:00") }],
    alerts: [{ event: "Small Craft Advisory", expires: t("2026-06-14T08:00") }],
    now: t("2026-06-14T11:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "GO_NOW");
});

test("multiple alerts pick the most severe", () => {
  const result = statusChipState({
    windows: [],
    alerts: [
      { event: "Small Craft Advisory", severity: "Moderate", expires: t("2026-06-14T18:00") },
      { event: "Gale Warning", severity: "Severe", expires: t("2026-06-14T18:00") }
    ],
    now: t("2026-06-14T11:00"),
    bufferMinutes: 30,
    formatClock: fmt
  });
  assert.equal(result.status, "ADVISORY");
  assert.match(result.summary, /Gale Warning/);
});
