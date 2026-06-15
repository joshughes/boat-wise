# BoatWise Fork Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fork TideWise into BoatWise — a Home Assistant Lovelace card that reports tide-depth safe-boating windows, NWS marine alerts, and marine zone forecasts. Coexists with TideWise via a distinct custom element name.

**Architecture:** Single shipped JS file (HACS plugin convention). Renamed `tidewise-card.js` → `boatwise-card.js`. Pure utility functions (`extractSafeWindows`, `statusChipState`, `parseMarineForecastPeriod`) are top-level `export`s in the file, guarded so `customElements.define` only runs in a browser context — this allows Node `node:test` to import and unit-test the pure code without registering the custom element. The card pulls NOAA CO-OPS tide predictions out to 72 h, scans for continuous windows where `tide_height ≥ depth_threshold`, fetches NWS marine zone alerts and forecast for `marine_zone`, and renders a status chip + windows table + threshold-shaded chart.

**Tech Stack:** Vanilla JS (ES modules), Web Components / Custom Elements, NOAA CO-OPS API, NWS api.weather.gov API. Tests: `node:test` + `node:assert/strict` (Node 20+ built-in, no install). Linting/syntax: `node --check`.

**Source spec:** `docs/superpowers/specs/2026-06-14-boatwise-fork-design.md`

---

## File Structure

**New / renamed:**
- `boatwise-card.js` — renamed from `tidewise-card.js`. Single-file card (constants, STYLES, exported pure functions, `BoatWiseCard` class, `BoatWiseCardEditor` class, registration). ~1,500 lines after stripping providers/fishing/surf.
- `test/safe-windows.test.js` — tests for `extractSafeWindows`.
- `test/status-chip.test.js` — tests for `statusChipState`.
- `test/marine-forecast.test.js` — tests for `parseMarineForecastPeriod`.
- `examples/boatwise-ipswich.yaml` — Ipswich-flavored example.
- `examples/minimal.yaml` — updated minimal config.

**Deleted:**
- `tidewise-card.js` (renamed)
- `examples/canada-chs.yaml`
- `examples/cherry-grove.yaml`
- `examples/tide-only.yaml` (folded into minimal)

**Modified metadata:**
- `package.json` — name, description, keywords, scripts (add `test`).
- `hacs.json` — name, filename.
- `info.md` — content.
- `README.md` — full rewrite for boating context.
- `CHANGELOG.md` — new 1.0.0 entry.
- `.github/workflows/frontend-check.yml` — file name to syntax-check.

**Pure-function ESM-export pattern:**

```js
// Top of boatwise-card.js, before any DOM/Window access.
export function extractSafeWindows(predictions, threshold) { ... }
export function statusChipState({ windows, alerts, now, bufferMinutes }) { ... }
export function parseMarineForecastPeriod(periodText) { ... }

// ... STYLES, classes, etc.

// Guarded registration at bottom of file:
if (typeof customElements !== "undefined") {
  if (!customElements.get("boatwise-card")) customElements.define("boatwise-card", BoatWiseCard);
  if (!customElements.get("boatwise-card-editor")) customElements.define("boatwise-card-editor", BoatWiseCardEditor);
}
if (typeof window !== "undefined") {
  window.customCards = window.customCards || [];
  window.customCards.push({ type: "boatwise-card", name: "BoatWise", description: "Tide-depth boating windows with marine alerts", preview: true });
  console.info(...);
}
```

This pattern keeps the file Node-importable for tests without changing the browser behavior.

---

## Task 1: Project rename and test scaffolding

**Files:**
- Rename: `tidewise-card.js` → `boatwise-card.js`
- Modify: `package.json`
- Modify: `hacs.json`
- Modify: `.github/workflows/frontend-check.yml`

- [ ] **Step 1: Rename the card file (preserve git blame)**

```bash
git mv tidewise-card.js boatwise-card.js
```

- [ ] **Step 2: Update `package.json`**

Replace existing content with:

```json
{
  "name": "boatwise-card",
  "version": "1.0.0",
  "description": "Tide-depth boating windows, NWS marine alerts and zone forecasts for Home Assistant.",
  "type": "module",
  "files": [
    "boatwise-card.js",
    "README.md",
    "info.md",
    "hacs.json",
    "examples"
  ],
  "scripts": {
    "check": "node --check boatwise-card.js",
    "test": "node --test test/"
  },
  "keywords": [
    "home-assistant",
    "hacs",
    "dashboard",
    "lovelace",
    "custom-card",
    "noaa",
    "tide",
    "tides",
    "boating",
    "marine",
    "weather"
  ],
  "license": "PolyForm-Noncommercial-1.0.0",
  "private": false
}
```

- [ ] **Step 3: Update `hacs.json`**

Replace with:

```json
{
  "name": "BoatWise",
  "country": "US",
  "content_in_root": true,
  "render_readme": true,
  "filename": "boatwise-card.js"
}
```

- [ ] **Step 4: Update CI syntax check workflow**

In `.github/workflows/frontend-check.yml`, change the run line:

```yaml
      - name: JavaScript syntax check
        run: node --check boatwise-card.js
```

- [ ] **Step 5: Create the empty test directory and a sanity test**

```bash
mkdir -p test
```

Create `test/_sanity.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";

test("node:test runner works", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 6: Verify syntax + tests run**

Run:
```bash
npm run check
npm test
```

Expected: both commands exit 0. `npm test` shows `# pass 1`.

- [ ] **Step 7: Commit**

```bash
git add boatwise-card.js package.json hacs.json .github/workflows/frontend-check.yml test/
git commit -m "rename to boatwise: project scaffolding and test runner"
```

---

## Task 2: Pure function — `extractSafeWindows` (TDD)

**Files:**
- Create: `test/safe-windows.test.js`
- Modify: `boatwise-card.js` (add `export function extractSafeWindows` near top, before `STYLES`)

**Goal:** Pure function that scans NOAA's 6-min prediction series and returns continuous time blocks where height ≥ threshold, with linear-interpolated boundary times.

### Input shape

NOAA predictions look like `{ t: "2026-06-14 10:30", v: "4.231" }`. Our wrapper should accept either that shape or `{ time: Date, value: number }` so tests can pass natural objects. The card already has `_parsePredictionTime` for the `t` string — but the pure function should not depend on the class. Resolve by accepting **either**:
- An array of `{ time: Date, value: number }`, or
- An array of `{ t: string, v: string }` which the function normalizes via `new Date(t.replace(" ", "T"))` and `parseFloat(v)`.

### Algorithm

1. Normalize input to `[{ time: Date, value: number }]`. Skip rows where `time` is invalid or `value` is `NaN`.
2. Sort ascending by time (defensive — NOAA returns sorted, but the pure function should not assume).
3. Sweep adjacent pairs. For each pair `(a, b)`:
   - `aSafe = a.value >= threshold`
   - `bSafe = b.value >= threshold`
   - If both unsafe: skip.
   - If both safe: extend current window (open if not yet open).
   - If `!aSafe && bSafe`: interpolate `start` time at the crossing; open window at that interpolated time.
   - If `aSafe && !bSafe`: interpolate `end` time; close window.
4. After sweep, if a window is still open at end of series, close at the last point's time.
5. Discard windows whose `end <= now` if a `now` is passed (optional second arg). Default: don't filter by now (let the caller do that, keeps the pure function obviously pure).

**Linear interpolation formula** at threshold:
`ratio = (threshold - a.value) / (b.value - a.value)`
`crossingMs = a.time.getTime() + ratio * (b.time.getTime() - a.time.getTime())`

### Tests

- [ ] **Step 1: Write failing tests**

Create `test/safe-windows.test.js`:

```js
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
  // Linear: value crosses 4.0 halfway between 3.0 (10:00) and 5.0 (10:06).
  // Expected crossing: 10:03.
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
  // Linear: value crosses 4.0 halfway between 5.0 (10:06) and 3.0 (10:12).
  // Expected crossing: 10:09.
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
  // Up - down - up - down: two windows.
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
```

