# BoatWise

NOAA tide predictions with depth-threshold boating windows, NWS marine alerts, and zone forecasts for Home Assistant.

Forked from [TideWise](https://github.com/TheWillMiller/tide-wise) — reshaped for boaters who want to know when the river is deep enough to safely take the boat out.

## What It Does

Shows:
- A status chip: **GO NOW**, **GET TO WHARF NOW**, **TOO SHALLOW**, or **ADVISORY**.
- A tide chart with a horizontal threshold line and shaded "too shallow" region.
- An "Upcoming Boating Windows" panel listing each continuous block in the next 3 days where tide >= your configured depth threshold.
- Marine wind and seas from the NWS marine zone forecast.
- Active Small Craft Advisories, Gale Warnings, Storm Warnings for your marine zone.

## Quick Start

```yaml
type: custom:boatwise-card
title: Ipswich River
station: "8441241"          # NOAA station for your area (Plum Island Sound)
depth_threshold: 4.0        # feet; tune from experience
wharf_buffer_minutes: 30    # how long to load up at the wharf
marine_zone: ANZ250         # NWS marine zone, e.g. Cape Ann to Marblehead
units: english
```

## Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `station` | _(required)_ | NOAA CO-OPS station ID for tide predictions. |
| `depth_threshold` | `4.0` | Tide height (ft or m) below which the river is too shallow. |
| `wharf_buffer_minutes` | `30` | Prep time at the wharf before transit. Shifts the "arrive by" hint. |
| `marine_zone` | `""` | NWS marine zone ID (e.g. `ANZ250`). [Find your zone](https://www.weather.gov/marine_charts). Leave blank to disable marine alerts and forecast. |
| `forecast_horizon_hours` | `72` | YAML-only. One of `24`, `48`, `72`. |
| `units` | `english` | `english` (feet) or `metric` (meters). |
| `wind_units` | `auto` | `auto`, `mph`, `kmh`, `knots`, or `beaufort`. |
| `theme_mode` | `boatwise` | `boatwise` (built-in style) or `auto` (HA theme colors). |
| `title` | `BoatWise` | Card title. |
| `latitude` / `longitude` | _(Plum Island Sound)_ | Used for NWS land forecast lookup. |
| `auto_sources` | `true` | Fetch NWS marine + land data automatically. |
| `weather_entity` / `water_temp_entity` / `wind_speed_entity` / `wind_direction_entity` / `pressure_entity` | _(blank)_ | Optional Home Assistant entity overrides. |

## Side-by-Side with TideWise

BoatWise uses a different custom element name (`boatwise-card`) and JS filename (`boatwise-card.js`) so you can install it alongside TideWise. Both can run on the same dashboard.

## Installation

Install via HACS as a custom repository:

1. HACS -> three-dot menu -> Custom repositories
2. Add this repository URL with category **Dashboard**
3. Install BoatWise
4. Hard-refresh your browser
5. Add the card from the dashboard editor

## Safety

BoatWise is informational. Always check official local forecasts, marine advisories, and on-site conditions before going out on the water.

## License

PolyForm Noncommercial License 1.0.0 (same as TideWise).

## Development

```bash
npm run check    # syntax check
npm test         # run unit tests for pure functions
```
