# Changelog

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