> **Note on Date semantics:** Tests use `"YYYY-MM-DDTHH:MM"` strings, which `new Date()` interprets as **local time**. The expected `.toISOString()` strings in the assertions assume the test runner runs in UTC. If running locally in a non-UTC zone, set `TZ=UTC` for tests:
>
> Update the test script in `package.json`:
> ```json
> "test": "TZ=UTC node --test test/"
> ```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`

Expected: failures because `extractSafeWindows` is not exported yet — `SyntaxError: The requested module ... does not provide an export named 'extractSafeWindows'` or similar.

- [ ] **Step 3: Update `package.json` test script to pin TZ=UTC**

Change the `test` script to:
```json
"test": "TZ=UTC node --test test/"
```

- [ ] **Step 4: Implement `extractSafeWindows`**

In `boatwise-card.js`, insert near the top of the file (after the existing `CARD_VERSION` constant; before `TIDEWISE_PROVIDERS` if still present — we delete that in a later task):

```js
export function extractSafeWindows(predictions, threshold) {
  const norm = (predictions || [])
    .map((row) => {
      if (row && row.time instanceof Date && typeof row.value === "number") {
        return { time: row.time, value: row.value };
      }
      if (row && typeof row.t === "string" && (typeof row.v === "string" || typeof row.v === "number")) {
        const [date, clock] = row.t.split(" ");
        if (!date || !clock) return null;
        const iso = `${date}T${clock}`;
        return { time: new Date(iso), value: parseFloat(row.v) };
      }
      return null;
    })
    .filter((row) => row && Number.isFinite(row.time.getTime()) && Number.isFinite(row.value))
    .sort((a, b) => a.time - b.time);

  if (norm.length < 2) {
    if (norm.length === 1 && norm[0].value >= threshold) {
      return [{
        start: norm[0].time,
        end: norm[0].time,
        duration_minutes: 0,
        tide_direction_at_start: "rising",
        tide_direction_at_end: "falling"
      }];
    }
    return [];
  }

  const windows = [];
  let openStart = null;
  let openStartDirection = null;

  const crossing = (a, b) => {
    const ratio = (threshold - a.value) / (b.value - a.value);
    return new Date(a.time.getTime() + ratio * (b.time.getTime() - a.time.getTime()));
  };

  for (let i = 0; i < norm.length - 1; i++) {
    const a = norm[i];
    const b = norm[i + 1];
    const aSafe = a.value >= threshold;
    const bSafe = b.value >= threshold;

    if (i === 0 && aSafe && openStart === null) {
      openStart = a.time;
      openStartDirection = b.value >= a.value ? "rising" : "falling";
    }

    if (!aSafe && bSafe) {
      openStart = crossing(a, b);
      openStartDirection = "rising";
    } else if (aSafe && !bSafe) {
      const end = crossing(a, b);
      if (openStart) {
        windows.push({
          start: openStart,
          end,
          duration_minutes: (end - openStart) / 60000,
          tide_direction_at_start: openStartDirection,
          tide_direction_at_end: "falling"
        });
        openStart = null;
        openStartDirection = null;
      }
    }
  }

  if (openStart) {
    const last = norm[norm.length - 1].time;
    const lastVal = norm[norm.length - 1].value;
    const prevVal = norm[norm.length - 2].value;
    windows.push({
      start: openStart,
      end: last,
      duration_minutes: (last - openStart) / 60000,
      tide_direction_at_start: openStartDirection,
      tide_direction_at_end: lastVal >= prevVal ? "rising" : "falling"
    });
  }

  return windows;
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test`

Expected: all 10 cases pass.

- [ ] **Step 6: Run syntax check**

Run: `npm run check`

Expected: exit 0.

- [ ] **Step 7: Commit**

```bash
git add boatwise-card.js test/safe-windows.test.js package.json
git commit -m "add extractSafeWindows pure function with tests"
```

---

## Task 3: Pure function — `statusChipState` (TDD)

**Files:**
- Create: `test/status-chip.test.js`
- Modify: `boatwise-card.js` (add `export function statusChipState` after `extractSafeWindows`)

**Goal:** Return `{ status, summary }` for the header chip given current windows + active marine alerts + clock + buffer minutes.

**Priority (highest wins):**
1. `ADVISORY` — any relevant alert active right now
2. `GO_NOW` — `now` is inside any window (`window.start <= now < window.end`)
3. `GET_TO_WHARF` — `now` is inside the buffer-before-window range for any upcoming window (`now >= window.start - buffer && now < window.start`)
4. `TOO_SHALLOW` — none of the above

**Summary format:**
- GO_NOW: `Open until 1:42 PM` (formatted from window.end)
- GET_TO_WHARF: `Window opens 9:14 AM`
- TOO_SHALLOW: `Next window: 9:14 AM (arrive 8:44 AM)` if any future window; `No window in next 72h` otherwise
- ADVISORY: `<event title> · expires <time>` if expiry known; else just event title

For consistent formatting, the pure function returns raw fields plus computed times; the caller formats clock strings (so the function isn't locale-dependent). Actually, simpler: pass a `formatClock(date) -> string` helper as input. Cleaner for unit testing.

### Tests

- [ ] **Step 1: Write failing tests**

Create `test/status-chip.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: failures from missing export.

- [ ] **Step 3: Implement `statusChipState`**

Insert in `boatwise-card.js` after `extractSafeWindows`:

```js
export function statusChipState({ windows, alerts, now, bufferMinutes, formatClock }) {
  const activeAlerts = (alerts || []).filter((a) => {
    if (!a) return false;
    if (a.expires instanceof Date && a.expires.getTime() <= now.getTime()) return false;
    return true;
  });

  if (activeAlerts.length) {
    const severityRank = { Severe: 3, Moderate: 2, Minor: 1, Unknown: 0 };
    activeAlerts.sort((a, b) => (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0));
    const top = activeAlerts[0];
    const expiry = top.expires instanceof Date ? ` · expires ${formatClock(top.expires)}` : "";
    return { status: "ADVISORY", summary: `${top.event}${expiry}` };
  }

  const currentWindow = (windows || []).find((w) => w.start.getTime() <= now.getTime() && now.getTime() < w.end.getTime());
  if (currentWindow) {
    return { status: "GO_NOW", summary: `Open until ${formatClock(currentWindow.end)}` };
  }

  const upcoming = (windows || [])
    .filter((w) => w.start.getTime() > now.getTime())
    .sort((a, b) => a.start - b.start);

  const bufferMs = (bufferMinutes || 0) * 60000;

  if (upcoming.length) {
    const next = upcoming[0];
    const arriveBy = new Date(next.start.getTime() - bufferMs);
    if (now.getTime() >= arriveBy.getTime()) {
      return { status: "GET_TO_WHARF", summary: `Window opens ${formatClock(next.start)}` };
    }
    return {
      status: "TOO_SHALLOW",
      summary: `Next window: ${formatClock(next.start)} (arrive ${formatClock(arriveBy)})`
    };
  }

  return { status: "TOO_SHALLOW", summary: "No window in next 72h" };
}
```

- [ ] **Step 4: Run tests and syntax**

Run:
```bash
npm test
npm run check
```

Both should exit 0.

- [ ] **Step 5: Commit**

```bash
git add boatwise-card.js test/status-chip.test.js
git commit -m "add statusChipState pure function with tests"
```

---

## Task 4: Pure function — `parseMarineForecastPeriod` (TDD)

**Files:**
- Create: `test/marine-forecast.test.js`
- Modify: `boatwise-card.js` (add `export function parseMarineForecastPeriod` after `statusChipState`)

**Goal:** Best-effort parser for NWS marine forecast period text. Extracts wind speed range, gusts, seas height. Returns `{ wind, gusts, seas, conditions, raw }` with fields set to `null` when not detected.

**Sample NWS text (real format):**
```
NW WINDS 15 TO 20 KT WITH GUSTS UP TO 25 KT. SEAS 3 TO 5 FT. CHANCE OF SHOWERS.
```

```
Wind east 10 to 15 kt. Seas 2 ft. Patchy fog.
```

### Tests

- [ ] **Step 1: Write failing tests**

Create `test/marine-forecast.test.js`:

```js
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
```

- [ ] **Step 2: Run tests to verify failure**

Run: `npm test`

Expected: missing export errors.

- [ ] **Step 3: Implement `parseMarineForecastPeriod`**

Insert in `boatwise-card.js` after `statusChipState`:

```js
export function parseMarineForecastPeriod(text) {
  const raw = typeof text === "string" ? text : "";
  const empty = { wind: null, gusts: null, seas: null, conditions: null, raw };
  if (!raw.trim()) return empty;

  const lower = raw.toLowerCase();

  const dirMap = {
    n: "N", s: "S", e: "E", w: "W",
    ne: "NE", nw: "NW", se: "SE", sw: "SW",
    nne: "NNE", ene: "ENE", ese: "ESE", sse: "SSE",
    ssw: "SSW", wsw: "WSW", wnw: "WNW", nnw: "NNW",
    north: "N", south: "S", east: "E", west: "W",
    northeast: "NE", northwest: "NW", southeast: "SE", southwest: "SW"
  };

  // Wind: "<dir> winds A to B kt", "winds <dir> A to B kt", "wind <dir> A kt"
  let wind = null;
  const windRange = lower.match(/(?:^|\b)([a-z]{1,3}|north[a-z]*|south[a-z]*|east|west)\s+winds?\s+(\d+)(?:\s+to\s+(\d+))?\s*kt/);
  const altWindRange = lower.match(/winds?\s+([a-z]{1,3}|north[a-z]*|south[a-z]*|east|west)\s+(\d+)(?:\s+to\s+(\d+))?\s*kt/);
  const m = windRange || altWindRange;
  if (m) {
    const dirKey = m[1].toLowerCase();
    const dir = dirMap[dirKey] || null;
    const min = parseInt(m[2], 10);
    const max = m[3] ? parseInt(m[3], 10) : min;
    if (Number.isFinite(min) && Number.isFinite(max)) {
      wind = { min, max, unit: "kt", direction: dir };
    }
  }

  // Gusts: "gusts up to N kt", "gusts to N kt", "gusting to N kt"
  let gusts = null;
  const gm = lower.match(/gust(?:s|ing)?\s+(?:up\s+)?to\s+(\d+)\s*kt/);
  if (gm) gusts = parseInt(gm[1], 10);

  // Seas: "seas A to B ft" or "seas A ft"
  let seas = null;
  const sm = lower.match(/seas\s+(\d+)(?:\s+to\s+(\d+))?\s*(?:ft|feet)/);
  if (sm) {
    const min = parseInt(sm[1], 10);
    const max = sm[2] ? parseInt(sm[2], 10) : min;
    if (Number.isFinite(min) && Number.isFinite(max)) {
      seas = { min, max, unit: "ft" };
    }
  }

  return { wind, gusts, seas, conditions: null, raw };
}
```

- [ ] **Step 4: Run tests + syntax**

Run:
```bash
npm test
npm run check
```

Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add boatwise-card.js test/marine-forecast.test.js
git commit -m "add parseMarineForecastPeriod pure function with tests"
```

---

## Task 5: Strip Canada CHS provider

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Remove the `chs_iwls` provider and all of its branches. After this task the card supports only NOAA. The pure function tests added so far must still pass.

- [ ] **Step 1: Identify code to remove**

Code references to delete (find with `grep -n` first to confirm exact ranges):

- Top-level constants: `CANADA_REGIONS` (~line 15–21), `CANADA_STATION_SEEDS` (~line 22–61)
- `TIDEWISE_PROVIDERS` entry: `chs_iwls` line (will fully remove `TIDEWISE_PROVIDERS` in Task 6)
- Card class methods: `_fetchCanadaData` (~line 640+), `_normalizeCanadaSeriesCode`, `_canadaStationSeriesCode`, `_arrayFromApi`, anything else in the `_fetchCanadaData` body
- Branch in `_fetchData`: `if (this._config.provider === "chs_iwls") { await this._fetchCanadaData(); return; }`
- `setConfig` keys: `ca_region`, `ca_station`, `ca_station_code`, `ca_series_code`
- Stub config keys: same
- `setConfig` change-detection list: remove `ca_station`, `ca_series_code` mentions in the `_fishBand = null` condition
- Editor class methods: `_canadaRegionStations`, `_canadaStationsLoading`, `_loadCanadaStations`, `_applyCanadaStation`, `_normalizeCanadaSeriesCode`, `_canadaStationSeriesCode`, `_regionForCanadaStation`, `_stationHasCanadaPredictions`, `_stationIsUsableCanadaPredictionStation`, `_arrayFromApi`
- Editor `_render` Canada UI block: the `${provider === "chs_iwls" ? ...}` branch in the template
- Editor event listeners for `caRegion`, `caStation`, `caStationManual`, `caStationCode`
- Provider-select branch in the provider change handler that sets up Canada defaults

> **Approach:** Do the removals in one logical sweep. Run `npm run check` and `npm test` after to verify the file still parses and pure-function tests still pass.

- [ ] **Step 2: Remove constants and methods**

Use `Edit` operations to delete the identified blocks. Where a constant is referenced elsewhere (e.g. `CANADA_REGIONS.find(...)`), those references must also be removed in the same task.

- [ ] **Step 3: Remove Canada keys from `setConfig` and `getStubConfig`**

Delete the four `ca_*` keys from both objects. Also update the `previousConfig` change-detection conditional to drop `ca_station`/`ca_series_code` comparisons.

- [ ] **Step 4: Remove the Canada branch in `_fetchData`**

Delete the `if (this._config.provider === "chs_iwls") { ... return; }` block.

- [ ] **Step 5: Remove editor Canada UI**

In `_render` (editor), delete the entire `${provider === "chs_iwls" ? \`...\` : ...}` branch and replace with just the non-Canada/UK NOAA branch content. The conditional becomes simpler:

The current shape is:
```js
${provider === "chs_iwls" ? `...canada...` : provider === "ukho_entity" ? `...ukho...` : `...noaa...`}
```

After this task, leave the `ukho_entity` branch in place (Task 6 removes it). The Canada branch is gone.

- [ ] **Step 6: Remove Canada event listeners and the `caRegion` etc. from provider-change handler**

Delete all `caRegion`, `caStation`, `caStationManual`, `caStationCode` `addEventListener` blocks and remove Canada-specific assignments in the `provider` change handler.

- [ ] **Step 7: Verify file still parses and pure tests still pass**

Run:
```bash
npm run check
npm test
```

Both exit 0. The card may render brokenly at this stage (we haven't removed all UI yet), but it must parse.

- [ ] **Step 8: Commit**

```bash
git add boatwise-card.js
git commit -m "remove Canada CHS provider"
```

---

## Task 6: Strip UK UKHO provider

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Remove the `ukho_entity` provider and all of its branches.

- [ ] **Step 1: Remove top-level constants & helpers**

Delete:
- `TIDEWISE_PROVIDERS` constant entirely (the multi-provider table is no longer needed — single provider).
- Any other UKHO-only top-level constants.

- [ ] **Step 2: Remove card-class methods**

Delete from `BoatWiseCard` (still named `TideWiseCard` at this point):
- `_fetchUkEntityData`
- `_buildUkhoEntityHilo`
- `_parseUkhoEntityHeightMetres`
- `_parseUkhoEntityTime`
- `_applyTimeOffset`
- `_heightOffset`
- `_dateInTimeZone`
- `_ukhoEntityDisplayName`
- `_normalizeUkhoTimeMode`
- `_normalizeProvider` (no longer needed — single provider)
- `_friendlyNoaaError` if it has UKHO references (likely safe to keep — review)
- `_deriveHiloFromPredictions`, `_buildPredictionsFromHilo` — these are used only by UKHO and Canada in current code; **verify** with grep, remove only if unused after UKHO removal.

- [ ] **Step 3: Remove UKHO keys from `setConfig` and `getStubConfig`**

Delete: `ukho_entity`, `ukho_time_mode`, `time_offset_minutes`, `height_offset`, `provider`.

The `setConfig` validation `if (provider === "noaa_coops" && !config.station) throw ...` can simplify to:
```js
if (!config.station) throw new Error("BoatWise requires a NOAA station ID.");
```

(Title text still says "TideWise" — Task 14 renames.)

- [ ] **Step 4: Remove UKHO branch in `_fetchData`**

Delete `if (this._config.provider === "ukho_entity") { ... return; }`. Also remove the `provider` reference from the `_waitingForHassState` block — that whole `if (this._waitingForHassState && this._config?.provider === "ukho_entity")` block in `set hass(hass)` goes.

- [ ] **Step 5: Remove editor UKHO UI**

Delete editor methods: `_ukhoEntityOptions`, `_applyUkhoEntity`.

In `_render`, the conditional in the editor template:
```js
${provider === "chs_iwls" ? `...` : provider === "ukho_entity" ? `...` : `...noaa...`}
```
becomes simply the NOAA block — no conditional needed. The whole "Tide provider" selector at the top of the editor goes away (we have one provider).

- [ ] **Step 6: Remove provider picker, UKHO event listeners, related editor state**

Delete:
- `<select id="provider">` from editor template
- `addEventListener("change", ...)` for `provider`
- All UKHO-related listeners: `ukhoEntitySelect`, `ukhoEntityManual`, `ukhoTimeMode`, `timeOffsetMinutes`, `heightOffset`

- [ ] **Step 7: Verify parse + tests**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 8: Commit**

```bash
git add boatwise-card.js
git commit -m "remove UK UKHO provider; collapse to single NOAA provider"
```

---

## Task 7: Strip surf zone forecast + fishing scoring

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Remove all fishing-window scoring, surf-zone forecast parsing, NWS rip-current logic, moon-phase scoring, related entity overrides, and CSS classes tied to fishing. After this task, the file should be roughly half its original size. The card won't render correctly yet (we delete the renderer's fishing dependencies but haven't added the boating UI), but the file must parse and the pure-function tests must still pass.

- [ ] **Step 1: Identify what to remove**

Top-level constants (~line 62–106):
- `NWS_BEACH_AREAS`
- `NWS_SRF_OFFICES`

Card class methods (referenced by approximate line range; grep for actual current locations):
- Solunar & moon: `_moonPosition`, `_moonAge`, `_moonPhaseName`, `_moonMultiplier`, `_solunarScore`
- Scoring: `_modeWeights`, `_windScore`, `_weatherScore`, `_pressureScore`, `_lightScore`, `_waterTempScore`, `_waveScore`, `_rainScore`, `_ripCurrentScore`, `_clarityScore`, `_tideScore`, `_scoreBand`, `_scoreLabel`, `_fishColor`, `_smoothScores`, `_forecastConditionCap`, `_buildFishingScores`, `_buildBestWindow`, `_buildReason`, `_safetyBadgeHtml`
- Surf parsing: `_selectedNwsBeachArea`, `_selectedNwsSrfOffice`, `_nwsForecastZoneId`, `_parseSurfForecastText`, `_scopeSurfForecastText`, `_stripSurfForecastDefinitions`, `_parseSurfRipRisk`, `_parseSurfRipRiskBlock`, `_parseSurfRipRiskPeriods`, `_splitNwsForecastSections`, `_activeRipPeriod`, `_periodWindowForLabel`, `_explicitRipEnd`, `_parseSurfHeightFt`, `_parseSurfWaterTempF`, `_firstRangeAverage`, `_fetchNwsSurfForecast`, `_fetchLegacyNwsSurfProduct`
- Entity helpers (for removed features): `_getWaveHeightFt`, `_getRipCurrentRisk`, `_ripRiskForTime`, `_getUnsafeToSwim`, `_getRainTodayIn`, `_normalizeCondition`, `_getPressureTrend` (kept entity overrides don't include pressure_trend)

Setconfig keys to remove:
- `mode`, `show_fishing_score`, `auto_surf_forecast`, `srf_region`, `beach_state`, `beach_area`, `surf_zone`, `nws_office`
- Entity keys: `wave_height_entity`, `rain_today_entity`, `pressure_trend_entity`, `cloud_cover_entity`, `rip_current_risk_entity`, `unsafe_to_swim_entity`

Stub config keys: same.

`previousConfig` change-detection conditional: remove `beach_area`, `surf_zone`, `mode` and the `_fishBand` reset entirely. Replace with `// (no fishing band cache to clear)` or just delete the line.

`_fetchAutoSources` body: remove the surf-fetch leg. After Task 8 we'll add marine fetches.

Editor:
- Remove `_beachStates`, `_beachAreasForState`, `_selectedBeachArea`, `_srfRegions`, `_srfOfficesForRegion`, `_selectedSrfOffice`, `_forecastAreasForState`, `_selectedForecastAreaValue`, `_applyBeachAreaToConfig`, `_applyForecastAreaToConfig`
- Editor `_render`: remove "Beach / Surf Forecast" section entirely; remove "Fishing mode" dropdown; remove "Show fishing score" checkbox; remove "Try NWS surf/rip forecast" checkbox
- Editor event listeners: `beachState`, `beachArea`, `mode`, `showFishing`, `autoSurfForecast`
- Rename label "Fishing / beach latitude/longitude" to "Forecast latitude/longitude" and "Fishing point picker" → "Forecast point picker"

Renderer (`_renderData`): remove the `fish` variable computation, `scoreInfo`, `phaseName`, `headerBadges` content for fish badges, `<div class="fish-footer">...</div>`, `<div class="fish-legend">...</div>`, `_safetyBadgeHtml` calls. Pass `null` for `fish` parameters into `_drawChart`. (Task 10 wires in the new boating UI.)

**Helpers to KEEP (do NOT delete — they're used by the new boating UI):** `_xAxisHtml`, `_pillHtml`, `_interpolateHeight`, `_parseHiloTime`, `_parsePredictionTime`, `_rollingPredictions`, `_formatClock`, `_escape`, `_getWeatherState`, `_getForecastLatLon`, `_getWindSpeedMph`, `_getWindBearing`, `_formatWind`, `_beaufortFromMph`, `_formatWindDirection`, `_getPressureHpa`, `_normalizePressureHpa`, `_getWaterTempF`, `_formatWaterTemp`, `_getEntity`, `_parseNumericState`, `_getNumericEntity`, `_dateStr`, `_formatNoaaTime`, `_themeColor`, `_chartColors`, `_roundedRect`, `_updateLive`, `_normalizeWindUnits`, `_normalizeThemeMode`, `_normalizeDebugConfig`, `_fetchAutoSources`, `_fetchCoopsObservations`, `_fetchNwsForecast`, `_parseCoopsWaterTempF`, `_parseCoopsWindSpeedMph`, `_parseAutoPressureHpa`, `_parseNwsWindSpeedMph`, `_parseNwsWindDirection`, `_getAutoWeatherState`, `_normalizeNwsShortForecast`.

When in doubt about whether a helper is still used, grep for callers before deleting.

`_drawChart`: remove `fishScores`-driven coloring (lines ~2209–2244). Replace with the existing tide-line drawing only. (Task 11 adds threshold shading.)

CherryGroveTidesCard: remove the class.

`CARD_TYPES` array: drop the `"cherry-grove-tides-card"` entry → `const CARD_TYPES = ["tidewise-card"]`.

`window.customCards` entry: leave name/type as-is for now (Task 14 renames).

`STYLES` constant: remove fish-related CSS rules — `.fish-score`, `.score-elite`, `.score-prime`, `.score-good`, `.score-fair`, `.score-slow`, `.fish-moon`, `.fish-badge-row`, `.fish-reason`, `.safety-badge`, `.fish-next`, `.fish-legend`, `.legend-*`, container-query overrides referencing these classes.

- [ ] **Step 2: Execute removals**

Use `Edit` to delete each block. This is a large sweep — work top-to-bottom through the file. After each major removal block, run `npm run check` to make sure the file still parses; this catches missing closing braces early.

- [ ] **Step 3: Final verify**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 4: Commit**

```bash
git add boatwise-card.js
git commit -m "remove fishing scoring, surf zone forecast, moon/rip helpers, related editor UI"
```

---

## Task 8: Add new config fields (`depth_threshold`, `wharf_buffer_minutes`, `marine_zone`, `forecast_horizon_hours`)

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Wire the new config fields through `setConfig`, `getStubConfig`, the editor, and the tide-fetching code path.

- [ ] **Step 1: Update `setConfig`**

In the card class `setConfig` body, the `this._config = { ... }` object should now include:

```js
this._config = {
  title: config.title || "TideWise",  // Task 14 changes default.
  station: String(config.station || "8441241"),
  units: config.units || "english",
  wind_units: this._normalizeWindUnits(config.wind_units),
  weather_entity: config.weather_entity || "",
  water_temp_entity: config.water_temp_entity || "",
  wind_speed_entity: config.wind_speed_entity || "",
  wind_direction_entity: config.wind_direction_entity || "",
  pressure_entity: config.pressure_entity || "",
  latitude: Number(config.latitude) || 42.755,    // Plum Island Sound
  longitude: Number(config.longitude) || -70.806,
  theme_mode: this._normalizeThemeMode(config.theme_mode),
  auto_sources: config.auto_sources !== false,
  depth_threshold: Number.isFinite(Number(config.depth_threshold)) ? Number(config.depth_threshold) : 4.0,
  wharf_buffer_minutes: this._normalizeWharfBuffer(config.wharf_buffer_minutes),
  marine_zone: String(config.marine_zone || "").trim().toUpperCase(),
  forecast_horizon_hours: this._normalizeHorizon(config.forecast_horizon_hours),
  debug: this._normalizeDebugConfig(config.debug),
  grid_options: config.grid_options || undefined
};
```

Add helper methods on the card class:

```js
_normalizeWharfBuffer(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 30;
  return Math.max(0, Math.min(180, Math.round(n)));
}

_normalizeHorizon(value) {
  const n = Number(value);
  if (n === 24 || n === 48 || n === 72) return n;
  return 72;
}
```

The default lat/lon `42.755, -70.806` is the approximate Plum Island Sound location — sensible default for an Ipswich-area card. (User can override.)

- [ ] **Step 2: Update `getStubConfig`**

```js
static getStubConfig() {
  return {
    title: "TideWise",   // Task 14 changes default.
    station: "8441241",
    units: "english",
    wind_units: "auto",
    theme_mode: "tidewise",  // Task 14 changes default.
    auto_sources: true,
    depth_threshold: 4.0,
    wharf_buffer_minutes: 30,
    marine_zone: "ANZ250",
    forecast_horizon_hours: 72
  };
}
```

- [ ] **Step 3: Update tide fetch in `_fetchData` to use horizon**

The current `_fetchData` requests `begin_date=today&end_date=tomorrow`. Update to use the configured horizon:

```js
async _fetchData() {
  const { station, units } = this._config;
  const horizonHours = this._config.forecast_horizon_hours || 72;
  const horizonDays = Math.ceil(horizonHours / 24);
  const today = this._dateStr(0);
  const endDate = this._dateStr(horizonDays);
  const base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
  const cp = `station=${station}&datum=MLLW&time_zone=lst_ldt&units=${units}&application=boatwise_card&format=json`;
  try {
    const autoPromise = this._config.auto_sources ? this._fetchAutoSources().catch((err) => ({ error: err.message })) : Promise.resolve({});
    const [cr, hr, autoData] = await Promise.all([
      fetch(`${base}?begin_date=${today}&end_date=${endDate}&${cp}&product=predictions&interval=6`),
      fetch(`${base}?begin_date=${today}&end_date=${endDate}&${cp}&product=predictions&interval=hilo`),
      autoPromise
    ]);
    // ... rest unchanged
```

Note: the `application=tidewise_card` URL param becomes `application=boatwise_card`. Same for the COOPS observations fetch at the other site.

- [ ] **Step 4: Add editor fields for the new config**

In editor `_render` template, add a new section after the station picker (and after the lat/lon row, before the "Card" section):

```html
<div class="section">
  <div class="title">Boating Window</div>
  <div class="grid">
    <label>
      Depth threshold (${tideOffsetUnit})
      <input id="depthThreshold" type="number" step="0.1" value="${config.depth_threshold ?? 4.0}" placeholder="4.0">
    </label>
    <label>
      Wharf buffer (minutes)
      <input id="wharfBuffer" type="number" min="0" max="180" step="5" value="${config.wharf_buffer_minutes ?? 30}" placeholder="30">
    </label>
    <label class="wide">
      NWS marine zone
      <input id="marineZone" value="${this._escape(config.marine_zone || "")}" placeholder="ANZ250">
    </label>
  </div>
  <div class="hint">
    Depth threshold: tide height below which the river is too shallow to safely transit. Start at 4 ft and tune from experience.
    Marine zone ID lets BoatWise show NWS Small Craft Advisories and offshore wind/seas.
    <a href="https://www.weather.gov/marine_charts" target="_blank" rel="noopener">Find your marine zone</a>.
  </div>
</div>
```

Add event listeners:

```js
this.shadowRoot.getElementById("depthThreshold")?.addEventListener("change", (event) => this._setNumber("depth_threshold", event.target.value));
this.shadowRoot.getElementById("wharfBuffer")?.addEventListener("change", (event) => this._setNumber("wharf_buffer_minutes", event.target.value));
this.shadowRoot.getElementById("marineZone")?.addEventListener("change", (event) => this._setValue("marine_zone", String(event.target.value || "").trim().toUpperCase()));
```

`_setNumber` already exists in the editor — it calls `_setValue` with `Number(value)`. Verify it's still present after Task 7's cleanup.

- [ ] **Step 5: Verify parse + tests**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 6: Commit**

```bash
git add boatwise-card.js
git commit -m "add depth_threshold, wharf_buffer_minutes, marine_zone, forecast_horizon_hours config"
```

---

## Task 9: Marine alerts + zone forecast fetchers

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Add `_fetchMarineAlerts(zoneId)` and `_fetchMarineZoneForecast(zoneId)` with TTL-based in-memory caching, and wire them into `_fetchAutoSources`. Also update wind precedence so marine zone wind overrides NWS land-point wind, while HA entities still win.

- [ ] **Step 1: Add a simple cache helper**

In the card class, near the existing observation/forecast methods, add:

```js
_getCached(key, ttlMs) {
  if (!this._cache) this._cache = new Map();
  const hit = this._cache.get(key);
  if (hit && Date.now() - hit.fetchedAt < ttlMs) return hit.value;
  return null;
}

_setCached(key, value) {
  if (!this._cache) this._cache = new Map();
  this._cache.set(key, { value, fetchedAt: Date.now() });
}
```

Initialize `this._cache = new Map()` in the constructor.

- [ ] **Step 2: Add `_fetchMarineAlerts`**

```js
async _fetchMarineAlerts() {
  const zone = this._config.marine_zone;
  if (!zone) return [];
  const cached = this._getCached(`alerts:${zone}`, 5 * 60 * 1000);
  if (cached) return cached;
  const headers = { Accept: "application/geo+json", "User-Agent": "boatwise-card (homeassistant)" };
  const res = await fetch(`https://api.weather.gov/alerts/active/zone/${zone}`, { headers });
  if (!res.ok) {
    if (res.status === 404) this._marineZoneError = `Marine zone ${zone} not found.`;
    return [];
  }
  this._marineZoneError = null;
  const json = await res.json();
  const features = Array.isArray(json.features) ? json.features : [];
  const relevantEvents = [
    "small craft advisory",
    "gale warning", "gale watch",
    "storm warning", "storm watch",
    "hurricane warning", "hurricane watch",
    "special marine warning",
    "marine weather statement",
    "hazardous seas warning", "hazardous seas watch"
  ];
  const alerts = features
    .map((f) => ({
      event: f?.properties?.event || "",
      severity: f?.properties?.severity || "Unknown",
      headline: f?.properties?.headline || "",
      expires: f?.properties?.expires ? new Date(f.properties.expires) : null
    }))
    .filter((a) => {
      const ev = a.event.toLowerCase();
      if (!relevantEvents.some((re) => ev.startsWith(re))) return false;
      if (!["Severe", "Moderate"].includes(a.severity)) return false;
      return true;
    });
  this._setCached(`alerts:${zone}`, alerts);
  return alerts;
}
```

- [ ] **Step 3: Add `_fetchMarineZoneForecast`**

```js
async _fetchMarineZoneForecast() {
  const zone = this._config.marine_zone;
  if (!zone) return null;
  const cached = this._getCached(`forecast:${zone}`, 30 * 60 * 1000);
  if (cached) return cached;
  const headers = { Accept: "application/geo+json", "User-Agent": "boatwise-card (homeassistant)" };
  const res = await fetch(`https://api.weather.gov/zones/forecast/${zone}/forecast`, { headers });
  if (!res.ok) return null;
  const json = await res.json();
  const periods = json?.properties?.periods || [];
  const current = periods[0] || null;
  const parsed = current ? parseMarineForecastPeriod(current.detailedForecast || current.shortForecast || "") : null;
  const result = { current, parsed, allPeriods: periods };
  this._setCached(`forecast:${zone}`, result);
  return result;
}
```

- [ ] **Step 4: Wire into `_fetchAutoSources`**

```js
async _fetchAutoSources() {
  const [coops, nws, alerts, marine] = await Promise.all([
    this._fetchCoopsObservations().catch((err) => ({ error: err.message })),
    this._fetchNwsForecast().catch((err) => ({ error: err.message })),
    this._fetchMarineAlerts().catch((err) => ({ error: err.message, alerts: [] })),
    this._fetchMarineZoneForecast().catch((err) => ({ error: err.message, forecast: null }))
  ]);
  return {
    coops: coops || {},
    nws: nws || {},
    alerts: Array.isArray(alerts) ? alerts : [],
    marine: marine || null,
    updated: new Date().toISOString()
  };
}
```

Note: any field referencing the old `surf` key in the renderer must be updated in later tasks.

- [ ] **Step 5: Update wind precedence**

In `_getWindSpeedMph(weather)` and `_getWindBearing(weather)`, the precedence should become:

1. HA entity (`wind_speed_entity` / `wind_direction_entity`) — already handled
2. NOAA CO-OPS observation at the tide station (`this._autoData?.coops?.wind`) — "what the buoy at the station is reading right now" is the strongest real signal when available; existing code path stays
3. Marine zone forecast value (`this._autoData.marine?.parsed?.wind?.max` for speed, `direction` parsed string for bearing) — offshore forecast, replaces the inland NWS point forecast
4. NWS land point forecast (existing fallback) — last resort if station obs and marine zone aren't available

Rationale: CO-OPS station obs are "now" measurements at the actual tide gauge — most relevant for actual on-the-water decisions. The marine zone forecast is the next-best signal because it's offshore-oriented, but it's a forecast, not an observation. Land-point NWS stays as last-resort fallback only.

For wind speed, marine forecast values are in knots. The card's `_getWindSpeedMph` returns MPH. Convert: `kt * 1.15078`.

For bearing, the marine forecast direction is a compass label ("NW", "E"). Add a helper:
```js
_compassToBearing(dir) {
  const map = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
  return map[String(dir || "").toUpperCase()] ?? null;
}
```

Modify the methods so the marine source is checked between HA entity and NWS:

```js
_getWindSpeedMph(weather) {
  // HA entity wins
  const e = this._getNumericEntity(this._config.wind_speed_entity);
  if (e) {
    /* existing unit conversion */
  }
  // Marine zone forecast next
  const marineKt = this._autoData?.marine?.parsed?.wind?.max;
  if (Number.isFinite(marineKt)) return marineKt * 1.15078;
  // NWS land fallback (existing _parseNwsWindSpeedMph path)
  // ... existing fallback code
}
```

Similar for `_getWindBearing`.

- [ ] **Step 6: Verify parse + tests**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 7: Commit**

```bash
git add boatwise-card.js
git commit -m "fetch NWS marine alerts and zone forecast; wire into wind precedence"
```

---

## Task 10: Wire safe windows + status chip into `_renderData`

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Compute safe windows from predictions, evaluate the status chip, and render a new header chip in place of the old fish-score badges. (Tide-chart shading and the windows panel come in Tasks 11 and 12.)

- [ ] **Step 1: In `_renderData`, compute windows + chip state**

After the existing predictions/hilo/now/cur setup, add:

```js
const horizonMs = (this._config.forecast_horizon_hours || 72) * 3600000;
const horizonCutoff = new Date(now.getTime() + horizonMs);
const seriesForWindows = predictions.filter((p) => {
  const tMs = this._parsePredictionTime(p.t).getTime();
  return Number.isFinite(tMs) && tMs >= now.getTime() - 6 * 60 * 1000 && tMs <= horizonCutoff.getTime();
});
const windows = extractSafeWindows(
  seriesForWindows.map((p) => ({ time: this._parsePredictionTime(p.t), value: parseFloat(p.v) })),
  this._config.depth_threshold
);
const alerts = (this._autoData?.alerts || []).map((a) => ({
  ...a,
  expires: a.expires instanceof Date ? a.expires : (typeof a.expires === "string" ? new Date(a.expires) : null)
}));
const chip = statusChipState({
  windows,
  alerts,
  now,
  bufferMinutes: this._config.wharf_buffer_minutes,
  formatClock: (d) => this._formatClock(d)
});
```

- [ ] **Step 2: Render the chip in the header strip**

Replace the `headerBadges` line (currently building fish-related chips) and the chart-section `chart-header` row's badges with a single status chip:

```js
const chipClass = {
  ADVISORY: "chip-advisory",
  GO_NOW: "chip-go",
  GET_TO_WHARF: "chip-arrive",
  TOO_SHALLOW: "chip-shallow"
}[chip.status] || "chip-shallow";

const chipLabel = {
  ADVISORY: "ADVISORY",
  GO_NOW: "GO NOW",
  GET_TO_WHARF: "GET TO WHARF NOW",
  TOO_SHALLOW: "TOO SHALLOW"
}[chip.status] || "TOO SHALLOW";
```

In the rendered HTML, after the title row, add:

```html
<div class="status-row">
  <span class="status-chip ${chipClass}">${chipLabel}</span>
  <span class="status-summary">${this._escape(chip.summary)}</span>
</div>
```

Remove the old `headerBadges` insertion entirely.

- [ ] **Step 3: Pass windows + chart needs forward**

Store `windows` on `this._lastWindows` so the windows panel (Task 12) and chart (Task 11) can read them when rendering. (Or pass through `_drawChart` arguments — both work.)

- [ ] **Step 4: Verify parse + tests + manual smoke**

Run:
```bash
npm run check
npm test
```

Both exit 0. The card will render but without the full UI (chart shading and windows panel come next).

- [ ] **Step 5: Commit**

```bash
git add boatwise-card.js
git commit -m "wire extractSafeWindows + statusChipState into render; show status chip"
```

---

## Task 11: Tide chart threshold shading

**Files:**
- Modify: `boatwise-card.js`

**Goal:** In `_drawChart`, add a dashed horizontal line at the depth threshold and tint the area below threshold red. Remove the fish-color fill that was deleted in Task 7 (verify it's gone).

- [ ] **Step 1: Modify `_drawChart` signature and call site**

Pass `threshold` into the chart:

In `_renderData`, the call becomes:
```js
this._drawChart(chartPredictions, now, cur, unitLabel, this._config.depth_threshold, [nextHigh, nextLow].filter(Boolean));
```

In `_drawChart`, the signature becomes:
```js
_drawChart(predictions, now, cur, unitLabel, threshold, tideEvents = []) {
```

- [ ] **Step 2: Add threshold shading**

After computing `minV`, `maxV`, `toX`, `toY` (around line 2190 in current code), before drawing the curve, add:

```js
// Shade below-threshold region
if (Number.isFinite(threshold) && threshold >= minV) {
  const thresholdY = toY(Math.min(threshold, maxV));
  ctx.fillStyle = "rgba(192,80,48,0.10)";
  ctx.fillRect(padL, thresholdY, cW, H - padB - thresholdY);
  // Dashed line at threshold
  ctx.setLineDash([4, 3]);
  ctx.strokeStyle = "rgba(192,80,48,0.55)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(padL, thresholdY);
  ctx.lineTo(W - padR, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]);
}
```

- [ ] **Step 3: Verify any leftover fishScores references are gone**

Grep:
```bash
grep -n "fishScores\|fishDetails\|_fishColor" boatwise-card.js
```
Expected: no matches.

- [ ] **Step 4: Verify parse + tests**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add boatwise-card.js
git commit -m "shade tide chart below depth threshold with dashed reference line"
```

---

## Task 12: Upcoming windows panel + conditions row

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Replace the deleted `fish-footer` + `fish-legend` HTML with a table of upcoming safe windows. Also add a compact conditions row (wind, pressure trend if available, water temp). Marine alerts beyond the headline alert are *not* shown — only the one in the chip summary is. (Per spec: keep it focused.)

- [ ] **Step 1: Build windows-panel HTML in `_renderData`**

After the chart section, before the `tides-grid`, insert:

```js
const windowsForPanel = windows
  .filter((w) => w.end.getTime() > now.getTime())
  .slice(0, 6);  // cap display at 6 rows so the card doesn't sprawl
const hasActiveAlert = chip.status === "ADVISORY";

const windowsHtml = windowsForPanel.length
  ? `
    <div class="windows-panel">
      <div class="windows-title">Upcoming Boating Windows</div>
      ${windowsForPanel.map((w) => {
        const arriveBy = new Date(w.start.getTime() - this._config.wharf_buffer_minutes * 60000);
        const dur = Math.round(w.duration_minutes);
        const durLabel = dur >= 60 ? `${Math.floor(dur/60)}h ${dur%60}m` : `${dur}m`;
        const dateLabel = this._formatWindowDate(w.start);
        const startClock = this._formatClock(w.start);
        const endClock = this._formatClock(w.end);
        const arriveClock = this._formatClock(arriveBy);
        const isOpenNow = w.start.getTime() <= now.getTime() && now.getTime() < w.end.getTime();
        const rowClass = isOpenNow ? "window-row open-now" : "window-row";
        const prefix = hasActiveAlert ? `<span class="warn-prefix">&#9888;</span>` : "";
        return `<div class="${rowClass}">${prefix}<span class="window-date">${dateLabel}</span><span class="window-times">${startClock} &rarr; ${endClock}</span><span class="window-dur">${durLabel}</span><span class="window-arrive">arrive ${arriveClock}</span></div>`;
      }).join("")}
    </div>
  `
  : `<div class="windows-panel windows-empty">No safe windows in the next ${this._config.forecast_horizon_hours} h.</div>`;
```

Add helper:

```js
_formatWindowDate(date) {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = date.toDateString() === today.toDateString();
  const isTomorrow = date.toDateString() === tomorrow.toDateString();
  if (isToday) return "Today";
  if (isTomorrow) return "Tomorrow";
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Build conditions row**

Replace where the old `water-temp-chip` lived (the chart header badges row), the conditions go between the chart and the windows panel as a one-line strip:

```js
const waterTempLabel = this._formatWaterTemp(this._getWaterTempF());
const windLabel = this._formatWind(this._getWindSpeedMph(weather), this._getWindBearing(weather));
const seasLabel = (this._autoData?.marine?.parsed?.seas)
  ? (() => {
      const s = this._autoData.marine.parsed.seas;
      return s.min === s.max ? `Seas ${s.min} ft` : `Seas ${s.min}-${s.max} ft`;
    })()
  : "";
const pressureHpa = this._getPressureHpa(weather);
const pressureLabel = Number.isFinite(pressureHpa) ? `${pressureHpa.toFixed(0)} hPa` : "";

const conditionsHtml = `
  <div class="conditions-row">
    ${windLabel ? `<span class="condition-chip">${windLabel}</span>` : ""}
    ${seasLabel ? `<span class="condition-chip">${seasLabel}</span>` : ""}
    ${waterTempLabel ? `<span class="condition-chip">Water ${waterTempLabel}</span>` : ""}
    ${pressureLabel ? `<span class="condition-chip">${pressureLabel}</span>` : ""}
  </div>
`;
```

- [ ] **Step 3: Insert into rendered HTML**

The body of `root.innerHTML = ...` becomes (roughly):

```html
<div class="header">
  <div class="title">${this._config.title}</div>
  <div class="subtitle">NOAA ${stationLabel}</div>
</div>
<div class="status-row">
  <span class="status-chip ${chipClass}">${chipLabel}</span>
  <span class="status-summary">${this._escape(chip.summary)}</span>
</div>
<div class="current-row">
  <div class="current-icon">&#127754;</div>
  <div>
    <div class="current-label">Current Tide</div>
    <div class="current-value">${cur.toFixed(1)}<span class="current-unit"> ${unitLabel}</span></div>
  </div>
  <div class="condition-spacer"></div>
  <div class="direction-chip">
    <div class="pulse-dot"></div>
    <span>${rising ? "&#9650; Rising" : "&#9660; Falling"}</span>
  </div>
</div>
<div class="chart-section">
  <div class="chart-header">
    <div class="section-label">Tide &amp; Threshold</div>
  </div>
  <div class="chart-wrap"><canvas id="tideCanvas"></canvas></div>
  ${this._xAxisHtml(chartPredictions)}
</div>
${conditionsHtml}
${windowsHtml}
<div class="tides-grid">
  ${this._pillHtml("low", nextLow, unitLabel)}
  ${this._pillHtml("high", nextHigh, unitLabel)}
</div>
${this._config.debug?.enabled && this._config.debug?.panel ? this._debugHtml(windows, alerts, chip, chartPredictions, cur, unitLabel) : ""}
```

(Task 14 renames `NOAA ${stationLabel}` to use new branding if needed; subtitle stays as-is.)

- [ ] **Step 4: Verify parse + tests**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add boatwise-card.js
git commit -m "render upcoming-windows panel and conditions row"
```

---

## Task 13: CSS for status chip and windows panel

**Files:**
- Modify: `boatwise-card.js` (the `STYLES` template literal)

**Goal:** Add CSS rules for the four chip states, the windows panel rows, and the conditions row. Trim leftover fish-related classes if any remain.

- [ ] **Step 1: Add chip + windows CSS**

In `STYLES`, after the existing `.condition-chip` rule and before the `.chart-section` rule (or any reasonable location), insert:

```css
.status-row {
  display: flex; align-items: center; gap: 10px; margin: 4px 0 8px;
  flex-wrap: wrap;
}
.status-chip {
  font-size: 13px; font-weight: 850; padding: 4px 12px; border-radius: 99px;
  letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap;
}
.chip-go { background: rgba(30,160,100,0.18); color: #0d8050; }
.chip-arrive { background: rgba(232,184,75,0.22); color: #8a6a10; }
.chip-shallow { background: rgba(120,130,140,0.18); color: #4a5560; }
.chip-advisory { background: rgba(192,80,48,0.20); color: #8a3018; }
.status-summary { font-size: 13px; color: var(--text-muted); font-weight: 700; line-height: 1.3; min-width: 0; }
.conditions-row { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.windows-panel {
  margin: 8px 0;
  background: var(--tw-panel-bg);
  border: 1px solid var(--tw-panel-border);
  border-radius: 12px;
  padding: 8px 12px;
}
.windows-title {
  font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
  color: var(--text-muted); font-weight: 800; margin-bottom: 6px;
}
.window-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  gap: 8px; padding: 4px 0;
  font-size: 13px; color: var(--text);
  border-top: 1px solid rgba(42,122,148,0.10);
  align-items: baseline;
}
.window-row:first-of-type { border-top: none; }
.window-row.open-now { background: rgba(30,160,100,0.07); border-radius: 6px; padding: 4px 6px; }
.window-date { font-weight: 750; color: var(--wave-dark); }
.window-times { font-family: var(--font-mono); font-weight: 700; }
.window-dur { font-size: 12px; color: var(--text-muted); font-weight: 700; }
.window-arrive { font-size: 12px; color: var(--text-muted); font-weight: 650; }
.warn-prefix { color: #a51f1f; margin-right: 4px; font-weight: 900; }
.windows-empty { font-size: 12px; color: var(--text-muted); padding: 10px 12px; }
@container (max-width: 520px) {
  .window-row { grid-template-columns: 1fr; gap: 2px; }
  .window-dur, .window-arrive { font-size: 11px; }
}
```

- [ ] **Step 2: Remove leftover fish CSS**

Re-grep:
```bash
grep -n "fish-\|legend-\|score-elite\|score-prime\|score-good\|score-fair\|score-slow\|safety-badge\|water-temp-chip\|fish-moon\|fish-badge-row" boatwise-card.js
```
Expected: no matches in CSS or HTML. If any are found, remove.

(`.water-temp-chip` is replaced by `.condition-chip` reuse from the existing CSS.)

- [ ] **Step 3: Verify parse**

Run: `npm run check`

Exit 0.

- [ ] **Step 4: Commit**

```bash
git add boatwise-card.js
git commit -m "style status chip, windows panel, and conditions row"
```

---

## Task 14: Repurpose debug panel

**Files:**
- Modify: `boatwise-card.js`

**Goal:** Rewrite the (currently broken — references removed fishing fields) `_debugHtml` to show boating-relevant diagnostics: depth threshold, recent series samples, extracted windows, alerts state, chip state. Same `debug: { enabled: true, panel: true }` activation.

- [ ] **Step 1: Replace `_debugHtml` body**

Signature changes to:
```js
_debugHtml(windows, alerts, chip, predictions, currentHeight, unitLabel) {
```

Body:

```js
_debugHtml(windows, alerts, chip, predictions, currentHeight, unitLabel) {
  const threshold = this._config.depth_threshold;
  const buffer = this._config.wharf_buffer_minutes;
  const zone = this._config.marine_zone || "(unset)";
  const horizon = this._config.forecast_horizon_hours;

  const sampleRows = predictions.slice(0, 8).map((p) =>
    `<div class="debug-line"><span class="debug-key">${this._escape(p.t)}</span><span class="debug-value">${parseFloat(p.v).toFixed(2)} ${unitLabel}</span></div>`
  ).join("");

  const windowRows = windows.map((w) =>
    `<div class="debug-line"><span class="debug-key">${this._formatClock(w.start)} &rarr; ${this._formatClock(w.end)}</span><span class="debug-value">${Math.round(w.duration_minutes)} min</span></div>`
  ).join("") || `<div class="debug-line"><span class="debug-key">(none)</span><span class="debug-value"></span></div>`;

  const alertRows = alerts.map((a) =>
    `<div class="debug-line"><span class="debug-key">${this._escape(a.event)} [${this._escape(a.severity)}]</span><span class="debug-value">${a.expires ? this._formatClock(a.expires) : ""}</span></div>`
  ).join("") || `<div class="debug-line"><span class="debug-key">(no alerts)</span><span class="debug-value"></span></div>`;

  return `
    <details class="debug-panel">
      <summary>
        <div class="debug-title"><span class="debug-title-main">Debug</span></div>
        <div class="debug-note">Disable with debug.panel: false</div>
      </summary>
      <div class="debug-body">
        <div class="debug-section">
          <div class="debug-section-title">Config</div>
          <div class="debug-line"><span class="debug-key">depth_threshold</span><span class="debug-value">${threshold} ${unitLabel}</span></div>
          <div class="debug-line"><span class="debug-key">wharf_buffer_minutes</span><span class="debug-value">${buffer}</span></div>
          <div class="debug-line"><span class="debug-key">marine_zone</span><span class="debug-value">${this._escape(zone)}</span></div>
          <div class="debug-line"><span class="debug-key">horizon</span><span class="debug-value">${horizon}h</span></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">Now</div>
          <div class="debug-line"><span class="debug-key">current height</span><span class="debug-value">${currentHeight.toFixed(2)} ${unitLabel}</span></div>
          <div class="debug-line"><span class="debug-key">chip status</span><span class="debug-value">${this._escape(chip.status)}</span></div>
          <div class="debug-line"><span class="debug-key">chip summary</span><span class="debug-value">${this._escape(chip.summary)}</span></div>
        </div>
        <div class="debug-section">
          <div class="debug-section-title">Extracted Windows (${windows.length})</div>
          ${windowRows}
        </div>
        <div class="debug-section">
          <div class="debug-section-title">Active Marine Alerts (${alerts.length})</div>
          ${alertRows}
        </div>
        <div class="debug-section">
          <div class="debug-section-title">Recent Predictions (first 8)</div>
          ${sampleRows}
        </div>
      </div>
    </details>
  `;
}
```

- [ ] **Step 2: Confirm helpers `_fmtDebugNumber`, `_fmtDebugValue`, `_formatDebugWindow`, `_debugStationLabel`, `_debugSource`, `_capitalize` are no longer referenced**

Grep:
```bash
grep -n "_fmtDebugNumber\|_fmtDebugValue\|_formatDebugWindow\|_debugStationLabel\|_debugSource\|_capitalize\|_ukhoEntityDisplayName" boatwise-card.js
```

Delete any of these helpers that have no remaining references.

- [ ] **Step 3: Verify parse + tests**

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 4: Commit**

```bash
git add boatwise-card.js
git commit -m "repurpose debug panel for boating-window diagnostics"
```

---

## Task 15: Final rename to BoatWise + docs

**Files:**
- Modify: `boatwise-card.js`
- Modify: `info.md`
- Modify: `README.md`
- Modify: `CHANGELOG.md`
- Create: `examples/boatwise-ipswich.yaml`
- Modify: `examples/minimal.yaml`
- Delete: `examples/canada-chs.yaml`, `examples/cherry-grove.yaml`, `examples/tide-only.yaml`

**Goal:** Final rename sweep. Update all string literals, CSS custom-property names, default titles, custom element identifiers, console banner, customCards entry, and the human-facing docs.

- [ ] **Step 1: Rename class identifiers in `boatwise-card.js`**

Use `Edit` with `replace_all: true` for each:
- `TideWiseCard` → `BoatWiseCard`
- `TideWiseCardEditor` → `BoatWiseCardEditor`
- `tidewise-card-editor` → `boatwise-card-editor`
- `tidewise-card` → `boatwise-card`
- `tidewise_card` → `boatwise_card` (in URL `application=` params)
- `TIDEWISE CARD` → `BOATWISE CARD` (console banner)
- The default config `title: "TideWise"` → `title: "BoatWise"`
- The CARD_TYPES array → `const CARD_TYPES = ["boatwise-card"];`
- The CARD_VERSION → `"1.0.0"`
- The `customCards.push({ type, name, description })` literal:
  ```js
  type: "boatwise-card",
  name: "BoatWise",
  description: "Tide-depth boating windows with NWS marine alerts",
  ```

- [ ] **Step 2: Update theme-mode value `"tidewise"` → `"boatwise"`**

In `_normalizeThemeMode`:
```js
_normalizeThemeMode(value) {
  return value === "auto" ? "auto" : "boatwise";
}
```

CSS attribute selector: `:host([theme-mode="auto"])` is unchanged. The default state (no `auto`) is what the `"boatwise"` value maps to.

Editor theme dropdown:
```html
<option value="boatwise" ${config.theme_mode !== "auto" ? "selected" : ""}>BoatWise</option>
```

- [ ] **Step 3: Rename CSS custom properties (cosmetic)**

The `--tw-*` prefix is harmless to keep, but for cleanliness rename to `--bw-*`:
- `--tw-panel-bg` → `--bw-panel-bg`
- `--tw-panel-border` → `--bw-panel-border`
- `--tw-chip-bg` → `--bw-chip-bg`
- `--tw-chip-border` → `--bw-chip-border`
- `--tw-chart-grid` → `--bw-chart-grid`
- `--tw-chart-axis` → `--bw-chart-axis`
- `--tw-chart-label-bg` → `--bw-chart-label-bg`
- `--tw-chart-now-label-bg` → `--bw-chart-now-label-bg`
- `--tw-chart-label-border` → `--bw-chart-label-border`
- `--tw-chart-now-label-border` → `--bw-chart-now-label-border`
- `--tw-chart-label-text` → `--bw-chart-label-text`
- `--tw-tide-line` → `--bw-tide-line`
- `--tw-marker-stroke` → `--bw-marker-stroke`
- `--tw-now-marker-stroke` → `--bw-now-marker-stroke`

Use `replace_all: true` for each.

- [ ] **Step 4: Update file banner comment at top**

Replace lines 1–6:
```js
/*
 * BoatWise Card v1.0.0
 * NOAA tides with depth-threshold boating windows and NWS marine alerts.
 * Forked from TideWise v0.9.5 (TheWillMiller/tide-wise).
 */
```

- [ ] **Step 5: Update `info.md`**

Read current content first, then write a BoatWise-focused short description:

```markdown
# BoatWise

NOAA tide predictions with depth-threshold boating windows, NWS marine alerts, and zone forecasts for Home Assistant.

Forked from [TideWise](https://github.com/TheWillMiller/tide-wise) — re-shaped for boaters who care about safe transit windows rather than fishing bite times.

- Tide-depth safe-window detection (configurable threshold)
- Wharf prep buffer
- NWS Marine Zone Small Craft Advisories, Gale and Storm Warnings
- NWS Marine Zone forecast (offshore wind, seas)
- 3-day forecast horizon
- Single NOAA CO-OPS provider — US only
```

- [ ] **Step 6: Rewrite `README.md`**

Replace the README with a BoatWise-focused version. Key sections:
- Title and goal
- Acknowledge fork origin (TideWise)
- Installation (HACS custom repo URL — user's fork URL; if not yet on GitHub, note local install)
- Quick start config (Ipswich example)
- Configuration reference (only the kept and new fields)
- Side-by-side install with TideWise
- Safety disclaimer
- License

Keep this concise — under 200 lines is fine. Drop all fishing/surf/Canada/UK content.

- [ ] **Step 7: Add `CHANGELOG.md` entry**

Prepend (or create section):

```markdown
## 1.0.0 — 2026-06-14

Initial BoatWise release. Forked from TideWise v0.9.5.

### Added
- Depth-threshold safe-window detection (`depth_threshold`, default 4.0 ft).
- Wharf prep buffer (`wharf_buffer_minutes`, default 30 min).
- NWS marine zone active alerts (`marine_zone`, e.g. `ANZ250`).
- NWS marine zone forecast — offshore wind and seas override land-point values.
- 3-day forecast horizon (`forecast_horizon_hours`, default 72).
- Status chip: GO NOW / GET TO WHARF NOW / TOO SHALLOW / ADVISORY.
- Upcoming-windows panel with arrival-time hints.
- Threshold-shaded tide chart.
- Unit-tested pure functions (`extractSafeWindows`, `statusChipState`, `parseMarineForecastPeriod`).

### Removed (vs. TideWise)
- Fishing bite-window scoring, modes, solunar/moon scoring.
- Surf Zone Forecast parsing, rip-current logic.
- Water-temperature, wave-height, rain-today, rip-risk scoring helpers.
- Canada CHS / DFO provider.
- UK UKHO Tides integration provider.
- `cherry-grove-tides-card` legacy alias.
```

- [ ] **Step 8: Replace examples**

Delete:
```bash
git rm examples/canada-chs.yaml examples/cherry-grove.yaml examples/tide-only.yaml
```

Replace `examples/minimal.yaml`:

```yaml
type: custom:boatwise-card
title: Local Boating Windows
station: "8441241"
depth_threshold: 4.0
wharf_buffer_minutes: 30
marine_zone: ANZ250
units: english
```

Create `examples/boatwise-ipswich.yaml`:

```yaml
type: custom:boatwise-card
title: Ipswich River
station: "8441241"            # Plum Island Sound, Ipswich Bay
depth_threshold: 4.0          # tune from experience
wharf_buffer_minutes: 30
marine_zone: ANZ250           # Cape Ann to Marblehead
units: english
wind_units: mph
auto_sources: true
grid_options:
  rows: full
  columns: 18
```

- [ ] **Step 9: Final verification**

Grep for any lingering TideWise references that should be gone:

```bash
grep -n "TideWise\|tidewise\|TIDEWISE\|cherry-grove\|cherry_grove\|fishing\|surf_zone\|ukho\|chs_iwls\|canada" boatwise-card.js
```

Acceptable remaining: a CSS `:host([theme-mode="boatwise"])` reference if applicable, the file banner mentioning the fork heritage, and the README acknowledging the fork. Nothing else.

Run:
```bash
npm run check
npm test
```

Both exit 0.

- [ ] **Step 10: Commit**

```bash
git add boatwise-card.js info.md README.md CHANGELOG.md examples/
git commit -m "rename to BoatWise: classes, custom element, theme, banner, docs, examples"
```

---

## Task 16: Manual smoke test in Home Assistant

**Goal:** Verify the card loads in a real HA instance, doesn't collide with an installed TideWise, and renders sensible values for the Ipswich station.

This task is **manual** — no code changes expected. If smoke testing surfaces a bug, file a fix as an additional task and add it to the plan.

- [ ] **Step 1: Install side-by-side with TideWise**

Copy `boatwise-card.js` into the HA `www/` directory (or install through HACS custom repository pointed at this fork). Add the resource:

```yaml
url: /local/boatwise-card.js
type: module
```

- [ ] **Step 2: Add the BoatWise card to a dashboard**

Use the visual editor: Search for "BoatWise" in the card picker. Configure with station `8441241`, depth threshold `4.0`, wharf buffer `30`, marine zone `ANZ250`.

- [ ] **Step 3: Confirm**

- Card renders without console errors.
- Tide chart shows threshold line + shading.
- Status chip shows one of the four states.
- Upcoming windows panel lists at least one window in the next 72 h.
- TideWise card (if installed) continues to work alongside.

- [ ] **Step 4: Note any issues**

Capture screenshots and any console errors. If issues are found, fix them with additional tasks before declaring done.

---

## Notes for Implementers

- **Side-effect guards:** The `customElements.define` and `window.customCards.push` calls must be guarded with `typeof customElements !== "undefined"` / `typeof window !== "undefined"` so that `node:test` can import the file without crashing. This guard is applied at the bottom of the file as shown in the file-structure section above.

- **Test isolation:** The pure-function tests are deterministic and run under `TZ=UTC`. If you add fixture-based tests for marine forecast parsing using real NWS text, store fixtures inline in the test file (no separate fixtures dir for now — keeps things simple).

- **Don't preserve backwards compatibility:** Per the spec, fishing-related YAML keys are silently dropped. The `setConfig` body simply ignores extra keys. No migration shim, no warnings.

- **Caches are per-instance:** `this._cache = new Map()` lives on the element. Two cards on the same dashboard each cache independently — that's intentional and avoids global state.

- **CSS variable rename is cosmetic:** If renaming `--tw-*` to `--bw-*` causes regressions you don't expect, leaving them as `--tw-*` is acceptable. The user-visible identifier is the custom-element name, not the CSS internals.
