# BoatWise: TideWise Fork for Boating Windows

**Date:** 2026-06-14
**Status:** Design — awaiting implementation plan
**Author:** Joseph Hughes

## Goal

Fork TideWise into **BoatWise**, a Home Assistant Lovelace card that answers a
single question: *"Is it safe to take the boat out, and if not, when is the
next window?"* The user boats the Ipswich River (Massachusetts) and needs at
least half-tide depth in both directions to transit the river safely between
the wharf and the open ocean. Small-craft advisories and changing weather also
factor into go/no-go decisions.

BoatWise replaces TideWise's fishing-window concept with a tide-depth window
concept and substitutes marine-zone forecasts and advisories for the surf-zone
and rip-current data.

The fork must coexist with an installed TideWise card (different custom
element, different file, different HACS identity).

## Non-Goals

- Multi-region support beyond US NOAA. Canada CHS and UK UKHO providers are
  removed.
- Marine-safety certification. Card remains informational, mirroring
  TideWise's safety disclaimer.
- Backwards compatibility with TideWise YAML keys. Fishing-related keys are
  silently ignored. The `custom:cherry-grove-tides-card` alias is dropped.
- Per-boat draft modeling, currents, or wave-impact-on-channel-depth
  calculations. The depth threshold is a single configurable scalar.
- Auto-detection of NWS marine zone from coordinates (the `/points` endpoint
  returns only land zones).

## Naming & Identity

| Item | TideWise | BoatWise |
| --- | --- | --- |
| Custom element | `tidewise-card` | `boatwise-card` |
| Card type | `custom:tidewise-card` | `custom:boatwise-card` |
| JS file | `tidewise-card.js` | `boatwise-card.js` |
| Class name | `TideWiseCard` | `BoatWiseCard` |
| HACS name | `TideWise` | `BoatWise` |

The repository folder on disk stays `tide-wise` (local-only, doesn't affect
side-by-side install).

## Core Concept: Safe-Window Logic

### Depth threshold

- Config field: `depth_threshold` (numeric). Default `4.0`.
- Units: feet when `units: english`, meters when `units: metric`.
- Switching `units` does **not** auto-convert the stored `depth_threshold`
  value; the user must re-enter it after a unit change.
- Compared directly against NOAA's predicted tide height in the station's
  native datum (MLLW for US stations). No datum conversion.
- A point in the tide series is `safe` iff `tide_height >= depth_threshold`.

### Window extraction algorithm

1. Pull NOAA predictions out to **72 hours** from now (config:
   `forecast_horizon_hours`, default 72, YAML-only, valid {24, 48, 72}).
2. NOAA returns 6-minute interval data. Walk the series, marking each point
   `safe` or `unsafe`.
3. Group consecutive `safe` points into windows.
4. Compute precise window boundaries via linear interpolation between
   adjacent samples — so a window that opens between two 6-min samples gets
   a minute-precise start time, not a 6-min jagged edge.
5. Discard any window fully in the past (`end < now`).
6. For each remaining window, compute:
   - `start` — first time tide clears threshold
   - `end` — first time tide drops back below threshold
   - `duration_minutes`
   - `arrive_by` — `start - wharf_buffer_minutes`
   - `tide_direction_at_start` — almost always "rising" since the window
     opens as tide rises; labeled for clarity
   - `tide_direction_at_end` — always "falling"

### Wharf prep buffer

- Config field: `wharf_buffer_minutes`. Default `30`. Range 0–180.
- Buffer **does not shrink the safe-transit window itself**. It only affects
  the displayed "arrive at wharf" hint.
- Rationale: the river depth constraint is purely about transit; the buffer
  is human prep time at the dock. Decoupling them keeps the window math
  clean and matches the user's mental model.

### Status determination (single chip, ordered priority)

1. **ADVISORY** (red) — an active NWS marine alert of relevant type is in
   effect for the configured marine zone. Wins over all other states.
2. **GO NOW** (green) — `now` is inside a safe window.
3. **GET TO WHARF NOW** (amber) — `now` is inside the buffer window of an
   upcoming safe window (`arrive_by <= now < start`).
4. **TOO SHALLOW** (gray) — none of the above; next window (if any) is
   shown in the summary line.

### Edge cases

- Window currently open: headline shows `Open until HH:MM`.
- No window in the next 72 h: chip = TOO SHALLOW, summary = "next window:
  none in next 3 days."
- Threshold above today's high tide (rare neap-tide scenario): same as
  above — graceful degradation.
- Window straddles the 72 h horizon: clip `end` at the horizon and label
  with a `…` or similar truncation indicator.

## NWS Marine Data

### Marine zone resolution

- Config field: `marine_zone` (text). Example: `ANZ250` (Cape Ann–Marblehead).
- Manual entry. Visual editor includes a "Find your zone" link to
  `https://www.weather.gov/marine_charts`.
- Blank value disables both marine alerts and marine forecast (graceful
  degradation — card still renders tide windows).

### Active alerts

