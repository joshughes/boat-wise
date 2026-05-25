# Changelog

## Unreleased

### Fixed

- Scoped NWS Surf Zone Forecast rip-risk parsing to the matching NWS forecast zone when available.
- Recognized active `Rest of Today` surf forecast sections so expired or future rip-risk wording is less likely to cap the current score incorrectly.
- Avoided falling back to whole-product SRF risk text when timed rip-risk periods exist but none apply to the current time.

## 0.6.0

### Added

- Added early Canada CHS/DFO tide provider support with Canadian region and station pickers.
- Added a Canada CHS example configuration.

### Changed

- Improved narrow/mobile card layout so header badges, fishing reason text, safety warnings, and tide pills wrap more cleanly.
- Added README notes for future international tide-provider support and UK provider research.
- Filtered the Canadian station picker to operating CHS stations that advertise water-level predictions.

## 0.5.1

### Fixed

- Fixed the visual editor repeatedly re-rendering from Home Assistant state updates, which could cause mobile station dropdowns to close immediately on iOS Safari/Chrome.

## 0.5.0

### Added

- Added a hidden YAML-only TideWise debug panel for troubleshooting fishing score inputs, component weights, caps, and data sources.
- Added collapsed-by-default debug presentation with internal scrolling.
- Added a subtle high rip risk safety warning badge when active.
- Added first-pass timed NWS Surf Zone Forecast rip-risk period parsing when the forecast text includes usable timing.

### Fixed

- Fixed fishing chart coloring so current safety caps do not globally flatten the full future bite curve.
- Clarified debug score terminology by separating component sum, pre-cap score, moon multiplier, score after moon, active cap, final current score, and display score.
- Clarified debug cap scope for current/near-term safety caps versus future bite potential.

### Changed

- Shortened the public fishing reason line and made future bite windows clearer.
- Updated release references to `v0.5.0`.

## 0.4.9

### Added

- Added opt-in Home Assistant theme color support with `theme_mode: auto`.
- Added a visual editor theme selector.

### Changed

- Kept the existing TideWise ocean-glass styling as the default `theme_mode: tidewise`.
- Updated chart drawing to read theme-aware CSS colors when theme mode is enabled.
- Updated release references to `v0.4.9`.

## 0.4.8

### Added

- Added frontend syntax-check GitHub Actions workflow.
- Added feature request issue template.
- Added HACS default submission prep notes.
- Added README roadmap and contribution guidance.

### Fixed

- Switched README icon and screenshots to absolute raw GitHub URLs so HACS can render them from the release details view.
- Added a PNG icon fallback for HACS README rendering.

### Changed

- Updated issue template placeholders to the current release.
- Expanded package keywords for HACS/Home Assistant discoverability.
- Updated release references to `v0.4.8`.

## 0.4.7

### Added

- Added a compact wind chip to the current tide row when wind data is available.

### Fixed

- Stabilized fishing outlook labels with a deadband so tiny score changes do not constantly flip between nearby bands.
- Smoothed chart score colors with a small rolling average.
- Fixed fishing/forecast coordinate priority so configured coordinates are used before the Home Assistant home fallback.

### Changed

- Updated release references to `v0.4.7`.

## 0.4.6

### Added

- Added a compact water temperature chip to the tide/fishing header when water temperature data is available.
- Added a visual editor button to fill fishing/forecast coordinates from the NOAA station location.

### Changed

- Widened the visual editor title field and improved long-title wrapping on the card.
- Clarified that latitude/longitude are fishing/forecast coordinates, not necessarily the Home Assistant home location.
- Updated release references to `v0.4.6`.

## 0.4.5

### Changed

- Expanded the visual editor preset station dropdown from 15 stations to 50 verified NOAA tide prediction stations.
- Added a high/low tide fallback for NOAA stations that do not return 6-minute interval predictions.
- Updated release references to `v0.4.5`.

## 0.4.4

### Added

- Added a TideWise wave icon for the README/HACS details view.

### Changed

- Clarified the current release candidate near the top of the README.
- Added troubleshooting guidance for HACS commit-hash version labels before a full GitHub Release is published.
- Bumped release references to `v0.4.4`.

## 0.4.3

### Added

- Added HACS validation workflow using `hacs/action` with category `plugin`.
- Added Beta Install Report and Works For Me / Confirmed Station issue templates.
- Added visible beta feedback CTA asking users to star the repo or open a quick report.
- Added privacy/no-telemetry language.
- Added project insights/adoption tracking notes.
- Added standalone beta tester checklist.

### Changed

- Updated `hacs.json` metadata with `country: US`.
- Updated README install, troubleshooting, and HACS cache guidance.
- Bumped release references to `v0.4.3`.

### Known Issues

- HACS may cache README metadata after updates; redownload the latest release and hard-refresh if old text appears.
- Recent rainfall totals still require a local sensor or Home Assistant weather integration.

## 0.4.2

- Matched NWS Surf Zone Forecast fetching more closely to NOAA IT ALL by trying the forecast.weather.gov SRF text product first.
- Improved rip current parsing for dangerous rip current wording.
- Improved surf height range parsing.
- Improved water temperature parsing for lower/mid/upper temperature bands.

## 0.4.1

- Updated HACS custom repository instructions to use the Dashboard category.

## 0.4.0

- Added NWS Surf Zone Forecast auto parsing for rip current risk, surf height, and water temperature where available.
- Added `auto_surf_forecast` and optional `nws_office` configuration.
- Improved water temperature fallback priority across manual entities, NOAA CO-OPS observations, and NWS surf forecasts.

## 0.3.0

- Added `auto_sources` for direct NOAA/NWS fallback data.
- Added NOAA CO-OPS latest water temperature, wind, and air pressure fallbacks where supported by the selected station.
- Added NWS hourly forecast weather and wind fallbacks from latitude/longitude.
- Added visual editor control for enabling or disabling NOAA/NWS auto sources.

## 0.2.1

- Fixed visual editor station preset title updates after the first station selection.

## 0.2.0

- Added a Home Assistant visual editor for TideWise card configuration.
- Added common NOAA tide station presets with custom station ID support.
- Added editor controls for title, units, fishing mode, fishing score visibility, latitude, longitude, and dashboard sizing.
- Added a Home Assistant home location helper for latitude/longitude.

## 0.1.2

- Added recommended Home Assistant grid sizing to README and examples.

## 0.1.1

- Documented HACS custom repository installation.
- Updated stable CDN install examples to `v0.1.1`.

## 0.1.0

- Initial TideWise public release scaffold.
- Renamed the public card type to `custom:tidewise-card`.
- Added legacy support for `custom:cherry-grove-tides-card`.
- Added optional `show_fishing_score` tide-only mode.
- Added HACS metadata, README, and example dashboard configs.
