# TideWise

TideWise is a Home Assistant Lovelace card for NOAA tide predictions, current tide height, next high/low tides, and optional fishing bite-window scoring.

It combines NOAA tide data with local Home Assistant entities such as weather, wind, water temperature, surf height, pressure, rain, and rip current risk. Missing entities are allowed; TideWise falls back to neutral scoring where possible.

## Features

- NOAA tide predictions using a configurable station ID
- Current interpolated tide height
- Next high and low tide
- 24-hour tide chart
- Optional fishing bite-window score
- Fishing modes for general, surf, inlet, flounder, trout/redfish, and sheepshead use
- Legacy support for `custom:cherry-grove-tides-card`

## Installation

### Manual

1. Copy `tidewise-card.js` to your Home Assistant `www` directory.
2. Add it as a Lovelace resource:

```yaml
url: /local/tidewise-card.js
type: module
```

3. Add the card to a dashboard.

### HACS

This repository is structured for HACS custom repository installation as a Lovelace plugin.

## Minimal Config

```yaml
type: custom:tidewise-card
title: Local Tides
station: "8661070"
units: english
mode: general
```

## Cherry Grove Example

```yaml
type: custom:tidewise-card
title: Cherry Grove Tides
station: "8661070"
units: english
mode: inlet
weather_entity: weather.nws_33_8552645_78_6761264_kmyr
water_temp_entity: sensor.noaa_surf_water_temperature
wave_height_entity: sensor.noaa_surf_surf_height
rip_current_risk_entity: sensor.noaa_surf_rip_current_risk
wind_speed_entity: sensor.noaa_weather_wind_speed
wind_direction_entity: sensor.noaa_weather_wind_direction
pressure_entity: sensor.noaa_weather_barometric_pressure
rain_today_entity: sensor.rain_sensor_rain_last_24h
```

## Tide-Only Config

```yaml
type: custom:tidewise-card
title: Local Tides
station: "8661070"
units: english
show_fishing_score: false
```

## Configuration

| Option | Required | Default | Description |
| --- | --- | --- | --- |
| `type` | Yes |  | Use `custom:tidewise-card`. The legacy `custom:cherry-grove-tides-card` alias also works. |
| `title` | No | `TideWise` | Card title. |
| `station` | Yes |  | NOAA tides and currents station ID. |
| `units` | No | `english` | NOAA units, usually `english` or `metric`. |
| `mode` | No | `general` | Fishing score mode: `general`, `surf`, `inlet`, `flounder`, `trout_redfish`, or `sheepshead`. |
| `show_fishing_score` | No | `true` | Set to `false` for a tide-only card. |
| `latitude` | No | Home Assistant home latitude, then Cherry Grove fallback | Latitude for moon/solunar scoring. |
| `longitude` | No | Home Assistant home longitude, then Cherry Grove fallback | Longitude for moon/solunar scoring. |
| `weather_entity` | No | First available weather entity | Weather condition source. |
| `water_temp_entity` | No |  | Water temperature sensor. Fahrenheit and Celsius are supported. |
| `wave_height_entity` | No |  | Wave/surf height sensor. Feet and meters are supported. |
| `rip_current_risk_entity` | No |  | Rip current risk sensor. |
| `unsafe_to_swim_entity` | No |  | Boolean or text entity for unsafe surf/swim conditions. |
| `wind_speed_entity` | No | Weather attribute fallback | Wind speed sensor. mph, km/h, m/s, and knots are supported. |
| `wind_direction_entity` | No | Weather attribute fallback | Wind bearing in degrees. |
| `pressure_entity` | No | Weather attribute fallback | Barometric pressure. hPa and inHg are supported. |
| `pressure_trend_entity` | No |  | Pressure trend entity. |
| `rain_today_entity` | No |  | Rainfall in the last 24 hours. Inches and mm are supported. |

## Finding A NOAA Station

Use a NOAA tides and currents station ID near your location. TideWise uses the NOAA CO-OPS data API, so station IDs must support tide predictions.

## Safety

TideWise is informational. It is not a marine safety, navigation, emergency, or surf safety tool. Always check official local forecasts, marine advisories, beach warnings, and on-site conditions before entering the water or boating.

## License

Free for personal and non-commercial use under PolyForm Noncommercial License 1.0.0.

Commercial use requires separate written permission.

## Development

The distributable card is `tidewise-card.js`.