- Endpoint: `GET https://api.weather.gov/alerts/active/zone/{marine_zone}`
- No auth. Existing TideWise User-Agent reused.
- Relevant event types (case-insensitive prefix match):
  - Small Craft Advisory
  - Gale Warning / Watch
  - Storm Warning / Watch
  - Hurricane Warning / Watch
  - Special Marine Warning
  - Marine Weather Statement
  - Hazardous Seas Warning / Watch
- Severity filter: include `Severe` and `Moderate`. Drop `Minor` and
  `Unknown`.
- When multiple alerts are active, the most severe (then earliest-expiring)
  is the headline.
- Each alert exposed to the UI as `{ event, expires, headline, severity }`.

### Marine zone forecast

- Endpoint:
  `GET https://api.weather.gov/zones/forecast/{marine_zone}/forecast`
- Returns period-based text forecasts ("Tonight," "Friday," "Friday night").
- Light text parser extracts (best-effort) from the current period:
  - Wind speed range and gusts (e.g., "Wind east 10 to 15 kt, gusts to 20 kt")
  - Seas height (e.g., "Seas 2 to 4 ft")
  - Conditions phrase (e.g., "Showers likely")
- Parser mirrors the existing surf-zone parser pattern in TideWise — wrap
  numbers, fall back to "unknown" on parse failure.
- Marine-zone wind values **override** the land-point NWS wind when both are
  available (offshore wind is the relevant signal for boaters).
- Override precedence (highest to lowest): HA entity (`wind_speed_entity` /
  `wind_direction_entity`) → marine zone forecast → land-point NWS forecast.
  A user-configured HA entity always wins, mirroring TideWise's
  manual-entity-takes-priority convention.

### Caching & failure modes

- Alerts: in-memory cache, 5-minute TTL.
- Forecast: in-memory cache, 30-minute TTL.
- 404 on alerts → log + display "marine zone not found" inline in the
  editor; card body still renders.
- Network timeout / 5xx → fall back to no-alert state; subtle "marine data
  unavailable" subtext under the conditions row.
- Blank `marine_zone` → skip both fetches; no alert chip; no marine wind
  override.

## UI Changes

### Header strip

- **Status chip** (single): GO NOW / GET TO WHARF NOW / TOO SHALLOW /
  ADVISORY.
- **Summary line** next to chip, content depends on state:
  - GO NOW: `Open until 1:42 PM`
  - GET TO WHARF NOW: `Window opens 9:14 AM`
  - TOO SHALLOW: `Next window: 9:14 AM (arrive 8:44 AM)`
  - ADVISORY: `<event title> · expires <time>`

### Tide chart

- Existing 24-hour curve kept as primary view.
- New horizontal dashed line at `depth_threshold`.
- Background shading below threshold tinted light red.
- Existing current-time marker and hover/tap behavior preserved.

### Upcoming windows panel

- Replaces the existing bite-window strip.
- Compact table, one row per future window in the 72 h horizon:
  ```
  Sat Jun 14 · 9:14 AM → 1:42 PM · 4h 28m · arrive 8:44 AM
  ```
- Today's currently-open window (if any) highlighted at top.
- Rows that overlap an active advisory get a red `⚠` prefix.

### Conditions row

Keep:
- Wind (marine zone forecast value, current obs in parens when available)
- Pressure + trend
- Water temperature

Remove:
- Moon phase
- Surf height
- Rip current risk
- Solunar / bite-window indicators

### Theme

- Existing `tidewise` and `auto` themes carry over (renamed to `boatwise`
  and `auto`).
- Color tokens added for new chip states: green (GO), amber (GET TO WHARF),
  gray (SHALLOW), red (ADVISORY).

## Configuration

### New fields

| Field | Default | YAML-only? | Notes |
| --- | --- | --- | --- |
| `depth_threshold` | `4.0` | No | Feet or meters per `units`. |
| `wharf_buffer_minutes` | `30` | No | Slider 0–180. |
| `marine_zone` | _(empty)_ | No | NWS marine zone ID, e.g. `ANZ250`. |
| `forecast_horizon_hours` | `72` | Yes | One of {24, 48, 72}. |

### Kept fields

`station`, `units`, `wind_units`, `title`, `theme_mode`, `latitude`,
`longitude`, `auto_sources`, `weather_entity`, `water_temp_entity`,
`wind_speed_entity`, `wind_direction_entity`, `pressure_entity`,
`grid_options`.

### Removed fields

`mode`, `show_fishing_score`, `auto_surf_forecast`, `srf_region`,
`beach_state`, `beach_area`, `nws_office`, `surf_zone`, `wave_height_entity`,
`rip_current_risk_entity`, `unsafe_to_swim_entity`, `rain_today_entity`,
`pressure_trend_entity`, `ca_region`, `ca_station`, `ca_station_code`,
`provider`, all `ukho_*` fields, `time_offset_minutes`, `height_offset`.

`debug` is kept and repurposed (see "Debug panel" under Open Questions).

### Editor layout (top to bottom)

