/*
 * TideWise Card v0.1.2
 * NOAA tides with optional bite-window fishing quality scoring.
 *
 * Legacy alias: custom:cherry-grove-tides-card
 */

const CARD_VERSION = "0.1.2";
const CARD_TYPES = ["tidewise-card", "cherry-grove-tides-card"];

const STYLES = `
  :host {
    --wave: #2a7a94; --wave-dark: #1a5f72; --gold: #e8b84b;
    --low-color: #2a7a94; --high-color: #0a7a70; --text: #0a1e28; --text-muted: #1e4d5e;
    --elite: #16a34a; --prime: #2563eb; --good: #0891b2; --fair: #f59e0b; --slow: #dc2626;
    --font-main: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Arial, sans-serif;
    --font-mono: "SF Mono", "Roboto Mono", "Courier New", monospace;
    display: block; font-family: var(--font-main); color: var(--text);
  }
  .card-outer {
    background: linear-gradient(135deg, rgba(255,255,255,0.70), rgba(222,244,248,0.58));
    backdrop-filter: blur(12px) saturate(1.08); -webkit-backdrop-filter: blur(12px) saturate(1.08);
    border-radius: 22px; padding: 8px 16px 8px;
    border: 1px solid rgba(255,255,255,0.40); box-shadow: 0 5px 24px rgba(10,50,70,0.14);
    position: relative; overflow: hidden;
  }
  ha-card { background: transparent !important; box-shadow: none !important; border-radius: 22px !important; }
  .card-outer::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(42,122,148,0.62), transparent); }
  .header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 5px; flex-wrap: wrap; }
  .title { font-size: 28px; font-weight: 800; color: var(--text); white-space: nowrap; letter-spacing: -0.02em; }
  .subtitle { font-size: 13px; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 650; white-space: nowrap; }
  .current-row { display: flex; align-items: center; gap: 13px; background: rgba(255,255,255,0.35); border: 1px solid rgba(42,122,148,0.20); border-radius: 14px; padding: 7px 13px; margin-bottom: 6px; }
  .current-icon { font-size: 22px; animation: bob 3s ease-in-out infinite; flex-shrink: 0; }
  @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
  .current-label { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--wave-dark); margin-bottom: 2px; font-weight: 750; }
  .current-value { font-family: var(--font-mono); font-size: 36px; font-weight: 800; color: var(--text); line-height: 1; }
  .current-unit { font-size: 18px; color: var(--text-muted); font-weight: 650; }
  .direction-chip { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 18px; color: var(--wave-dark); font-weight: 750; flex-shrink: 0; }
  .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--wave); box-shadow: 0 0 0 3px rgba(42,122,148,0.25); animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.75)} }
  .chart-section { margin-bottom: 5px; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px; }
  .section-label { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); font-weight: 750; white-space: nowrap; }
  .fish-badge-row { display: flex; align-items: center; gap: 7px; min-width: 0; }
  .fish-score { font-size: 13px; font-weight: 850; padding: 2px 9px; border-radius: 99px; white-space: nowrap; }
  .score-elite { background: rgba(30,160,100,0.18); color: #0d8050; }
  .score-prime { background: rgba(42,122,148,0.18); color: var(--wave-dark); }
  .score-good { background: rgba(42,122,148,0.12); color: var(--wave-dark); }
  .score-fair { background: rgba(232,184,75,0.20); color: #8a6a10; }
  .score-slow { background: rgba(192,80,48,0.14); color: #8a3018; }
  .fish-moon { font-size: 13px; color: var(--text-muted); font-weight: 650; white-space: nowrap; }
  .chart-wrap { position: relative; height: 95px; border-radius: 10px; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
  .x-row { display: flex; justify-content: space-between; margin-top: 2px; padding: 0 2px; }
  .x-tick { font-size: 13px; font-weight: 650; color: var(--text-muted); }
  .fish-footer { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: 2px; margin-bottom: 2px; }
  .fish-reason { font-size: 12px; color: var(--text-muted); font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .fish-next { font-size: 12px; color: var(--wave-dark); font-weight: 800; white-space: nowrap; flex-shrink: 0; }
  .fish-legend { display: flex; align-items: center; gap: 12px; margin: 2px 0 6px; padding-left: 2px; min-width: 0; flex-wrap: nowrap; }
  .legend-item { display: flex; align-items: center; gap: 5px; font-size: 12.5px; color: var(--text-muted); font-weight: 750; white-space: nowrap; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .legend-dot.elite{background:var(--elite)} .legend-dot.prime{background:var(--prime)} .legend-dot.good{background:var(--good)} .legend-dot.fair{background:var(--fair)} .legend-dot.slow{background:var(--slow)}
  .legend-item.elite{color:#0f7a38} .legend-item.prime{color:#1d4ed8} .legend-item.good{color:#0e7490} .legend-item.fair{color:#9a5b00} .legend-item.slow{color:#a51f1f}
  .tides-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .tide-pill { background: rgba(255,255,255,0.35); border: 1px solid rgba(42,122,148,0.20); border-radius: 12px; padding: 5px 12px; }
  .pill-label { font-size: 13px; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 3px; font-weight: 750; }
  .pill-label.low{color:var(--low-color)} .pill-label.high{color:var(--high-color)}
  .pill-time { font-family: var(--font-mono); font-size: 26px; font-weight: 800; color: var(--text); line-height: 1.1; }
  .pill-arrow { font-size: 16px; margin-right: 4px; }
  .pill-arrow.low{color:var(--low-color)} .pill-arrow.high{color:var(--high-color)}
  .pill-ft { font-size: 16px; color: var(--text-muted); font-weight: 650; }
  .loading,.error { text-align: center; padding: 30px 20px; color: var(--text-muted); font-size: 14px; }
  .error{color:#c04444}
  .spinner { width: 28px; height: 28px; border: 2px solid rgba(255,255,255,0.40); border-top-color: var(--wave); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to{transform:rotate(360deg)} }
`;

class TideWiseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._data = null;
    this._refreshInterval = null;
    this._clockInterval = null;
    this._chartCanvas = null;
  }

  static getStubConfig() {
    return {
      title: "TideWise",
      station: "8661070",
      units: "english",
      mode: "general",
      show_fishing_score: true,
      latitude: 33.688,
      longitude: -78.886
    };
  }

  set hass(hass) { this._hass = hass; }

  setConfig(config) {
    if (!config.station) throw new Error("TideWise requires a NOAA station ID.");
    this._config = {
      title: config.title || "TideWise",
      station: String(config.station),
      units: config.units || "english",
      weather_entity: config.weather_entity || "",
      water_temp_entity: config.water_temp_entity || "",
      wave_height_entity: config.wave_height_entity || "",
      rain_today_entity: config.rain_today_entity || "",
      pressure_trend_entity: config.pressure_trend_entity || "",
      wind_speed_entity: config.wind_speed_entity || "",
      wind_direction_entity: config.wind_direction_entity || "",
      pressure_entity: config.pressure_entity || "",
      cloud_cover_entity: config.cloud_cover_entity || "",
      rip_current_risk_entity: config.rip_current_risk_entity || "",
      unsafe_to_swim_entity: config.unsafe_to_swim_entity || "",
      latitude: Number(config.latitude) || 33.688,
      longitude: Number(config.longitude) || -78.886,
      mode: String(config.mode || "general").toLowerCase(),
      show_fishing_score: config.show_fishing_score !== false
    };
    this._render();
    this._fetchData();
  }

  connectedCallback() {
    this._refreshInterval = setInterval(() => this._fetchData(), 15 * 60 * 1000);
    this._clockInterval = setInterval(() => this._updateLive(), 60 * 1000);
  }

  disconnectedCallback() {
    clearInterval(this._refreshInterval);
    clearInterval(this._clockInterval);
  }

  async _fetchData() {
    const { station, units } = this._config;
    const today = this._dateStr(0);
    const tomorrow = this._dateStr(1);
    const base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
    const cp = `station=${station}&datum=MLLW&time_zone=lst_ldt&units=${units}&application=tidewise_card&format=json`;
    try {
      const [cr, hr] = await Promise.all([
        fetch(`${base}?begin_date=${today}&end_date=${tomorrow}&${cp}&product=predictions&interval=6`),
        fetch(`${base}?begin_date=${today}&end_date=${tomorrow}&${cp}&product=predictions&interval=hilo`)
      ]);
      const cj = await cr.json();
      const hj = await hr.json();
      if (cj.error || hj.error) throw new Error(cj.error?.message || hj.error?.message || "NOAA error");
      this._data = { predictions: cj.predictions || [], hilo: hj.predictions || [] };
      this._renderData();
    } catch (err) {
      this._renderError(err.message);
    }
  }

  _dateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  _parsePredictionTime(t) {
    const [dp, tp] = String(t || "").split(" ");
    if (!dp || !tp) return new Date(NaN);
    const [y, mo, d] = dp.split("-").map(Number);
    const [h, m] = tp.split(":").map(Number);
    return new Date(y, mo - 1, d, h, m);
  }

  _rollingPredictions(predictions, now) {
    if (!Array.isArray(predictions) || !predictions.length) return [];
    const start = now.getTime() - 6 * 60 * 1000;
    const end = now.getTime() + 24 * 60 * 60 * 1000;
    const rolling = predictions.filter((p) => {
      const t = this._parsePredictionTime(p.t).getTime();
      return Number.isFinite(t) && t >= start && t <= end;
    });
    return rolling.length >= 4 ? rolling : predictions;
  }

  _xAxisHtml(predictions) {
    if (!predictions || predictions.length < 2) {
      return `<div class="x-row"><span class="x-tick">Now</span><span class="x-tick">+6h</span><span class="x-tick">+12h</span><span class="x-tick">+18h</span><span class="x-tick">+24h</span></div>`;
    }
    const start = this._parsePredictionTime(predictions[0].t).getTime();
    const end = this._parsePredictionTime(predictions[predictions.length - 1].t).getTime();
    const labels = [];
    for (let i = 0; i <= 4; i++) {
      if (i === 0) {
        labels.push(`<span class="x-tick">Now</span>`);
      } else {
        const tMs = start + ((end - start) * i / 4);
        const rounded = new Date(Math.round(tMs / 3600000) * 3600000);
        const h = rounded.getHours();
        const ap = h >= 12 ? "PM" : "AM";
        labels.push(`<span class="x-tick">${((h % 12) || 12)}${ap}</span>`);
      }
    }
    return `<div class="x-row">${labels.join("")}</div>`;
  }

  _getEntity(id) { if (!id) return null; return this._hass?.states?.[id] || null; }

  _parseNumericState(rawState) {
    const raw = String(rawState ?? "").trim();
    const range = raw.match(/([0-9]+(?:[.][0-9]+)?)[ \t]*[-\u2013\u2014][ \t]*([0-9]+(?:[.][0-9]+)?)/);
    if (range) {
      const a = Number(range[1]);
      const b = Number(range[2]);
      if (Number.isFinite(a) && Number.isFinite(b)) return (a + b) / 2;
    }
    const single = raw.match(/-?[0-9]+(?:[.][0-9]+)?/);
    if (!single) return null;
    const val = Number(single[0]);
    return Number.isFinite(val) ? val : null;
  }

  _getNumericEntity(id) {
    const ent = this._getEntity(id);
    if (!ent) return null;
    const val = this._parseNumericState(ent.state);
    if (!Number.isFinite(val)) return null;
    return { value: val, unit: ent.attributes?.unit_of_measurement || ent.state || "", state: ent.state, attributes: ent.attributes || {} };
  }

  _getWeatherState() {
    const states = this._hass?.states || {};
    if (this._config.weather_entity && states[this._config.weather_entity]) return states[this._config.weather_entity];
    const keys = Object.keys(states).filter((k) => k.startsWith("weather."));
    if (!keys.length) return null;
    const preferred = keys.find((k) => {
      const fn = String(states[k]?.attributes?.friendly_name || "").toLowerCase();
      return fn.includes("home") || fn.includes("weather");
    });
    return states[preferred || keys[0]] || null;
  }

  _getHomeLatLon() {
    const home = this._hass?.states?.["zone.home"];
    return {
      lat: Number(home?.attributes?.latitude) || this._config.latitude || 33.688,
      lon: Number(home?.attributes?.longitude) || this._config.longitude || -78.886
    };
  }

  _getWindSpeedMph(weather) {
    const direct = this._getNumericEntity(this._config.wind_speed_entity);
    if (direct) {
      const unit = String(direct.unit || "").toLowerCase();
      if (unit.includes("km")) return direct.value * 0.621371;
      if (unit.includes("m/s")) return direct.value * 2.23694;
      if (unit.includes("kn")) return direct.value * 1.15078;
      return direct.value;
    }
    const attrs = weather?.attributes || {};
    const raw = Number(attrs.wind_speed);
    if (!Number.isFinite(raw)) return null;
    const unit = String(attrs.wind_speed_unit || attrs.unit_of_measurement || "").toLowerCase();
    if (unit.includes("km")) return raw * 0.621371;
    if (unit.includes("m/s")) return raw * 2.23694;
    if (unit.includes("kn")) return raw * 1.15078;
    return raw;
  }

  _getWindBearing(weather) {
    const d = this._getNumericEntity(this._config.wind_direction_entity);
    if (d) return d.value;
    return Number(weather?.attributes?.wind_bearing);
  }

  _getPressureHpa(weather) {
    const direct = this._getNumericEntity(this._config.pressure_entity);
    if (direct) {
      const unit = String(direct.unit || "").toLowerCase();
      if (unit.includes("inhg") || unit.includes("in hg")) return direct.value * 33.8639;
      return direct.value;
    }
    const attrs = weather?.attributes || {};
    const raw = Number(attrs.pressure);
    if (!Number.isFinite(raw)) return null;
    const unit = String(attrs.pressure_unit || attrs.unit_of_measurement || "").toLowerCase();
    if (unit.includes("inhg") || unit.includes("in hg")) return raw * 33.8639;
    return raw;
  }

  _getWaterTempF() { const e = this._getNumericEntity(this._config.water_temp_entity); if (!e) return null; const unit = String(e.unit || "").toLowerCase(); return unit.includes("c") ? e.value * 9 / 5 + 32 : e.value; }
  _getWaveHeightFt() { const e = this._getNumericEntity(this._config.wave_height_entity); if (!e) return null; const unit = String(e.unit || "").toLowerCase(); return unit.includes("m") ? e.value * 3.28084 : e.value; }
  _getRainTodayIn() { const e = this._getNumericEntity(this._config.rain_today_entity); if (!e) return null; const unit = String(e.unit || "").toLowerCase(); return unit.includes("mm") ? e.value / 25.4 : e.value; }

  _getPressureTrend() {
    const ent = this._getEntity(this._config.pressure_trend_entity);
    if (!ent) return null;
    const raw = String(ent.state || "").toLowerCase();
    if (raw.includes("fall")) return "falling";
    if (raw.includes("rise")) return "rising";
    if (raw.includes("steady") || raw.includes("stable")) return "steady";
    const num = Number(ent.state);
    if (Number.isFinite(num)) {
      if (num <= -0.04) return "falling";
      if (num >= 0.04) return "rising";
      return "steady";
    }
    return null;
  }

  _getRipCurrentRisk() { const e = this._getEntity(this._config.rip_current_risk_entity); if (!e) return null; return String(e.state || "").toLowerCase().trim(); }
  _getUnsafeToSwim() { const e = this._getEntity(this._config.unsafe_to_swim_entity); if (!e) return null; const raw = String(e.state || "").toLowerCase().trim(); return raw === "on" || raw === "true" || raw === "unsafe" || raw === "dangerous"; }
  _normalizeCondition(condition) { return String(condition || "").toLowerCase().replace(/[-_]/g, " ").trim(); }

  _moonPosition(date, lat, lon) {
    const JD = date.getTime() / 86400000 + 2440587.5;
    const d = JD - 2451545.0;
    const L = ((218.316 + 13.176396 * d) % 360 + 360) % 360;
    const Mr = (((134.963 + 13.064993 * d) % 360 + 360) % 360) * Math.PI / 180;
    const Fr = (((93.272 + 13.229350 * d) % 360 + 360) % 360) * Math.PI / 180;
    const lam = (L + 6.289 * Math.sin(Mr)) * Math.PI / 180;
    const beta = 5.128 * Math.sin(Fr) * Math.PI / 180;
    const eps = (23.439 - 0.0000004 * d) * Math.PI / 180;
    const sinDec = Math.sin(beta) * Math.cos(eps) + Math.cos(beta) * Math.sin(eps) * Math.sin(lam);
    const dec = Math.asin(Math.max(-1, Math.min(1, sinDec)));
    const cosA = Math.cos(lam) * Math.cos(beta);
    const sinA = Math.sin(lam) * Math.cos(beta) * Math.cos(eps) - Math.sin(beta) * Math.sin(eps);
    const RA = ((Math.atan2(sinA, cosA) * 12 / Math.PI) % 24 + 24) % 24;
    const GMST = ((6.697375 + 0.0657098242 * d + date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) % 24 + 24) % 24;
    const LMST = ((GMST + lon / 15) % 24 + 24) % 24;
    return { HA: ((LMST - RA) % 24 + 24) % 24, dec };
  }

  _moonAge(date) { const JD = date.getTime() / 86400000 + 2440587.5; return (((JD - 2451545.0) % 29.530588861) + 29.530588861) % 29.530588861; }

  _moonPhaseName(age) {
    if (age < 1.5) return "&#127761; New Moon";
    if (age < 7.4) return "&#127762; Waxing Crescent";
    if (age < 9.0) return "&#127763; First Quarter";
    if (age < 14.8) return "&#127764; Waxing Gibbous";
    if (age < 16.3) return "&#127765; Full Moon";
    if (age < 22.1) return "&#127766; Waning Gibbous";
    if (age < 23.6) return "&#127767; Last Quarter";
    if (age < 28.0) return "&#127768; Waning Crescent";
    return "&#127761; New Moon";
  }

  _solunarScore(HA) {
    const H = ((HA % 24) + 24) % 24;
    const major = Math.max(0, 1 - Math.min(Math.min(H, 24 - H), Math.abs(H - 12)) / 1.5);
    const minor = Math.max(0, 0.55 * (1 - Math.min(Math.abs(H - 6), Math.abs(H - 18)) / 0.75));
    return Math.max(major, minor);
  }

  _moonMultiplier(age) {
    const c = Math.min(Math.min(age, 29.53 - age), Math.abs(age - 14.77));
    return 1.0 + 0.15 * Math.max(0, 1 - c / 3.5);
  }

  _modeWeights() {
    const mode = this._config.mode || "general";
    const modes = {
      general: { tide: 0.28, wind: 0.16, waterTemp: 0.14, weather: 0.12, clarity: 0.10, light: 0.09, solunar: 0.06, pressure: 0.05 },
      surf: { tide: 0.22, wind: 0.20, waterTemp: 0.13, weather: 0.12, clarity: 0.16, light: 0.08, solunar: 0.05, pressure: 0.04 },
      inlet: { tide: 0.34, wind: 0.14, waterTemp: 0.13, weather: 0.10, clarity: 0.10, light: 0.09, solunar: 0.06, pressure: 0.04 },
      flounder: { tide: 0.34, wind: 0.12, waterTemp: 0.17, weather: 0.09, clarity: 0.14, light: 0.06, solunar: 0.04, pressure: 0.04 },
      trout_redfish: { tide: 0.30, wind: 0.13, waterTemp: 0.15, weather: 0.10, clarity: 0.13, light: 0.12, solunar: 0.04, pressure: 0.03 },
      sheepshead: { tide: 0.36, wind: 0.12, waterTemp: 0.10, weather: 0.10, clarity: 0.10, light: 0.04, solunar: 0.03, pressure: 0.05 }
    };
    return modes[mode] || modes.general;
  }

  _windScore(speedMph, bearing) {
    if (speedMph === null || speedMph === undefined) return { score: 0.70, cap: 1.00, label: "wind unknown" };
    let score;
    let cap = 1.0;
    if (speedMph <= 5) score = 0.95;
    else if (speedMph <= 10) score = 0.85;
    else if (speedMph <= 15) score = 0.65;
    else if (speedMph <= 20) score = 0.42;
    else if (speedMph <= 25) score = 0.25;
    else score = 0.10;
    if (speedMph >= 18) cap = Math.min(cap, 0.60);
    if (speedMph >= 23) cap = Math.min(cap, 0.42);
    if (speedMph >= 28) cap = Math.min(cap, 0.30);
    const b = Number(bearing);
    let dirNote = "";
    if (Number.isFinite(b) && speedMph >= 9) {
      const onshore = b >= 35 && b <= 145;
      const offshore = b >= 220 && b <= 320;
      if (onshore) { score -= 0.12; dirNote = "onshore wind"; }
      else if (offshore) { score += 0.06; dirNote = "offshore wind"; }
    }
    return { score: Math.max(0, Math.min(1, score)), cap, label: dirNote || `${Math.round(speedMph)} mph wind` };
  }

  _weatherScore(weather) {
    const condition = this._normalizeCondition(weather?.state);
    if (!condition || condition === "unknown" || condition === "unavailable") return { score: 0.70, cap: 1.0, label: "weather unknown" };
    let score = 0.75;
    let cap = 1.0;
    let label = "decent weather";
    if (condition.includes("lightning") || condition.includes("thunder")) { score = 0.02; cap = 0.22; label = "storms nearby"; }
    else if (condition.includes("pouring") || condition.includes("heavy rain")) { score = 0.20; cap = 0.40; label = "heavy rain"; }
    else if (condition.includes("rain") || condition.includes("shower") || condition.includes("drizzle")) { score = 0.52; cap = 0.72; label = "rain around"; }
    else if (condition.includes("fog") || condition.includes("mist")) { score = 0.45; cap = 0.70; label = "low visibility"; }
    else if (condition.includes("clear") || condition.includes("sunny")) { score = 0.80; label = "clear weather"; }
    else if (condition.includes("partly")) { score = 0.86; label = "partly cloudy"; }
    else if (condition.includes("cloudy") || condition.includes("overcast")) { score = 0.78; label = "cloud cover helps"; }
    return { score, cap, label };
  }

  _pressureScore(pressureHpa, trend) {
    let score = 0.58;
    let label = "pressure unknown";
    if (pressureHpa !== null && pressureHpa !== undefined) {
      if (pressureHpa >= 1008 && pressureHpa <= 1023) { score = 0.76; label = "pressure favorable"; }
      else if (pressureHpa >= 1002 && pressureHpa < 1008) { score = 0.62; label = "lower pressure"; }
      else if (pressureHpa > 1023 && pressureHpa <= 1029) { score = 0.60; label = "higher pressure"; }
      else if (pressureHpa < 998) { score = 0.35; label = "very low pressure"; }
      else if (pressureHpa > 1030) { score = 0.42; label = "very high pressure"; }
    }
    if (trend === "falling") { score += 0.10; label = "falling pressure"; }
    else if (trend === "rising") { score -= 0.08; label = "rising pressure"; }
    else if (trend === "steady") { score += 0.04; label = "steady pressure"; }
    return { score: Math.max(0, Math.min(1, score)), label };
  }

  _lightScore(hour) {
    if (hour >= 5.5 && hour <= 8.5) return { score: 0.92, label: "morning bite" };
    if (hour >= 18.25 && hour <= 21.25) return { score: 0.88, label: "evening bite" };
    if (hour >= 8.5 && hour <= 10.0) return { score: 0.65, label: "post sunrise" };
    if (hour >= 16.5 && hour < 18.25) return { score: 0.62, label: "pre sunset" };
    if (hour >= 10 && hour <= 15) return { score: 0.38, label: "midday lull" };
    if (hour >= 22 || hour <= 4.5) return { score: 0.15, label: "overnight" };
    return { score: 0.42, label: "off window" };
  }

  _waterTempScore(tempF) {
    if (tempF === null || tempF === undefined) return { score: 0.68, cap: 1.0, label: "water temp unknown" };
    let score = 0.60;
    let cap = 1.0;
    let label = `${Math.round(tempF)}° water`;
    if (tempF >= 68 && tempF <= 82) { score = 0.92; label = "water temp prime"; }
    else if (tempF >= 62 && tempF < 68) { score = 0.74; label = "cool but fishable"; }
    else if (tempF > 82 && tempF <= 86) { score = 0.72; label = "warm water"; }
    else if (tempF >= 55 && tempF < 62) { score = 0.52; cap = Math.min(cap, 0.72); label = "cold water"; }
    else if (tempF > 86 && tempF <= 90) { score = 0.46; cap = Math.min(cap, 0.70); label = "hot water"; }
    else if (tempF < 50) { score = 0.25; cap = Math.min(cap, 0.55); label = "very cold water"; }
    else if (tempF > 90) { score = 0.24; cap = Math.min(cap, 0.55); label = "stressed hot water"; }
    return { score, cap, label };
  }

  _waveScore(waveFt) {
    if (waveFt === null || waveFt === undefined) return { score: 0.70, cap: 1.0, label: "waves unknown" };
    let score = 0.75;
    let cap = 1.0;
    let label = `${waveFt.toFixed(1)} ft seas`;
    if (waveFt <= 1.5) { score = 0.92; label = "calm surf"; }
    else if (waveFt <= 2.5) { score = 0.78; label = "manageable surf"; }
    else if (waveFt <= 3.5) { score = 0.55; cap = Math.min(cap, 0.72); label = "choppy surf"; }
    else if (waveFt <= 5.0) { score = 0.32; cap = Math.min(cap, 0.48); label = "rough surf"; }
    else { score = 0.12; cap = Math.min(cap, 0.32); label = "bad surf"; }
    return { score, cap, label };
  }

  _rainScore(rainIn) {
    if (rainIn === null || rainIn === undefined) return { score: 0.78, cap: 1.0, label: "rain total unknown" };
    let score = 0.85;
    let cap = 1.0;
    let label = "little runoff";
    if (rainIn >= 0.10 && rainIn < 0.35) { score = 0.72; label = "some runoff"; }
    else if (rainIn >= 0.35 && rainIn < 0.75) { score = 0.52; cap = Math.min(cap, 0.72); label = "runoff penalty"; }
    else if (rainIn >= 0.75 && rainIn < 1.50) { score = 0.36; cap = Math.min(cap, 0.58); label = "heavy runoff"; }
    else if (rainIn >= 1.50) { score = 0.20; cap = Math.min(cap, 0.42); label = "muddy runoff"; }
    return { score, cap, label };
  }

  _ripCurrentScore(risk, unsafeToSwim) {
    if (unsafeToSwim === true) return { score: 0.18, cap: 0.35, label: "unsafe surf" };
    if (!risk) return { score: 0.78, cap: 1.0, label: "rip risk unknown" };
    if (risk.includes("high") || risk.includes("danger")) return { score: 0.18, cap: 0.38, label: "high rip risk" };
    if (risk.includes("moderate")) return { score: 0.58, cap: 0.72, label: "moderate rip risk" };
    if (risk.includes("low")) return { score: 0.88, cap: 1.0, label: "low rip risk" };
    return { score: 0.72, cap: 1.0, label: `${risk} rip risk` };
  }

  _clarityScore(wind, wave, rain, weather) {
    let score = 0.82;
    let cap = 1.0;
    const labels = [];
    if (wind.label.includes("onshore")) { score -= 0.16; labels.push("onshore dirtying water"); }
    if (wind.score < 0.50) { score -= 0.12; labels.push("wind-stirred water"); }
    if (wave.score < 0.55) { score -= 0.16; cap = Math.min(cap, 0.72); labels.push("rough surf"); }
    if (rain.score < 0.60) { score -= 0.18; cap = Math.min(cap, rain.cap); labels.push(rain.label); }
    if (weather.label.includes("heavy rain") || weather.label.includes("rain around")) score -= 0.08;
    return { score: Math.max(0, Math.min(1, score)), cap, label: labels[0] || "clarity likely decent" };
  }

  _tideScore(predictions, i) {
    const steps = predictions.length;
    const iA = Math.max(0, i - 4);
    const iB = Math.min(steps - 1, i + 4);
    const iPrev = Math.max(0, i - 1);
    const iNext = Math.min(steps - 1, i + 1);
    const current = parseFloat(predictions[i].v);
    const previous = parseFloat(predictions[iPrev].v);
    const next = parseFloat(predictions[iNext].v);
    const tideRate = Math.abs(parseFloat(predictions[iB].v) - parseFloat(predictions[iA].v));
    const movementScore = Math.min(tideRate / 2.2, 1.0);
    const rising = next > previous;
    const falling = next < previous;
    let directionBonus = 0.55;
    let directionLabel = "slack tide";
    if (rising) { directionBonus = 0.82; directionLabel = "incoming tide"; }
    else if (falling) { directionBonus = 0.74; directionLabel = "outgoing tide"; }
    let score = movementScore * 0.72 + directionBonus * 0.28;
    if (movementScore < 0.12) { score = Math.min(score, 0.36); directionLabel = "near slack tide"; }
    else if (movementScore < 0.22) score = Math.min(score, 0.55);
    return { score: Math.max(0, Math.min(1, score)), movementScore, rising, falling, label: directionLabel, height: current };
  }

  _scoreLabel(score) {
    if (score >= 0.85) return { text: "&#128293; Elite", cls: "score-elite" };
    if (score >= 0.70) return { text: "Prime", cls: "score-prime" };
    if (score >= 0.55) return { text: "Good", cls: "score-good" };
    if (score >= 0.40) return { text: "Fair", cls: "score-fair" };
    return { text: "Slow", cls: "score-slow" };
  }

  _fishColor(score) {
    if (score >= 0.85) return [22, 163, 74];
    if (score >= 0.70) return [37, 99, 235];
    if (score >= 0.55) return [8, 145, 178];
    if (score >= 0.40) return [245, 158, 11];
    return [220, 38, 38];
  }

  _buildFishingScores(predictions) {
    const weights = this._modeWeights();
    const { lat, lon } = this._getHomeLatLon();
    const weather = this._getWeatherState();
    const windMph = this._getWindSpeedMph(weather);
    const windBearing = this._getWindBearing(weather);
    const pressureHpa = this._getPressureHpa(weather);
    const waterTempF = this._getWaterTempF();
    const waveFt = this._getWaveHeightFt();
    const rainIn = this._getRainTodayIn();
    const pressureTrend = this._getPressureTrend();
    const ripRiskRaw = this._getRipCurrentRisk();
    const unsafeToSwim = this._getUnsafeToSwim();
    const wind = this._windScore(windMph, windBearing);
    const weatherScore = this._weatherScore(weather);
    const pressure = this._pressureScore(pressureHpa, pressureTrend);
    const waterTemp = this._waterTempScore(waterTempF);
    const wave = this._waveScore(waveFt);
    const rain = this._rainScore(rainIn);
    const rip = this._ripCurrentScore(ripRiskRaw, unsafeToSwim);
    const clarity = this._clarityScore(wind, wave, rain, weatherScore);
    const age = this._moonAge(new Date());
    const moonMult = this._moonMultiplier(age);
    const now = new Date();
    const nowMs = now.getTime();
    const maxFutureMs = nowMs + 12 * 60 * 60 * 1000;
    const steps = predictions.length;
    const scores = [];
    const details = [];
    let bestIdx = null;
    let bestScore = -1;
    let currentIdx = 0;
    let currentDistance = Infinity;

    for (let i = 0; i < steps; i++) {
      const t = this._parsePredictionTime(predictions[i].t);
      const tMs = t.getTime();
      const hour = t.getHours() + t.getMinutes() / 60;
      const distance = Math.abs(tMs - nowMs);
      if (distance < currentDistance) { currentDistance = distance; currentIdx = i; }
      const moon = this._moonPosition(t, lat, lon);
      const solunar = this._solunarScore(moon.HA);
      const tide = this._tideScore(predictions, i);
      const light = this._lightScore(hour);
      let rawScore = tide.score * weights.tide + wind.score * weights.wind + waterTemp.score * weights.waterTemp + weatherScore.score * weights.weather + clarity.score * weights.clarity + light.score * weights.light + solunar * weights.solunar + pressure.score * weights.pressure;
      rawScore *= moonMult;
      let cap = 1.0;
      cap = Math.min(cap, wind.cap, weatherScore.cap, waterTemp.cap, wave.cap, rain.cap, rip.cap, clarity.cap);
      if (tide.movementScore < 0.10) cap = Math.min(cap, 0.48);
      if (tide.movementScore < 0.20) cap = Math.min(cap, 0.62);
      if (hour >= 10 && hour <= 15) cap = Math.min(cap, 0.78);
      const finalScore = Math.max(0, Math.min(1, Math.min(rawScore, cap)));
      scores.push(finalScore);
      const detail = { time: t, score: finalScore, tide, wind, weather: weatherScore, waterTemp, wave, rain, rip, clarity, light, solunar, pressure, moonMult, cap };
      details.push(detail);
      if (tMs >= nowMs && tMs <= maxFutureMs && finalScore > bestScore) { bestScore = finalScore; bestIdx = i; }
    }

    const currentScore = scores[currentIdx] || 0;
    const currentDetail = details[currentIdx];
    const bestWindow = this._buildBestWindow(details, bestIdx);
    const reason = this._buildReason(currentDetail);
    return { scores, details, currentScore, currentDetail, age, bestWindow, reason };
  }

  _buildBestWindow(details, bestIdx) {
    if (bestIdx === null || bestIdx === undefined || !details[bestIdx]) return "";
    const peak = details[bestIdx];
    const threshold = Math.max(0.40, peak.score - 0.10);
    let start = bestIdx;
    let end = bestIdx;
    while (start > 0 && details[start - 1].score >= threshold) start--;
    while (end < details.length - 1 && details[end + 1].score >= threshold) end++;
    const maxSpanPoints = 15;
    if (end - start > maxSpanPoints) {
      start = Math.max(0, bestIdx - Math.floor(maxSpanPoints / 2));
      end = Math.min(details.length - 1, bestIdx + Math.ceil(maxSpanPoints / 2));
    }
    return `${this._formatClock(details[start].time)}-${this._formatClock(details[end].time)}`;
  }

  _buildReason(detail) {
    if (!detail) return "Waiting on fishing inputs";
    const parts = [];
    if (detail.weather.cap <= 0.25) return "Storms nearby, safety first";
    if (detail.weather.cap <= 0.45) parts.push(detail.weather.label);
    if (detail.wind.cap <= 0.42) parts.push("wind is rough");
    else if (detail.wind.score >= 0.80) parts.push("light wind");
    else if (detail.wind.score < 0.50) parts.push("wind penalty");
    if (detail.wave.score < 0.55) parts.push(detail.wave.label);
    if (detail.rip && detail.rip.score < 0.65) parts.push(detail.rip.label);
    if (detail.waterTemp.score >= 0.85) parts.push("water temp prime");
    else if (detail.waterTemp.score < 0.55) parts.push(detail.waterTemp.label);
    if (detail.clarity.score < 0.60) parts.push(detail.clarity.label);
    if (detail.tide.movementScore < 0.12) parts.push("near slack tide");
    else parts.push(detail.tide.label);
    if (detail.light.score >= 0.80) parts.push(detail.light.label);
    else if (detail.light.score < 0.30) parts.push("poor light window");
    if (detail.solunar >= 0.70) parts.push("moon window");
    if (detail.pressure.score >= 0.72) parts.push(detail.pressure.label);
    if (!parts.length) parts.push("mixed but fishable");
    return parts.slice(0, 3).join(" + ");
  }

  _render() {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style><ha-card><div class="card-outer" id="root"><div class="loading"><div class="spinner"></div>Fetching tide data...</div></div></ha-card>`;
  }

  _renderError(msg) {
    const root = this.shadowRoot.getElementById("root");
    if (root) root.innerHTML = `<div class="error">${msg || "Could not load tide data"}</div>`;
  }

  _renderData() {
    if (!this._data) return;
    const { predictions, hilo } = this._data;
    if (!predictions.length) { this._renderError("No predictions returned"); return; }
    const unitLabel = this._config.units === "metric" ? "m" : "ft";
    const now = new Date();
    const cur = this._interpolateHeight(predictions, now);
    const nxt = this._interpolateHeight(predictions, new Date(now.getTime() + 600000));
    const rising = nxt > cur;
    const upcoming = hilo.filter((p) => this._parseHiloTime(p.t) > now);
    const nextLow = upcoming.find((p) => p.type === "L");
    const nextHigh = upcoming.find((p) => p.type === "H");
    const chartPredictions = this._rollingPredictions(predictions, now);
    const fish = this._config.show_fishing_score ? this._buildFishingScores(chartPredictions) : null;
    const scoreInfo = fish ? this._scoreLabel(fish.currentScore) : null;
    const phaseName = fish ? this._moonPhaseName(fish.age) : "";
    const root = this.shadowRoot.getElementById("root");

    root.innerHTML = `
      <div class="header">
        <div class="title">${this._config.title}</div>
        <div class="subtitle">NOAA ${this._config.station}</div>
      </div>
      <div class="current-row">
        <div class="current-icon">&#127754;</div>
        <div>
          <div class="current-label">Current Tide</div>
          <div class="current-value">${cur.toFixed(1)}<span class="current-unit"> ${unitLabel}</span></div>
        </div>
        <div class="direction-chip">
          <div class="pulse-dot"></div>
          <span>${rising ? "▲ Rising" : "▼ Falling"}</span>
        </div>
      </div>
      <div class="chart-section">
        <div class="chart-header">
          <div class="section-label">${this._config.show_fishing_score ? "&#127907; Tide &amp; Fishing" : "Tide Forecast"}</div>
          ${fish ? `<div class="fish-badge-row"><span class="fish-moon">${phaseName}</span><span class="fish-score ${scoreInfo.cls}">${scoreInfo.text}</span></div>` : ""}
        </div>
        <div class="chart-wrap"><canvas id="tideCanvas"></canvas></div>
        ${this._xAxisHtml(chartPredictions)}
      </div>
      ${fish ? `
        <div class="fish-footer">
          <div class="fish-reason">${fish.reason}</div>
          <div class="fish-next">${fish.bestWindow ? "Best: " + fish.bestWindow : ""}</div>
        </div>
        <div class="fish-legend">
          <div class="legend-item elite"><div class="legend-dot elite"></div>Elite</div>
          <div class="legend-item prime"><div class="legend-dot prime"></div>Prime</div>
          <div class="legend-item good"><div class="legend-dot good"></div>Good</div>
          <div class="legend-item fair"><div class="legend-dot fair"></div>Fair</div>
          <div class="legend-item slow"><div class="legend-dot slow"></div>Slow</div>
        </div>` : ""}
      <div class="tides-grid">
        ${this._pillHtml("low", nextLow, unitLabel)}
        ${this._pillHtml("high", nextHigh, unitLabel)}
      </div>
    `;

    requestAnimationFrame(() => {
      this._chartCanvas = this.shadowRoot.getElementById("tideCanvas");
      this._drawChart(chartPredictions, now, cur, unitLabel, fish?.scores || null, fish?.details || null, [nextHigh, nextLow].filter(Boolean));
    });
  }

  _pillHtml(type, tide, unitLabel) {
    const label = type === "low" ? "Low" : "High";
    const arrow = type === "low" ? "↓" : "↑";
    const labelRow = `<div style="margin-bottom:3px"><div class="pill-label ${type}">Next ${label} Tide</div></div>`;
    if (!tide) {
      return `<div class="tide-pill">${labelRow}<div class="pill-time" style="font-size:18px;color:var(--text-muted)">No data</div></div>`;
    }
    return `
      <div class="tide-pill">
        ${labelRow}
        <div style="display:flex;align-items:baseline;gap:10px;">
          <div class="pill-time"><span class="pill-arrow ${type}">${arrow}</span>${this._formatClock(this._parseHiloTime(tide.t))}</div>
          <div class="pill-ft">${parseFloat(tide.v).toFixed(1)} ${unitLabel}</div>
        </div>
      </div>`;
  }

  _drawChart(predictions, now, cur, unitLabel, fishScores, fishDetails, tideEvents = []) {
    const canvas = this._chartCanvas;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.offsetWidth || 340;
    const H = canvas.offsetHeight || 95;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const vals = predictions.map((p) => parseFloat(p.v));
    const minV = Math.min(...vals) - 0.5;
    const maxV = Math.max(...vals) + 0.5;
    const padL = 34;
    const padR = 8;
    const padT = 8;
    const padB = 12;
    const cW = W - padL - padR;
    const cH = H - padT - padB;
    const startMs = this._parsePredictionTime(predictions[0].t).getTime();
    const endMs = this._parsePredictionTime(predictions[predictions.length - 1].t).getTime();
    const spanMs = Math.max(1, endMs - startMs);
    const toX = (p) => padL + ((this._parsePredictionTime(p.t).getTime() - startMs) / spanMs) * cW;
    const toY = (v) => padT + cH - ((v - minV) / (maxV - minV)) * cH;

    ctx.strokeStyle = "rgba(10,30,45,0.15)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const v = minV + (i / 3) * (maxV - minV);
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(10,30,45,0.65)";
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(1), padL - 3, y + 3);
    }

    for (let i = 0; i < predictions.length - 1; i++) {
      const x1 = toX(predictions[i]);
      const x2 = toX(predictions[i + 1]);
      const y1 = toY(parseFloat(predictions[i].v));
      const y2 = toY(parseFloat(predictions[i + 1].v));
      const score = fishScores ? (fishScores[i] + fishScores[i + 1]) / 2 : 0.58;
      const [r, g, b] = this._fishColor(score);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, H - padB);
      ctx.lineTo(x1, H - padB);
      ctx.closePath();
      ctx.fillStyle = `rgba(${r},${g},${b},${fishScores ? 0.68 : 0.42})`;
      ctx.fill();
    }

    if (fishDetails && fishDetails.length) {
      const nowMs = now.getTime();
      const maxFutureMs = nowMs + 12 * 60 * 60 * 1000;
      let bestIdx = 0;
      let bestScore = -1;
      fishDetails.forEach((d, i) => {
        const tMs = d.time.getTime();
        if (tMs >= nowMs && tMs <= maxFutureMs && d.score > bestScore) { bestScore = d.score; bestIdx = i; }
      });
      if (bestScore >= 0.55 && predictions[bestIdx]) {
        const x = toX(predictions[bestIdx]);
        const glow = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
        glow.addColorStop(0, "rgba(255,255,255,0)");
        glow.addColorStop(0.5, "rgba(255,255,255,0.34)");
        glow.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = glow;
        ctx.fillRect(x - 12, padT, 24, cH);
      }
    }

    tideEvents.forEach((ev) => {
      const evTime = this._parseHiloTime(ev.t);
      const evMs = evTime.getTime();
      if (!Number.isFinite(evMs) || evMs < startMs || evMs > endMs) return;
      const ex = padL + ((evMs - startMs) / spanMs) * cW;
      const evHeight = parseFloat(ev.v);
      const ey = Number.isFinite(evHeight) ? toY(evHeight) : padT + cH / 2;
      const isHigh = ev.type === "H";
      const label = `${isHigh ? "H" : "L"} ${this._formatClock(evTime).replace(" ", "")}`;
      ctx.setLineDash([2, 4]);
      ctx.strokeStyle = isHigh ? "rgba(10,122,112,0.72)" : "rgba(42,122,148,0.72)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(ex, padT);
      ctx.lineTo(ex, H - padB);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ex, ey, 4, 0, Math.PI * 2);
      ctx.fillStyle = isHigh ? "#0a7a70" : "#2a7a94";
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = "bold 9px monospace";
      const lw = ctx.measureText(label).width;
      let lx = ex - lw / 2 - 4;
      let ly = ey + (isHigh ? -20 : 10);
      if (lx < padL) lx = padL;
      if (lx + lw + 8 > W - padR) lx = W - padR - lw - 8;
      if (ly < padT) ly = ey + 10;
      if (ly > H - padB - 16) ly = ey - 20;
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.strokeStyle = "rgba(42,122,148,0.45)";
      ctx.lineWidth = 1;
      this._roundedRect(ctx, lx, ly, lw + 8, 15, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0a1e28";
      ctx.textAlign = "left";
      ctx.fillText(label, lx + 4, ly + 10);
    });

    ctx.beginPath();
    predictions.forEach((p, i) => {
      const x = toX(p);
      const y = toY(parseFloat(p.v));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = "#2a7a94";
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();

    const nx = Math.max(padL, Math.min(W - padR, padL + ((now.getTime() - startMs) / spanMs) * cW));
    const ny = toY(cur);
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(232,184,75,0.70)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(nx, padT);
    ctx.lineTo(nx, H - padB);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(nx, ny, 5, 0, Math.PI * 2);
    ctx.fillStyle = "#e8b84b";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.92)";
    ctx.lineWidth = 2;
    ctx.stroke();

    const lbl = `NOW  ${cur.toFixed(1)}${unitLabel}`;
    ctx.font = "bold 9px monospace";
    const tw = ctx.measureText(lbl).width;
    let bx = nx - tw / 2 - 5;
    let by = ny - 22;
    if (bx < padL) bx = padL;
    if (bx + tw + 10 > W - padR) bx = W - padR - tw - 10;
    if (by < padT) by = ny + 8;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(42,122,148,0.55)";
    ctx.lineWidth = 1;
    this._roundedRect(ctx, bx, by, tw + 10, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#0a1e28";
    ctx.textAlign = "left";
    ctx.fillText(lbl, bx + 5, by + 11);
  }

  _roundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  _updateLive() { if (this._data) this._renderData(); }

  _interpolateHeight(predictions, target) {
    const targetMs = target.getTime();
    for (let i = 0; i < predictions.length - 1; i++) {
      const tA = this._parsePredictionTime(predictions[i].t).getTime();
      const tB = this._parsePredictionTime(predictions[i + 1].t).getTime();
      if (targetMs >= tA && targetMs <= tB) {
        const f = (targetMs - tA) / (tB - tA);
        return parseFloat(predictions[i].v) + f * (parseFloat(predictions[i + 1].v) - parseFloat(predictions[i].v));
      }
    }
    return parseFloat(predictions[predictions.length - 1].v);
  }

  _parseHiloTime(t) {
    const [dp, tp] = t.split(" ");
    const [y, mo, d] = dp.split("-").map(Number);
    const [h, m] = tp.split(":").map(Number);
    return new Date(y, mo - 1, d, h, m);
  }

  _formatClock(date) {
    const h = date.getHours();
    const m = date.getMinutes().toString().padStart(2, "0");
    const ap = h >= 12 ? "PM" : "AM";
    return `${((h % 12) || 12)}:${m} ${ap}`;
  }

  getCardSize() { return 5; }
}

class CherryGroveTidesCard extends TideWiseCard {}

if (!customElements.get(CARD_TYPES[0])) customElements.define(CARD_TYPES[0], TideWiseCard);
if (!customElements.get(CARD_TYPES[1])) customElements.define(CARD_TYPES[1], CherryGroveTidesCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "tidewise-card",
  name: "TideWise",
  description: "NOAA tides with optional bite-window fishing quality scoring",
  preview: true
});

console.info(
  `%c TIDEWISE CARD %c v${CARD_VERSION} `,
  "background:#0d3a5c;color:#7ecbca;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px",
  "background:#7ecbca;color:#0d3a5c;font-weight:bold;padding:2px 4px;border-radius:0 3px 3px 0"
);