1. NOAA station picker (existing 50-station list + custom ID)
2. **Depth threshold** (new) — numeric input with tooltip
3. **Wharf buffer** (new) — slider
4. **Marine zone** (new) — text input + help link
5. Forecast point — lat/lon + map picker (renamed from "Fishing point")
6. Units / wind units / theme
7. Optional Home Assistant entity overrides (the kept ones above)
8. Grid size

### Minimal config

```yaml
type: custom:boatwise-card
title: Ipswich River
station: "8443970"        # placeholder — actual Ipswich-area station TBD
depth_threshold: 4.0
wharf_buffer_minutes: 30
marine_zone: ANZ250
units: english
```

## File-Level Implementation Notes

The existing `tidewise-card.js` is a single 3,551-line file. The fork
inherits this structure (no major restructure as part of this design), but
the following internal sections are affected:

- **Renaming sweep:** `tidewise-card` → `boatwise-card`, `TideWiseCard` →
  `BoatWiseCard`, CSS class prefixes `.tidewise-*` (if any) → `.boatwise-*`,
  string literals.
- **Removed code:**
  - All `_*Score`, `_solunarScore`, `_windScore`, `_weatherScore`,
    `_waterTempScore`, `_waveScore`, `_rainScore`, `_pressureScore`,
    `_lightScore`, `_fishingMode*` helpers tied to bite-window scoring.
    (Wind/pressure parsing utilities that produce raw values remain;
    scoring layers go.)
  - Bite-window curve renderer.
  - Surf Zone Forecast parser.
  - Canada CHS adapter and UK UKHO adapter.
  - Cherry Grove legacy alias registration.
- **Added code (new modules conceptually, may live in same file initially):**
  - `extractSafeWindows(series, threshold)` — pure function.
  - `marineAlertsFetcher(zoneId, ua)` — async, cached 5 min.
  - `marineZoneForecastFetcher(zoneId, ua)` — async, cached 30 min.
  - `parseMarineForecastPeriod(text)` — extracts wind/seas/conditions.
  - `statusChipState(windows, alerts, now, buffer)` — pure function returning
    `{ status, summary }`.
  - Upcoming-windows panel renderer.
  - Threshold shading on tide chart.

A separate refactor to split the file is **out of scope** for this design.

## Testing Approach

- Unit tests for the pure functions, where they exist as separable units:
  - `extractSafeWindows` — synthetic tide series with known crossings;
    verify boundary interpolation and edge cases (window straddling
    horizon, empty input, threshold above max).
  - `statusChipState` — table-driven cases for each priority branch.
  - `parseMarineForecastPeriod` — fixtures from real NWS text products.
- Manual smoke test in a running Home Assistant instance against a NOAA
  station near Ipswich (likely 8443970 Boston, or 8441241 Plum Island Sound
  — to be confirmed during implementation).
- Side-by-side install verification: the card loads alongside TideWise
  without collisions in element registry or HACS.

TideWise currently has `npm run check` as the only automated check. The fork
inherits that and adds a JS-side test runner only if the pure functions are
extracted to separate modules; otherwise tests remain inline / manual.

## Migration & Coexistence

- **No data migration.** Users coming from TideWise rebuild their card from
  the visual editor.
- **Side-by-side install:**
  - HACS treats this repo / branch as a separate plugin since the JS
    filename and custom element name differ.
  - Both cards can be added as separate Lovelace resources.
  - Both cards can hit the same NOAA endpoints — caches are per-card
    instance, no shared state.

## Open Questions

1. **Exact NOAA station for Ipswich River.** Candidates: 8441241 (Plum
   Island Sound), 8443970 (Boston). To be confirmed by the user during
   implementation. Default config example uses 8443970 as a placeholder.
2. **Debug panel.** Decision: **repurpose**. The existing hidden YAML-only
   debug panel becomes a window/threshold diagnostic surface — dumps recent
   tide series samples, extracted windows, threshold value, and the
   resolved status chip state. Useful for tuning the depth threshold during
   the first month of use. Same `debug: { enabled: true, panel: true }`
   YAML-only activation.
3. **Icon.** TideWise's wave icon is generic enough to reuse as a placeholder.
   A boat-themed replacement can come later.
4. **Folder/repo rename.** User opted to keep the folder as `tide-wise`.
   Confirmed.

## Risks

- **NWS marine endpoints occasionally 5xx or rate-limit aggressively.**
  Mitigation: caching plus graceful degradation already specified.
- **Marine forecast text parsing is fragile across NWS offices.** Mitigation:
  parser falls back to "unknown" rather than guessing; raw forecast text
  remains accessible for debugging.
- **Depth threshold tuning is empirical.** The user has explicitly said the
  default is a starting estimate they will adjust. The card must make this
  easy: numeric input prominently placed, immediate chart shading feedback.
- **Single-file 3,551-line module.** Refactoring is out of scope here, but
  the file's size makes incremental changes harder. If implementation
  pressure mounts, a follow-up plan to split the file is the right next
  step — not bundled into this fork.
