/*
 * BoatWise Card v1.3.0
 * NOAA tides with depth-threshold boating windows and NWS marine alerts.
 * Forked from TideWise v0.9.5 (TheWillMiller/tide-wise).
 */

const CARD_VERSION = "1.3.0";

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

export function boatingQualityScore({ windKt, seasFt, alerts, conditions }) {
  const reasons = [];

  const relevantAlertEvents = [
    "small craft advisory",
    "gale warning", "gale watch",
    "storm warning", "storm watch",
    "hurricane warning", "hurricane watch",
    "special marine warning",
    "hazardous seas warning", "hazardous seas watch"
  ];
  const activeAlert = (alerts || []).find((a) => {
    if (!a) return false;
    const ev = String(a.event || "").toLowerCase();
    return relevantAlertEvents.some((re) => ev.startsWith(re));
  });
  if (activeAlert) {
    reasons.push(`${activeAlert.event} active`);
    return { label: "BAD", score: 0, reasons };
  }

  const windScore = (kt) => {
    if (!Number.isFinite(kt)) return null;
    if (kt <= 10) return 4;
    if (kt <= 15) return 3;
    if (kt <= 20) return 2;
    if (kt <= 25) return 1;
    return 0;
  };
  const seasScore = (ft) => {
    if (!Number.isFinite(ft)) return null;
    if (ft <= 2) return 4;
    if (ft <= 3) return 3;
    if (ft <= 4) return 2;
    if (ft <= 6) return 1;
    return 0;
  };

  const ws = windKt == null ? null : windScore(Number(windKt));
  const ss = seasFt == null ? null : seasScore(Number(seasFt));

  if (ws === null && ss === null) {
    reasons.push("wind and seas unknown");
    return { label: "FAIR", score: 2, reasons };
  }

  const components = [];
  if (ws !== null) components.push({ kind: "wind", score: ws, value: windKt });
  if (ss !== null) components.push({ kind: "seas", score: ss, value: seasFt });
  components.sort((a, b) => a.score - b.score);
  let score = components[0].score;
  const dominant = components[0];

  const cond = String(conditions || "").toLowerCase();
  const isThunder = /(thunder|lightning|storm)/.test(cond);
  const isHeavyRain = /(heavy rain|pouring|downpour)/.test(cond);
  const isFog = /(fog|mist)/.test(cond);

  if (isThunder && score > 2) {
    reasons.push("thunderstorms — caps quality");
    score = 2;
  } else if (isHeavyRain && score > 2) {
    reasons.push("heavy rain — caps quality");
    score = 2;
  } else if (isFog && score > 2) {
    reasons.push("low visibility — caps quality");
    score = 2;
  }

  const describeWind = (s, v) => {
    if (s === 4) return `light wind (${Math.round(v)} kt)`;
    if (s === 3) return `moderate wind (${Math.round(v)} kt)`;
    if (s === 2) return `brisk wind (${Math.round(v)} kt)`;
    if (s === 1) return `strong wind (${Math.round(v)} kt)`;
    return `very strong wind (${Math.round(v)} kt)`;
  };
  const describeSeas = (s, v) => {
    if (s === 4) return `flat seas (${v} ft)`;
    if (s === 3) return `light chop (${v} ft)`;
    if (s === 2) return `choppy seas (${v} ft)`;
    if (s === 1) return `rough seas (${v} ft)`;
    return `very rough seas (${v} ft)`;
  };

  for (const c of components) {
    if (c.kind === "wind") reasons.push(describeWind(c.score, c.value));
    else reasons.push(describeSeas(c.score, c.value));
  }

  if (ws === null) reasons.push("wind unknown");
  if (ss === null) reasons.push("seas unknown");

  const label = score >= 4 ? "GREAT" : score === 3 ? "GOOD" : score === 2 ? "FAIR" : "BAD";
  return { label, score, reasons };
}

export function sunriseSunset(date, lat, lon) {
  const rad = Math.PI / 180;
  const J1970 = 2440588;
  const J2000 = 2451545;
  const dayMs = 86400000;
  const e = rad * 23.4397;

  const toJulian = (d) => d.getTime() / dayMs - 0.5 + J1970;
  const fromJulian = (j) => new Date((j + 0.5 - J1970) * dayMs);
  const toDays = (d) => toJulian(d) - J2000;

  const solarMeanAnomaly = (d) => rad * (357.5291 + 0.98560028 * d);
  const eclipticLongitude = (M) => {
    const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
    const P = rad * 102.9372;
    return M + C + P + Math.PI;
  };
  const declination = (L) => Math.asin(Math.sin(e) * Math.sin(L));

  const lw = rad * -lon;
  const phi = rad * lat;
  const d = toDays(date);
  const n = Math.round(d - 0.0009 - lw / (2 * Math.PI));
  const ds = 0.0009 + lw / (2 * Math.PI) + n;
  const M = solarMeanAnomaly(ds);
  const L = eclipticLongitude(M);
  const dec = declination(L);
  const Jnoon = J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);

  const h0 = rad * -0.833;
  const H = Math.acos((Math.sin(h0) - Math.sin(phi) * Math.sin(dec)) / (Math.cos(phi) * Math.cos(dec)));
  const Jset = Jnoon + H / (2 * Math.PI);
  const Jrise = Jnoon - H / (2 * Math.PI);

  return {
    sunrise: fromJulian(Jrise),
    sunset: fromJulian(Jset)
  };
}

export function clipWindowsToDaylight(windows, options = {}) {
  const {
    daylightOnly = true,
    lat,
    lon,
    dawnOffsetMinutes = 0,
    duskOffsetMinutes = 0,
    minDurationMinutes = 15
  } = options;

  if (!daylightOnly) return windows;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return windows;

  const result = [];
  for (const w of windows || []) {
    if (!(w?.start instanceof Date) || !(w?.end instanceof Date)) continue;
    const startDate = new Date(w.start.getFullYear(), w.start.getMonth(), w.start.getDate());
    const endDate = new Date(w.end.getFullYear(), w.end.getMonth(), w.end.getDate());
    for (let d = new Date(startDate); d.getTime() <= endDate.getTime(); d.setDate(d.getDate() + 1)) {
      const probe = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
      const { sunrise, sunset } = sunriseSunset(probe, lat, lon);
      const dayStart = new Date(sunrise.getTime() + dawnOffsetMinutes * 60000);
      const dayEnd = new Date(sunset.getTime() + duskOffsetMinutes * 60000);
      const clipStart = new Date(Math.max(w.start.getTime(), dayStart.getTime()));
      const clipEnd = new Date(Math.min(w.end.getTime(), dayEnd.getTime()));
      if (clipEnd.getTime() <= clipStart.getTime()) continue;
      const durMin = (clipEnd - clipStart) / 60000;
      if (durMin < minDurationMinutes) continue;
      result.push({
        start: clipStart,
        end: clipEnd,
        duration_minutes: durMin,
        tide_direction_at_start: w.tide_direction_at_start,
        tide_direction_at_end: w.tide_direction_at_end,
        clipped: clipStart.getTime() !== w.start.getTime() || clipEnd.getTime() !== w.end.getTime()
      });
    }
  }
  return result;
}

const CARD_TYPES = ["boatwise-card"];
const STATION_PRESETS = [
  { station: "8410140", name: "Eastport, ME", lat: 44.9046, lon: -66.9829 },
  { station: "8418150", name: "Portland, ME", lat: 43.6581, lon: -70.2442 },
  { station: "8443970", name: "Boston, MA", lat: 42.3539, lon: -71.0503 },
  { station: "8452660", name: "Newport, RI", lat: 41.5043, lon: -71.3261 },
  { station: "8510560", name: "Montauk, NY", lat: 41.0483, lon: -71.9594 },
  { station: "8518750", name: "New York, NY", lat: 40.7006, lon: -74.0142 },
  { station: "8531680", name: "Sandy Hook, NJ", lat: 40.4669, lon: -74.0094 },
  { station: "8534720", name: "Atlantic City, NJ", lat: 39.3567, lon: -74.4181 },
  { station: "8536110", name: "Cape May, NJ", lat: 38.9683, lon: -74.9600 },
  { station: "8557380", name: "Lewes, DE", lat: 38.7828, lon: -75.1193 },
  { station: "8570283", name: "Ocean City, MD", lat: 38.3283, lon: -75.0917 },
  { station: "8638863", name: "Chesapeake Bay Bridge Tunnel, VA", lat: 36.9667, lon: -76.1133 },
  { station: "8638610", name: "Hampton Roads, VA", lat: 36.9428, lon: -76.3286 },
  { station: "8651370", name: "Duck, NC", lat: 36.1833, lon: -75.7467 },
  { station: "8656483", name: "Beaufort, NC", lat: 34.7173, lon: -76.6707 },
  { station: "8658120", name: "Wilmington, NC", lat: 34.2267, lon: -77.9533 },
  { station: "8661070", name: "Cherry Grove / Myrtle Beach, SC", lat: 33.6550, lon: -78.9183 },
  { station: "8665530", name: "Charleston, SC", lat: 32.7808, lon: -79.9236 },
  { station: "8670870", name: "Fort Pulaski / Savannah, GA", lat: 32.0347, lon: -80.9030 },
  { station: "8720030", name: "Fernandina Beach, FL", lat: 30.6714, lon: -81.4658 },
  { station: "8720218", name: "Mayport, FL", lat: 30.3982, lon: -81.4279 },
  { station: "8723214", name: "Virginia Key / Miami, FL", lat: 25.7314, lon: -80.1618 },
  { station: "8723970", name: "Vaca Key, FL", lat: 24.7110, lon: -81.1065 },
  { station: "8724580", name: "Key West, FL", lat: 24.5557, lon: -81.8079 },
  { station: "8725110", name: "Naples, FL", lat: 26.1317, lon: -81.8075 },
  { station: "8726520", name: "St. Petersburg, FL", lat: 27.7606, lon: -82.6269 },
  { station: "8727520", name: "Cedar Key, FL", lat: 29.1350, lon: -83.0317 },
  { station: "8729840", name: "Pensacola, FL", lat: 30.4044, lon: -87.2112 },
  { station: "8735180", name: "Dauphin Island, AL", lat: 30.2500, lon: -88.0750 },
  { station: "8761724", name: "Grand Isle, LA", lat: 29.2633, lon: -89.9567 },
  { station: "8761927", name: "New Orleans / Lake Pontchartrain, LA", lat: 30.0272, lon: -90.1133 },
  { station: "8771450", name: "Galveston, TX", lat: 29.3100, lon: -94.7933 },
  { station: "8775237", name: "Port Aransas, TX", lat: 27.8397, lon: -97.0725 },
  { station: "8779770", name: "Port Isabel, TX", lat: 26.0612, lon: -97.2155 },
  { station: "9410170", name: "San Diego, CA", lat: 32.7156, lon: -117.1767 },
  { station: "9410230", name: "La Jolla, CA", lat: 32.8669, lon: -117.2571 },
  { station: "9410660", name: "Los Angeles, CA", lat: 33.7200, lon: -118.2720 },
  { station: "9413450", name: "Monterey, CA", lat: 36.6089, lon: -121.8914 },
  { station: "9414290", name: "San Francisco, CA", lat: 37.8063, lon: -122.4659 },
  { station: "9419750", name: "Crescent City, CA", lat: 41.7456, lon: -124.1844 },
  { station: "9432780", name: "Charleston, OR", lat: 43.3450, lon: -124.3220 },
  { station: "9435380", name: "Newport / South Beach, OR", lat: 44.6254, lon: -124.0449 },
  { station: "9439040", name: "Astoria, OR", lat: 46.2073, lon: -123.7683 },
  { station: "9440910", name: "Toke Point, WA", lat: 46.7075, lon: -123.9669 },
  { station: "9444900", name: "Port Townsend, WA", lat: 48.1112, lon: -122.7597 },
  { station: "9447130", name: "Seattle, WA", lat: 47.6026, lon: -122.3393 },
  { station: "9449880", name: "Friday Harbor, WA", lat: 48.5453, lon: -123.0125 },
  { station: "1612340", name: "Honolulu, HI", lat: 21.3033, lon: -157.8645 },
  { station: "9755371", name: "San Juan, PR", lat: 18.4589, lon: -66.1164 },
  { station: "9751639", name: "Charlotte Amalie, VI", lat: 18.3306, lon: -64.9258 }
];

const STYLES = `
  :host {
    --wave: #2a7a94; --wave-dark: #1a5f72; --gold: #e8b84b;
    --low-color: #2a7a94; --high-color: #0a7a70; --text: #0a1e28; --text-muted: #1e4d5e;
    --bw-panel-bg: rgba(255,255,255,0.35); --bw-panel-border: rgba(42,122,148,0.20);
    --bw-chip-bg: rgba(255,255,255,0.48); --bw-chip-border: rgba(42,122,148,0.22);
    --bw-chart-grid: rgba(10,30,45,0.15); --bw-chart-axis: rgba(10,30,45,0.65);
    --bw-chart-label-bg: rgba(255,255,255,0.88); --bw-chart-now-label-bg: rgba(255,255,255,0.92);
    --bw-chart-label-border: rgba(42,122,148,0.45); --bw-chart-now-label-border: rgba(42,122,148,0.55);
    --bw-chart-label-text: #0a1e28; --bw-tide-line: #2a7a94;
    --bw-marker-stroke: rgba(255,255,255,0.9); --bw-now-marker-stroke: rgba(255,255,255,0.92);
    --font-main: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Arial, sans-serif;
    --font-mono: "SF Mono", "Roboto Mono", "Courier New", monospace;
    display: block; font-family: var(--font-main); color: var(--text); container-type: inline-size;
  }
  :host([theme-mode="auto"]) {
    --wave: var(--accent-color, #2a7a94); --wave-dark: var(--primary-color, var(--accent-color, #1a5f72));
    --low-color: var(--accent-color, #2a7a94); --high-color: var(--primary-color, #0a7a70);
    --text: var(--primary-text-color, #0a1e28); --text-muted: var(--secondary-text-color, #1e4d5e);
    --bw-panel-bg: var(--secondary-background-color, rgba(255,255,255,0.35));
    --bw-panel-border: var(--divider-color, rgba(42,122,148,0.20));
    --bw-chip-bg: var(--card-background-color, rgba(255,255,255,0.48));
    --bw-chip-border: var(--divider-color, rgba(42,122,148,0.22));
    --bw-chart-grid: var(--divider-color, rgba(10,30,45,0.15));
    --bw-chart-axis: var(--secondary-text-color, rgba(10,30,45,0.65));
    --bw-chart-label-bg: var(--card-background-color, rgba(255,255,255,0.88));
    --bw-chart-now-label-bg: var(--card-background-color, rgba(255,255,255,0.92));
    --bw-chart-label-border: var(--divider-color, rgba(42,122,148,0.45));
    --bw-chart-now-label-border: var(--divider-color, rgba(42,122,148,0.55));
    --bw-chart-label-text: var(--primary-text-color, #0a1e28);
    --bw-tide-line: var(--accent-color, #2a7a94);
    --bw-marker-stroke: var(--card-background-color, rgba(255,255,255,0.9));
    --bw-now-marker-stroke: var(--card-background-color, rgba(255,255,255,0.92));
  }
  .card-outer {
    background: linear-gradient(135deg, rgba(255,255,255,0.70), rgba(222,244,248,0.58));
    backdrop-filter: blur(12px) saturate(1.08); -webkit-backdrop-filter: blur(12px) saturate(1.08);
    border-radius: 22px; padding: 8px 16px 8px;
    border: 1px solid rgba(255,255,255,0.40); box-shadow: 0 5px 24px rgba(10,50,70,0.14);
    position: relative; overflow: hidden;
  }
  :host([theme-mode="auto"]) .card-outer {
    background: var(--ha-card-background, var(--card-background-color, rgba(255,255,255,0.70)));
    border-color: var(--divider-color, rgba(255,255,255,0.40));
    box-shadow: var(--ha-card-box-shadow, 0 5px 24px rgba(10,50,70,0.14));
  }
  ha-card { background: transparent !important; box-shadow: none !important; border-radius: 22px !important; }
  .card-outer::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 1px; background: linear-gradient(90deg, transparent, rgba(42,122,148,0.62), transparent); }
  .header { display: flex; align-items: flex-start; gap: 10px; margin-bottom: 5px; flex-wrap: wrap; }
  .title { font-size: 28px; font-weight: 800; color: var(--text); line-height: 1.05; letter-spacing: 0; overflow-wrap: anywhere; min-width: 0; max-width: 100%; }
  .subtitle { font-size: 13px; color: var(--text-muted); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 650; white-space: nowrap; padding-top: 8px; }
  .current-row { display: flex; align-items: center; gap: 13px; flex-wrap: wrap; background: var(--bw-panel-bg); border: 1px solid var(--bw-panel-border); border-radius: 14px; padding: 7px 13px; margin-bottom: 6px; }
  .current-icon { font-size: 22px; animation: bob 3s ease-in-out infinite; flex-shrink: 0; }
  @keyframes bob { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-3px)} }
  .current-label { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--wave-dark); margin-bottom: 2px; font-weight: 750; }
  .current-value { font-family: var(--font-mono); font-size: 36px; font-weight: 800; color: var(--text); line-height: 1; }
  .current-unit { font-size: 18px; color: var(--text-muted); font-weight: 650; }
  .direction-chip { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 18px; color: var(--wave-dark); font-weight: 750; flex-shrink: 0; }
  .condition-chip { display: flex; align-items: center; gap: 6px; font-size: 14px; color: var(--wave-dark); background: var(--bw-chip-bg); border: 1px solid var(--bw-chip-border); border-radius: 99px; padding: 4px 10px; white-space: nowrap; font-weight: 800; flex-shrink: 0; }
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
  .marine-zone-error { font-size: 12px; color: #8a3018; background: rgba(192,80,48,0.10); border: 1px solid rgba(192,80,48,0.30); border-radius: 6px; padding: 4px 8px; margin: -4px 0 8px; font-weight: 700; }
  .chip-cluster { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; min-width: 0; }
  .quality-chip { font-size: 13px; font-weight: 850; padding: 3px 10px; border-radius: 99px; letter-spacing: 0.05em; white-space: nowrap; }
  .quality-chip-great { background: rgba(60,170,110,0.20); color: #0f7a38; }
  .quality-chip-good { background: rgba(96,188,152,0.22); color: #157754; }
  .quality-chip-fair { background: rgba(232,184,75,0.24); color: #8a6a10; }
  .quality-chip-bad { background: rgba(192,80,48,0.20); color: #8a3018; }
  .band-legend { display: flex; align-items: center; gap: 14px; margin: 6px 2px 2px; flex-wrap: wrap; }
  .legend-item { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 750; color: var(--text-muted); white-space: nowrap; }
  .legend-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06); }
  .legend-dot.quality-great { background: #3caa6e; }
  .legend-dot.quality-good { background: #60bc98; }
  .legend-dot.quality-fair { background: #e8b84b; }
  .legend-dot.quality-bad { background: #c05030; }
  .legend-dot.shallow { background: #8c8c8c; }
  .quality-why {
    display: flex; align-items: baseline; gap: 6px; flex-wrap: wrap;
    margin: 4px 2px 4px;
    padding: 5px 10px;
    background: var(--bw-panel-bg);
    border: 1px solid var(--bw-panel-border);
    border-radius: 8px;
    font-size: 12px;
    line-height: 1.35;
  }
  .quality-why-label {
    font-weight: 850; letter-spacing: 0.04em; text-transform: uppercase; font-size: 11px;
    padding: 1px 6px; border-radius: 4px; white-space: nowrap;
  }
  .quality-why-great { background: rgba(60,170,110,0.20); color: #0f7a38; }
  .quality-why-good { background: rgba(96,188,152,0.22); color: #157754; }
  .quality-why-fair { background: rgba(232,184,75,0.24); color: #8a6a10; }
  .quality-why-bad { background: rgba(192,80,48,0.20); color: #8a3018; }
  .quality-why-reasons { color: var(--text); font-weight: 650; min-width: 0; flex: 1 1 auto; }
  .windows-section { margin: 10px 0 6px; }
  .windows-section .section-label { display: block; margin-bottom: 6px; }
  .windows-scroll {
    display: flex; gap: 8px; overflow-x: auto; padding: 2px 2px 6px;
    scroll-snap-type: x mandatory; scrollbar-width: thin;
  }
  .windows-scroll::-webkit-scrollbar { height: 6px; }
  .windows-scroll::-webkit-scrollbar-thumb { background: rgba(42,122,148,0.30); border-radius: 99px; }
  .window-card {
    flex: 0 0 auto;
    min-width: 168px; max-width: 220px;
    background: var(--bw-panel-bg);
    border: 1px solid var(--bw-panel-border);
    border-left: 4px solid var(--wave);
    border-radius: 12px;
    padding: 8px 11px 9px;
    display: grid; gap: 4px;
    scroll-snap-align: start;
    position: relative;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
  }
  .window-card:hover { transform: translateY(-1px); box-shadow: 0 4px 16px rgba(10,50,70,0.10); }
  .window-card.open-now {
    border-left-color: #3caa6e;
    background: linear-gradient(135deg, rgba(60,170,110,0.14), rgba(255,255,255,0.50));
  }
  .window-card.open-now.quality-great { border-left-color: #3caa6e; }
  .window-card.open-now.quality-good { border-left-color: #60bc98; }
  .window-card.open-now.quality-fair { border-left-color: #e8b84b; background: linear-gradient(135deg, rgba(232,184,75,0.18), rgba(255,255,255,0.50)); }
  .window-card.open-now.quality-bad { border-left-color: #c05030; background: linear-gradient(135deg, rgba(192,80,48,0.16), rgba(255,255,255,0.50)); }
  .window-card.advisory {
    border-left-color: #a51f1f;
    background: linear-gradient(135deg, rgba(192,80,48,0.14), rgba(255,255,255,0.45));
  }
  .card-warn { position: absolute; top: 6px; right: 8px; color: #a51f1f; font-weight: 900; font-size: 14px; }
  .card-day { font-size: 11px; letter-spacing: 0.10em; text-transform: uppercase; color: var(--wave-dark); font-weight: 800; display: flex; align-items: center; gap: 6px; }
  .card-open-badge { background: rgba(60,170,110,0.30); color: #0f7a38; font-size: 9px; letter-spacing: 0.10em; padding: 1px 5px; border-radius: 4px; font-weight: 900; }
  .card-time { font-family: var(--font-mono); font-size: 15px; font-weight: 800; color: var(--text); line-height: 1.15; }
  .card-arrow { color: var(--text-muted); margin: 0 1px; }
  .card-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-top: 2px; }
  .card-dur { font-family: var(--font-mono); font-size: 13px; font-weight: 800; color: var(--wave-dark); }
  .card-arrive { font-size: 11px; color: var(--text-muted); font-weight: 650; }
  .card-quality { display: flex; align-items: center; gap: 5px; font-size: 10.5px; font-weight: 850; letter-spacing: 0.06em; text-transform: uppercase; margin-top: 2px; }
  .card-quality-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.06); }
  .card-quality-dot.quality-great { background: #3caa6e; }
  .card-quality-dot.quality-good { background: #60bc98; }
  .card-quality-dot.quality-fair { background: #e8b84b; }
  .card-quality-dot.quality-bad { background: #c05030; }
  .card-quality-label { color: var(--text-muted); }
  .window-card.quality-great .card-quality-label { color: #0f7a38; }
  .window-card.quality-good .card-quality-label { color: #157754; }
  .window-card.quality-fair .card-quality-label { color: #8a6a10; }
  .window-card.quality-bad .card-quality-label { color: #8a3018; }
  .window-card.quality-great { border-left-color: #3caa6e; }
  .window-card.quality-good { border-left-color: #60bc98; }
  .window-card.quality-fair { border-left-color: #e8b84b; background: linear-gradient(135deg, rgba(232,184,75,0.10), rgba(255,255,255,0.50)); }
  .window-card.quality-bad { border-left-color: #c05030; background: linear-gradient(135deg, rgba(192,80,48,0.10), rgba(255,255,255,0.50)); }
  .windows-empty { padding: 8px 4px; }
  .windows-empty .empty-note { font-size: 12px; color: var(--text-muted); padding: 8px 12px; background: var(--bw-panel-bg); border: 1px dashed var(--bw-panel-border); border-radius: 10px; }
  .condition-spacer { flex: 1 1 auto; min-width: 12px; }
  .pulse-dot { width: 12px; height: 12px; border-radius: 50%; background: var(--wave); box-shadow: 0 0 0 3px rgba(42,122,148,0.25); animation: pulse 2s ease-in-out infinite; flex-shrink: 0; }
  @keyframes pulse { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.5;transform:scale(0.75)} }
  .chart-section { margin-bottom: 5px; }
  .chart-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; gap: 8px; }
  .section-label { font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text-muted); font-weight: 750; white-space: nowrap; }
  .chart-wrap { position: relative; height: 95px; border-radius: 10px; overflow: hidden; }
  canvas { display: block; width: 100%; height: 100%; }
  .x-row { display: flex; justify-content: space-between; margin-top: 2px; padding: 0 2px; }
  .x-tick { font-size: 13px; font-weight: 650; color: var(--text-muted); }
  .tides-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; }
  .tide-pill { background: var(--bw-panel-bg); border: 1px solid var(--bw-panel-border); border-radius: 12px; padding: 5px 12px; }
  .pill-label { font-size: 13px; letter-spacing: 0.07em; text-transform: uppercase; margin-bottom: 3px; font-weight: 750; }
  .pill-label.low{color:var(--low-color)} .pill-label.high{color:var(--high-color)}
  .pill-main { display: flex; align-items: baseline; gap: 10px; min-width: 0; }
  .pill-time { font-family: var(--font-mono); font-size: 26px; font-weight: 800; color: var(--text); line-height: 1.1; }
  .pill-arrow { font-size: 16px; margin-right: 4px; }
  .pill-arrow.low{color:var(--low-color)} .pill-arrow.high{color:var(--high-color)}
  .pill-ft { font-size: 16px; color: var(--text-muted); font-weight: 650; }
  .debug-panel { margin-top: 8px; background: rgba(10,30,40,0.06); border: 1px solid rgba(42,122,148,0.24); border-radius: 12px; color: var(--text); overflow: hidden; }
  .debug-panel summary { cursor: pointer; list-style: none; display: flex; justify-content: space-between; gap: 8px; align-items: baseline; padding: 8px 10px; }
  .debug-panel summary::-webkit-details-marker { display: none; }
  .debug-title-main::before { content: "▸"; display: inline-block; margin-right: 6px; transition: transform 0.16s ease; }
  .debug-panel[open] .debug-title-main::before { transform: rotate(90deg); }
  .debug-title { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--wave-dark); font-weight: 850; }
  .debug-note { font-size: 11px; letter-spacing: 0; text-transform: none; color: var(--text-muted); font-weight: 650; }
  .debug-body { max-height: 360px; overflow-y: auto; padding: 0 10px 10px; scrollbar-width: thin; }
  .debug-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
  .debug-section { min-width: 0; }
  .debug-section-title { font-size: 11px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.06em; font-weight: 850; margin: 4px 0 3px; }
  .debug-line { display: flex; justify-content: space-between; gap: 8px; font-family: var(--font-mono); font-size: 10.5px; line-height: 1.35; border-top: 1px solid rgba(42,122,148,0.10); padding: 2px 0; }
  .debug-key { color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .debug-value { color: var(--text); font-weight: 800; text-align: right; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .debug-warn { color: #a51f1f; font-weight: 900; }
  @media (max-width: 520px) { .debug-grid { grid-template-columns: 1fr; } }
  @container (max-width: 520px) {
    .card-outer { padding: 12px 14px 12px; border-radius: 20px; }
    .header { display: block; margin-bottom: 8px; }
    .title { font-size: 25px; line-height: 1.08; margin-bottom: 8px; }
    .subtitle { display: block; padding-top: 0; font-size: 12px; white-space: normal; }
    .current-row { gap: 8px 10px; padding: 10px 12px; align-items: center; }
    .current-label { font-size: 12px; }
    .current-value { font-size: 34px; }
    .condition-spacer { display: none; }
    .condition-chip { order: 3; font-size: 12px; padding: 3px 8px; }
    .direction-chip { order: 4; margin-left: auto; font-size: 16px; gap: 6px; }
    .pulse-dot { width: 10px; height: 10px; }
    .chart-header { align-items: flex-start; flex-wrap: wrap; gap: 6px; }
    .section-label { font-size: 12px; }
    .chart-wrap { height: 92px; }
    .x-tick { font-size: 12px; }
    .tides-grid { gap: 8px; }
    .tide-pill { padding: 8px 10px; }
    .pill-label { font-size: 11.5px; letter-spacing: 0.06em; }
    .pill-main { gap: 6px; flex-wrap: wrap; }
    .pill-time { font-size: 22px; line-height: 1.05; }
    .pill-ft { font-size: 14px; }
    .window-card { min-width: 156px; padding: 7px 10px 8px; }
    .card-time { font-size: 14px; }
    .card-dur { font-size: 12px; }
    .quality-why { font-size: 11.5px; padding: 4px 8px; }
    .quality-why-reasons { flex: 1 1 100%; }
  }
  @container (max-width: 390px) {
    .title { font-size: 22px; }
    .current-value { font-size: 30px; }
    .chart-wrap { height: 86px; }
    .tides-grid { grid-template-columns: 1fr; }
    .pill-main { justify-content: space-between; }
    .pill-time { font-size: 24px; }
  }
  .loading,.error { text-align: center; padding: 30px 20px; color: var(--text-muted); font-size: 14px; }
  .error{color:#c04444}
  .spinner { width: 28px; height: 28px; border: 2px solid rgba(255,255,255,0.40); border-top-color: var(--wave); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
  @keyframes spin { to{transform:rotate(360deg)} }
`;

class BoatWiseCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._data = null;
    this._autoData = {};
    this._refreshInterval = null;
    this._clockInterval = null;
    this._chartCanvas = null;
    this._cache = new Map();
  }

  static getStubConfig() {
    return {
      title: "BoatWise",
      station: "8441241",
      units: "english",
      wind_units: "auto",
      theme_mode: "boatwise",
      auto_sources: true,
      depth_threshold: 4.0,
      wharf_buffer_minutes: 30,
      marine_zone: "ANZ250",
      forecast_horizon_hours: 72,
      daylight_only: false,
      dawn_offset_minutes: 0,
      dusk_offset_minutes: 0
    };
  }

  static getConfigElement() {
    return document.createElement("boatwise-card-editor");
  }

  set hass(hass) {
    this._hass = hass;
  }

  setConfig(config) {
    if (!config.station) throw new Error("BoatWise requires a NOAA station ID.");
    this._config = {
      title: config.title || "BoatWise",
      station: String(config.station || "8661070"),
      units: config.units || "english",
      wind_units: this._normalizeWindUnits(config.wind_units),
      weather_entity: config.weather_entity || "",
      water_temp_entity: config.water_temp_entity || "",
      wind_speed_entity: config.wind_speed_entity || "",
      wind_direction_entity: config.wind_direction_entity || "",
      pressure_entity: config.pressure_entity || "",
      latitude: Number(config.latitude) || 42.755,
      longitude: Number(config.longitude) || -70.806,
      theme_mode: this._normalizeThemeMode(config.theme_mode),
      auto_sources: config.auto_sources !== false,
      depth_threshold: Number.isFinite(Number(config.depth_threshold)) ? Number(config.depth_threshold) : 4.0,
      wharf_buffer_minutes: this._normalizeWharfBuffer(config.wharf_buffer_minutes),
      marine_zone: String(config.marine_zone || "").trim().toUpperCase(),
      forecast_horizon_hours: this._normalizeHorizon(config.forecast_horizon_hours),
      daylight_only: config.daylight_only === true,
      dawn_offset_minutes: Number.isFinite(Number(config.dawn_offset_minutes)) ? Number(config.dawn_offset_minutes) : 0,
      dusk_offset_minutes: Number.isFinite(Number(config.dusk_offset_minutes)) ? Number(config.dusk_offset_minutes) : 0,
      debug: this._normalizeDebugConfig(config.debug)
    };
    this.setAttribute("theme-mode", this._config.theme_mode);
    this._render();
    this._fetchData();
  }

  _normalizeThemeMode(value) {
    return value === "auto" ? "auto" : "boatwise";
  }

  _normalizeWindUnits(value) {
    const unit = String(value || "auto").toLowerCase();
    return ["auto", "mph", "kmh", "knots", "beaufort"].includes(unit) ? unit : "auto";
  }

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

  _normalizeDebugConfig(value) {
    if (value === true) return { enabled: true, panel: true };
    if (!value || typeof value !== "object") return { enabled: false, panel: false };
    return {
      enabled: value.enabled === true,
      panel: value.enabled === true && value.panel === true
    };
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
      const cj = await cr.json();
      const hj = await hr.json();
      if (hj.error) throw new Error(this._friendlyNoaaError(hj.error?.message));
      const hilo = hj.predictions || [];
      let predictions = cj.predictions || [];
      if (cj.error && hilo.length >= 2) predictions = this._buildPredictionsFromHilo(hilo);
      else if (cj.error) throw new Error(this._friendlyNoaaError(cj.error?.message));
      this._data = { predictions, hilo, intervalFallback: Boolean(cj.error && predictions.length) };
      this._autoData = autoData || {};
      this._renderData();
    } catch (err) {
      this._renderError(err.message);
    }
  }

  _friendlyNoaaError(message) {
    const raw = String(message || "").trim();
    if (raw.toLowerCase().includes("no predictions data")) {
      return "NOAA did not return tide predictions for this station. Try a nearby NOAA tide station or a known preset.";
    }
    return raw || "NOAA error";
  }

  _buildPredictionsFromHilo(hilo) {
    const events = (hilo || [])
      .map((item) => ({ ...item, time: this._parsePredictionTime(item.t), value: parseFloat(item.v) }))
      .filter((item) => Number.isFinite(item.time.getTime()) && Number.isFinite(item.value))
      .sort((a, b) => a.time - b.time);
    if (events.length < 2) return [];

    const stepMs = 6 * 60 * 1000;
    const predictions = [];
    for (let i = 0; i < events.length - 1; i++) {
      const a = events[i];
      const b = events[i + 1];
      const spanMs = b.time.getTime() - a.time.getTime();
      if (spanMs <= 0) continue;
      for (let tMs = a.time.getTime(); tMs < b.time.getTime(); tMs += stepMs) {
        const f = (tMs - a.time.getTime()) / spanMs;
        const eased = (1 - Math.cos(Math.PI * f)) / 2;
        const value = a.value + (b.value - a.value) * eased;
        predictions.push({ t: this._formatNoaaTime(new Date(tMs)), v: value.toFixed(3) });
      }
    }
    const last = events[events.length - 1];
    predictions.push({ t: this._formatNoaaTime(last.time), v: last.value.toFixed(3) });
    return predictions;
  }

  _formatNoaaTime(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  }

  _dateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  }

  async _fetchAutoSources() {
    const [coops, nws, alerts, marine] = await Promise.all([
      this._fetchCoopsObservations().catch((err) => ({ error: err.message })),
      this._fetchNwsForecast().catch((err) => ({ error: err.message })),
      this._fetchMarineAlerts().catch((err) => { console.warn("BoatWise: marine alerts fetch failed:", err); return []; }),
      this._fetchMarineZoneForecast().catch((err) => { console.warn("BoatWise: marine forecast fetch failed:", err); return null; })
    ]);
    return {
      coops: coops || {},
      nws: nws || {},
      alerts: Array.isArray(alerts) ? alerts : [],
      marine: marine || null,
      updated: new Date().toISOString()
    };
  }

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
        expires: f?.properties?.expires ? new Date(f.properties.expires) : null,
        onset: f?.properties?.onset ? new Date(f.properties.onset) : null
      }))
      .filter((a) => {
        const ev = a.event.toLowerCase();
        const eventMatches = relevantEvents.some((re) => ev.startsWith(re));
        const severityRelevant = ["Severe", "Moderate"].includes(a.severity);
        return eventMatches && (severityRelevant || ev.startsWith("special marine warning"));
      });
    this._setCached(`alerts:${zone}`, alerts);
    return alerts;
  }

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

  async _fetchCoopsObservations() {
    const { station, units } = this._config;
    const base = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter";
    const common = `station=${station}&time_zone=lst_ldt&units=${units}&application=boatwise_card&format=json&date=latest`;
    const products = [
      ["water_temperature", "waterTemp"],
      ["wind", "wind"],
      ["air_pressure", "pressure"]
    ];
    const results = await Promise.all(products.map(async ([product, key]) => {
      const res = await fetch(`${base}?${common}&product=${product}`);
      if (!res.ok) return [key, null];
      const json = await res.json();
      if (json.error) return [key, null];
      const item = Array.isArray(json.data) ? json.data[0] : null;
      return [key, item || null];
    }));
    return Object.fromEntries(results.filter(([, value]) => value));
  }

  async _fetchNwsForecast() {
    const { lat, lon } = this._getForecastLatLon();
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return {};
    const headers = { Accept: "application/geo+json" };
    const pointRes = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`, { headers });
    if (!pointRes.ok) return {};
    const point = await pointRes.json();
    const hourlyUrl = point?.properties?.forecastHourly;
    if (!hourlyUrl) return {};
    const hourlyRes = await fetch(hourlyUrl, { headers });
    if (!hourlyRes.ok) return {};
    const hourly = await hourlyRes.json();
    const periods = Array.isArray(hourly?.properties?.periods) ? hourly.properties.periods : [];
    return { point: point.properties || {}, period: periods[0] || null, periods };
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
    const autoWeather = this._getAutoWeatherState();
    if (autoWeather) return autoWeather;
    const keys = Object.keys(states).filter((k) => k.startsWith("weather."));
    if (!keys.length) return null;
    const preferred = keys.find((k) => {
      const fn = String(states[k]?.attributes?.friendly_name || "").toLowerCase();
      return fn.includes("home") || fn.includes("weather");
    });
    return states[preferred || keys[0]] || null;
  }

  _getForecastLatLon() {
    const configLat = Number(this._config.latitude);
    const configLon = Number(this._config.longitude);
    const preset = STATION_PRESETS.find((item) => item.station === String(this._config.station));
    const stationLat = Number(preset?.lat);
    const stationLon = Number(preset?.lon);
    return {
      lat: Number.isFinite(configLat) ? configLat : Number.isFinite(stationLat) ? stationLat : 33.688,
      lon: Number.isFinite(configLon) ? configLon : Number.isFinite(stationLon) ? stationLon : -78.886
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
    const unit = String(attrs.wind_speed_unit || attrs.unit_of_measurement || "").toLowerCase();
    if (Number.isFinite(raw) && unit.includes("km")) return raw * 0.621371;
    if (Number.isFinite(raw) && unit.includes("m/s")) return raw * 2.23694;
    if (Number.isFinite(raw) && unit.includes("kn")) return raw * 1.15078;
    if (Number.isFinite(raw)) return raw;
    const coopsWind = this._parseCoopsWindSpeedMph();
    if (coopsWind !== null) return coopsWind;
    const marineWindKt = Number(this._autoData?.marine?.parsed?.wind?.max);
    if (Number.isFinite(marineWindKt)) return marineWindKt * 1.15078;
    return this._parseNwsWindSpeedMph();
  }

  _getWindBearing(weather) {
    const d = this._getNumericEntity(this._config.wind_direction_entity);
    if (d) return d.value;
    const bearing = Number(weather?.attributes?.wind_bearing);
    if (Number.isFinite(bearing)) return bearing;
    const coopsBearing = Number(this._autoData?.coops?.wind?.d);
    if (Number.isFinite(coopsBearing)) return coopsBearing;
    const marineBearing = this._compassToBearing(this._autoData?.marine?.parsed?.wind?.direction);
    if (Number.isFinite(marineBearing)) return marineBearing;
    return this._parseNwsWindDirection();
  }

  _formatWind(speedMph, bearing) {
    if (!Number.isFinite(speedMph)) return "";
    const windUnits = this._normalizeWindUnits(this._config.wind_units);
    let speed;
    if (windUnits === "kmh" || (windUnits === "auto" && this._config.units === "metric")) {
      speed = `${Math.round(speedMph * 1.60934)} km/h`;
    } else if (windUnits === "knots") {
      speed = `${Math.round(speedMph / 1.15078)} kt`;
    } else if (windUnits === "beaufort") {
      speed = `Bft ${this._beaufortFromMph(speedMph)}`;
    } else {
      speed = `${Math.round(speedMph)} mph`;
    }
    const direction = this._formatWindDirection(bearing);
    return `Wind ${speed}${direction ? " " + direction : ""}`;
  }

  _beaufortFromMph(speedMph) {
    const mph = Math.max(0, Number(speedMph) || 0);
    const upperBounds = [1, 4, 8, 13, 19, 25, 32, 39, 47, 55, 64, 73];
    const index = upperBounds.findIndex((limit) => mph < limit);
    return index === -1 ? 12 : index;
  }

  _formatWindDirection(bearing) {
    const b = Number(bearing);
    if (!Number.isFinite(b)) return "";
    const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return dirs[Math.round((((b % 360) + 360) % 360) / 22.5) % 16];
  }

  _compassToBearing(dir) {
    const map = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
    return map[String(dir || "").toUpperCase()] ?? null;
  }

  _parseNwsHourlyWindKt(period) {
    if (!period) return null;
    const ws = String(period.windSpeed || "");
    const m = ws.match(/(\d+)(?:\s+to\s+(\d+))?\s*mph/i);
    if (!m) return null;
    const maxMph = parseInt(m[2] || m[1], 10);
    if (!Number.isFinite(maxMph)) return null;
    return maxMph / 1.15078;
  }

  _seasFtFromMarinePeriod(period) {
    if (!period) return null;
    const parsed = parseMarineForecastPeriod(period.detailedForecast || period.shortForecast || "");
    if (!parsed?.seas) return null;
    return parsed.seas.max ?? parsed.seas.min;
  }

  _qualityForTimeBuilder(alerts) {
    const hourly = this._autoData?.nws?.periods || [];
    const marine = this._autoData?.marine?.allPeriods || [];
    const cache = new Map();
    const findPeriod = (periods, tMs) => {
      for (const p of periods) {
        const s = new Date(p.startTime).getTime();
        const e = new Date(p.endTime).getTime();
        if (Number.isFinite(s) && Number.isFinite(e) && tMs >= s && tMs < e) return p;
      }
      return null;
    };
    return (date) => {
      const tMs = date.getTime();
      const hourKey = Math.floor(tMs / 3600000);
      if (cache.has(hourKey)) return cache.get(hourKey);
      const nwsPeriod = findPeriod(hourly, tMs);
      const marinePeriod = findPeriod(marine, tMs);
      const windKt = nwsPeriod ? this._parseNwsHourlyWindKt(nwsPeriod) : null;
      const seasFt = marinePeriod ? this._seasFtFromMarinePeriod(marinePeriod) : null;
      const conditions = nwsPeriod?.shortForecast || marinePeriod?.shortForecast || null;
      const activeAtT = (alerts || []).filter((a) => {
        if (a.onset instanceof Date && a.onset.getTime() > tMs) return false;
        if (a.expires instanceof Date && a.expires.getTime() <= tMs) return false;
        return true;
      });
      const result = boatingQualityScore({ windKt, seasFt, alerts: activeAtT, conditions });
      cache.set(hourKey, result);
      return result;
    };
  }

  _worstQualityInWindow(qualityForTime, window) {
    const startMs = window.start.getTime();
    const endMs = window.end.getTime();
    let worst = qualityForTime(window.start);
    for (let t = startMs + 3600000; t < endMs; t += 3600000) {
      const q = qualityForTime(new Date(t));
      if (q.score < worst.score) worst = q;
    }
    const last = qualityForTime(window.end);
    if (last.score < worst.score) worst = last;
    return worst;
  }

  _getPressureHpa(weather) {
    const direct = this._getNumericEntity(this._config.pressure_entity);
    if (direct) {
      const unit = String(direct.unit || "").toLowerCase();
      return this._normalizePressureHpa(direct.value, unit);
    }
    const attrs = weather?.attributes || {};
    const raw = Number(attrs.pressure);
    const unit = String(attrs.pressure_unit || attrs.unit_of_measurement || "").toLowerCase();
    if (Number.isFinite(raw)) return this._normalizePressureHpa(raw, unit);
    const autoPressure = this._parseAutoPressureHpa();
    return autoPressure;
  }

  _normalizePressureHpa(value, unit = "") {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return null;
    const label = String(unit || "").toLowerCase();
    if (label.includes("inhg") || label.includes("in hg") || label.includes("inches")) return raw * 33.8639;
    if (label.includes("kpa")) return raw * 10;
    if (label === "pa" || label.includes(" pascal")) return raw / 100;
    if (label.includes("hpa") || label.includes("mbar") || label.includes("millibar") || label.includes("mb")) return raw;
    if (raw >= 25 && raw <= 35) return raw * 33.8639;
    if (raw >= 85 && raw <= 115) return raw * 10;
    if (raw >= 850 && raw <= 1100) return raw;
    if (raw >= 85000 && raw <= 110000) return raw / 100;
    return raw;
  }

  _getWaterTempF() {
    const e = this._getNumericEntity(this._config.water_temp_entity);
    if (e) {
      const unit = String(e.unit || "").toLowerCase();
      return unit.includes("c") ? e.value * 9 / 5 + 32 : e.value;
    }
    const coopsTemp = this._parseCoopsWaterTempF();
    if (coopsTemp !== null) return coopsTemp;
    return null;
  }

  _formatWaterTemp(tempF) {
    if (!Number.isFinite(tempF)) return "";
    if (this._config.units === "metric") return `${Math.round((tempF - 32) * 5 / 9)}°C`;
    return `${Math.round(tempF)}°F`;
  }

  _getAutoWeatherState() {
    const period = this._autoData?.nws?.period;
    if (!period) return null;
    return {
      entity_id: "boatwise.nws_hourly",
      state: this._normalizeNwsShortForecast(period.shortForecast),
      attributes: {
        wind_speed: this._parseNwsWindSpeedMph(),
        wind_bearing: this._parseNwsWindDirection()
      }
    };
  }

  _normalizeNwsShortForecast(shortForecast) {
    const text = String(shortForecast || "").toLowerCase();
    if (!text) return "unknown";
    if (text.includes("thunder")) return "lightning-rainy";
    if (text.includes("rain") || text.includes("showers")) return "rainy";
    if (text.includes("fog")) return "fog";
    if (text.includes("sunny") || text.includes("clear")) return "sunny";
    if (text.includes("partly")) return "partlycloudy";
    if (text.includes("cloud")) return "cloudy";
    return text;
  }

  _parseCoopsWaterTempF() {
    const item = this._autoData?.coops?.waterTemp;
    const val = Number(item?.v);
    if (!Number.isFinite(val)) return null;
    return this._config.units === "metric" ? val * 9 / 5 + 32 : val;
  }

  _parseCoopsWindSpeedMph() {
    const val = Number(this._autoData?.coops?.wind?.s);
    if (!Number.isFinite(val)) return null;
    return this._config.units === "metric" ? val * 2.23694 : val * 1.15078;
  }

  _parseAutoPressureHpa() {
    const val = Number(this._autoData?.coops?.pressure?.v);
    if (!Number.isFinite(val)) return null;
    return this._normalizePressureHpa(val, "");
  }

  _parseNwsWindSpeedMph() {
    const raw = String(this._autoData?.nws?.period?.windSpeed || "");
    const range = raw.match(/([0-9]+)\s*(?:to|-)\s*([0-9]+)/i);
    if (range) return (Number(range[1]) + Number(range[2])) / 2;
    const single = raw.match(/[0-9]+/);
    return single ? Number(single[0]) : null;
  }

  _parseNwsWindDirection() {
    const raw = String(this._autoData?.nws?.period?.windDirection || "").toUpperCase();
    const map = { N: 0, NNE: 22.5, NE: 45, ENE: 67.5, E: 90, ESE: 112.5, SE: 135, SSE: 157.5, S: 180, SSW: 202.5, SW: 225, WSW: 247.5, W: 270, WNW: 292.5, NW: 315, NNW: 337.5 };
    return map[raw] ?? NaN;
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
    const weather = this._getWeatherState();
    const windLabel = this._formatWind(this._getWindSpeedMph(weather), this._getWindBearing(weather));
    const stationLabel = this._config.station;
    const root = this.shadowRoot.getElementById("root");

    const horizonMs = (this._config.forecast_horizon_hours || 72) * 3600000;
    const horizonCutoff = new Date(now.getTime() + horizonMs);
    const seriesForWindows = predictions.filter((p) => {
      const tMs = this._parsePredictionTime(p.t).getTime();
      return Number.isFinite(tMs) && tMs >= now.getTime() - 6 * 60 * 1000 && tMs <= horizonCutoff.getTime();
    });
    const rawWindows = extractSafeWindows(
      seriesForWindows.map((p) => ({ time: this._parsePredictionTime(p.t), value: parseFloat(p.v) })),
      this._config.depth_threshold
    );
    const windows = clipWindowsToDaylight(rawWindows, {
      daylightOnly: this._config.daylight_only,
      lat: this._config.latitude,
      lon: this._config.longitude,
      dawnOffsetMinutes: this._config.dawn_offset_minutes,
      duskOffsetMinutes: this._config.dusk_offset_minutes
    });
    this._lastWindows = windows;

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

    // Time-varying quality: each hour evaluated against its own forecast period.
    const qualityForTime = this._qualityForTimeBuilder(alerts);
    const quality = qualityForTime(now);

    // Look ahead for a worse quality window so the why-row can warn about it
    let worstAhead = quality;
    let worstAheadTime = null;
    for (let t = now.getTime() + 3600000; t < horizonCutoff.getTime(); t += 3600000) {
      const q = qualityForTime(new Date(t));
      if (q.score < worstAhead.score) {
        worstAhead = q;
        worstAheadTime = new Date(t);
      }
    }
    const seasObj = this._autoData?.marine?.parsed?.seas;

    const windowsForPanel = windows
      .filter((w) => w.end.getTime() > now.getTime())
      .slice(0, 8);
    const hasActiveAlert = chip.status === "ADVISORY";

    const windowsHtml = windowsForPanel.length
      ? `
        <div class="windows-section">
          <div class="section-label">Upcoming Boating Windows</div>
          <div class="windows-scroll">
            ${windowsForPanel.map((w) => {
              const arriveBy = new Date(w.start.getTime() - this._config.wharf_buffer_minutes * 60000);
              const dur = Math.round(w.duration_minutes);
              const durLabel = dur >= 60 ? `${Math.floor(dur/60)}h ${dur%60}m` : `${dur}m`;
              const dateLabel = this._formatWindowDate(w.start);
              const startClock = this._formatClock(w.start);
              const endClock = this._formatClock(w.end);
              const arriveClock = this._formatClock(arriveBy);
              const isOpenNow = w.start.getTime() <= now.getTime() && now.getTime() < w.end.getTime();
              const winQuality = this._worstQualityInWindow(qualityForTime, w);
              const qualityClass = `quality-${winQuality.label.toLowerCase()}`;
              const stateClass = hasActiveAlert ? "advisory" : isOpenNow ? "open-now" : "upcoming";
              const winTitle = winQuality.reasons.length ? `${winQuality.label}: ${winQuality.reasons.join(" · ")}` : winQuality.label;
              return `
                <div class="window-card ${stateClass} ${qualityClass}" title="${this._escape(winTitle)}">
                  ${hasActiveAlert ? `<span class="card-warn">&#9888;</span>` : ""}
                  <div class="card-day">${dateLabel}${isOpenNow ? ' <span class="card-open-badge">OPEN</span>' : ""}</div>
                  <div class="card-time">${startClock} <span class="card-arrow">&rarr;</span> ${endClock}</div>
                  <div class="card-meta">
                    <span class="card-dur">&#9201; ${durLabel}</span>
                    <span class="card-arrive">arrive ${arriveClock}</span>
                  </div>
                  <div class="card-quality">
                    <span class="card-quality-dot quality-${winQuality.label.toLowerCase()}"></span>
                    <span class="card-quality-label">${winQuality.label}</span>
                  </div>
                </div>
              `;
            }).join("")}
          </div>
        </div>
      `
      : `<div class="windows-section windows-empty">
          <div class="section-label">Upcoming Boating Windows</div>
          <div class="empty-note">No safe windows in the next ${this._config.forecast_horizon_hours} h.</div>
        </div>`;

    const waterTempLabel = this._formatWaterTemp(this._getWaterTempF());
    const seasLabel = seasObj
      ? (seasObj.min === seasObj.max ? `Seas ${seasObj.min} ft` : `Seas ${seasObj.min}-${seasObj.max} ft`)
      : "";
    const pressureHpa = this._getPressureHpa(weather);
    const pressureLabel = Number.isFinite(pressureHpa) ? `${pressureHpa.toFixed(0)} hPa` : "";

    const qualityClass = `quality-chip-${quality.label.toLowerCase()}`;
    const qualityReasonText = quality.reasons.length ? quality.reasons.join(" · ") : "";
    const qualityChipTitle = qualityReasonText ? `${quality.label}: ${qualityReasonText}` : quality.label;
    const qualityChipHtml = `<span class="quality-chip ${qualityClass}" title="${this._escape(qualityChipTitle)}">${quality.label}</span>`;

    const chartChipsHtml = [
      seasLabel ? `<span class="condition-chip">${seasLabel}</span>` : "",
      waterTempLabel ? `<span class="condition-chip">Water ${waterTempLabel}</span>` : "",
      pressureLabel ? `<span class="condition-chip">${pressureLabel}</span>` : "",
      qualityChipHtml
    ].filter(Boolean).join("");

    const showHeadsUp = worstAhead.score < quality.score && worstAheadTime;
    const headsUpReason = showHeadsUp ? worstAhead.reasons.join(" · ") : "";
    const headsUpClock = showHeadsUp ? this._formatClock(worstAheadTime) : "";
    const headsUpDay = showHeadsUp ? this._formatWindowDate(worstAheadTime) : "";

    const legendHtml = `
      <div class="band-legend">
        <span class="legend-item"><span class="legend-dot quality-great"></span>Great</span>
        <span class="legend-item"><span class="legend-dot quality-good"></span>Good</span>
        <span class="legend-item"><span class="legend-dot quality-fair"></span>Fair</span>
        <span class="legend-item"><span class="legend-dot quality-bad"></span>Bad</span>
        <span class="legend-item"><span class="legend-dot shallow"></span>Too Shallow</span>
      </div>
      ${qualityReasonText ? `
        <div class="quality-why">
          <span class="quality-why-label quality-why-${quality.label.toLowerCase()}">Now · ${quality.label}:</span>
          <span class="quality-why-reasons">${this._escape(qualityReasonText)}</span>
        </div>
      ` : ""}
      ${showHeadsUp ? `
        <div class="quality-why">
          <span class="quality-why-label quality-why-${worstAhead.label.toLowerCase()}">${headsUpDay} ${headsUpClock} · ${worstAhead.label}:</span>
          <span class="quality-why-reasons">${this._escape(headsUpReason)}</span>
        </div>
      ` : ""}
    `;

    root.innerHTML = `
      <div class="header">
        <div class="title">${this._config.title}</div>
        <div class="subtitle">NOAA ${stationLabel}</div>
      </div>
      <div class="status-row">
        <span class="status-chip ${chipClass}">${chipLabel}</span>
        <span class="status-summary">${this._escape(chip.summary)}</span>
      </div>
      ${this._marineZoneError ? `<div class="marine-zone-error">${this._escape(this._marineZoneError)}</div>` : ""}
      <div class="current-row">
        <div class="current-icon">&#127754;</div>
        <div>
          <div class="current-label">Current Tide</div>
          <div class="current-value">${cur.toFixed(1)}<span class="current-unit"> ${unitLabel}</span></div>
        </div>
        <div class="condition-spacer"></div>
        ${windLabel ? `<div class="condition-chip">${windLabel}</div>` : ""}
        <div class="direction-chip">
          <div class="pulse-dot"></div>
          <span>${rising ? "▲ Rising" : "▼ Falling"}</span>
        </div>
      </div>
      <div class="chart-section">
        <div class="chart-header">
          <div class="section-label">Tide &amp; Quality</div>
          ${chartChipsHtml ? `<div class="chip-cluster">${chartChipsHtml}</div>` : ""}
        </div>
        <div class="chart-wrap"><canvas id="tideCanvas"></canvas></div>
        ${this._xAxisHtml(chartPredictions)}
        ${legendHtml}
      </div>
      ${windowsHtml}
      <div class="tides-grid">
        ${this._pillHtml("low", nextLow, unitLabel)}
        ${this._pillHtml("high", nextHigh, unitLabel)}
      </div>
      ${this._config.debug?.enabled && this._config.debug?.panel ? this._debugHtml(windows, alerts, chip, chartPredictions, cur, unitLabel) : ""}
    `;

    requestAnimationFrame(() => {
      this._chartCanvas = this.shadowRoot.getElementById("tideCanvas");
      this._drawChart(chartPredictions, now, cur, unitLabel, this._config.depth_threshold, [nextHigh, nextLow].filter(Boolean), qualityForTime);
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
        <div class="pill-main">
          <div class="pill-time"><span class="pill-arrow ${type}">${arrow}</span>${this._formatClock(this._parseHiloTime(tide.t))}</div>
          <div class="pill-ft">${parseFloat(tide.v).toFixed(1)} ${unitLabel}</div>
        </div>
      </div>`;
  }

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

  _themeColor(name, fallback) {
    const value = getComputedStyle(this).getPropertyValue(name).trim();
    return value && !value.includes("var(") ? value : fallback;
  }

  _chartColors() {
    if (this._config.theme_mode === "auto") {
      const accent = this._themeColor("--accent-color", this._themeColor("--primary-color", "#2a7a94"));
      const cardBg = this._themeColor("--card-background-color", "rgba(255,255,255,0.88)");
      const divider = this._themeColor("--divider-color", "rgba(42,122,148,0.45)");
      return {
        grid: divider,
        axis: this._themeColor("--secondary-text-color", "rgba(10,30,45,0.65)"),
        labelBg: cardBg,
        nowLabelBg: cardBg,
        labelBorder: divider,
        nowLabelBorder: divider,
        labelText: this._themeColor("--primary-text-color", "#0a1e28"),
        tideLine: accent,
        highMarker: this._themeColor("--primary-color", "#0a7a70"),
        lowMarker: accent,
        nowMarker: this._themeColor("--warning-color", "#e8b84b"),
        markerStroke: cardBg,
        nowMarkerStroke: cardBg
      };
    }
    return {
      grid: this._themeColor("--bw-chart-grid", "rgba(10,30,45,0.15)"),
      axis: this._themeColor("--bw-chart-axis", "rgba(10,30,45,0.65)"),
      labelBg: this._themeColor("--bw-chart-label-bg", "rgba(255,255,255,0.88)"),
      nowLabelBg: this._themeColor("--bw-chart-now-label-bg", "rgba(255,255,255,0.92)"),
      labelBorder: this._themeColor("--bw-chart-label-border", "rgba(42,122,148,0.45)"),
      nowLabelBorder: this._themeColor("--bw-chart-now-label-border", "rgba(42,122,148,0.55)"),
      labelText: this._themeColor("--bw-chart-label-text", "#0a1e28"),
      tideLine: this._themeColor("--bw-tide-line", "#2a7a94"),
      highMarker: this._themeColor("--high-color", "#0a7a70"),
      lowMarker: this._themeColor("--low-color", "#2a7a94"),
      nowMarker: this._themeColor("--gold", "#e8b84b"),
      markerStroke: this._themeColor("--bw-marker-stroke", "rgba(255,255,255,0.9)"),
      nowMarkerStroke: this._themeColor("--bw-now-marker-stroke", "rgba(255,255,255,0.92)")
    };
  }

  _drawChart(predictions, now, cur, unitLabel, threshold, tideEvents = [], qualityForTime = null) {
    const canvas = this._chartCanvas;
    if (!canvas) return;
    const theme = this._chartColors();
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

    ctx.strokeStyle = theme.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i <= 3; i++) {
      const v = minV + (i / 3) * (maxV - minV);
      const y = toY(v);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(W - padR, y);
      ctx.stroke();
      ctx.fillStyle = theme.axis;
      ctx.font = "bold 9px monospace";
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(1), padL - 3, y + 3);
    }

    // Color bands: safe segments fill in per-time quality color, shallow segments fill gray.
    const QUALITY_COLORS = {
      GREAT: "rgba(60,170,110,0.55)",
      GOOD: "rgba(96,188,152,0.50)",
      FAIR: "rgba(232,184,75,0.55)",
      BAD: "rgba(192,80,48,0.50)"
    };
    const shallowFill = "rgba(140,140,140,0.36)";
    const baselineY = H - padB;
    const hasThreshold = Number.isFinite(threshold);

    const fillTrapezoid = (x1, y1, x2, y2, color) => {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.lineTo(x2, baselineY);
      ctx.lineTo(x1, baselineY);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const qualityFillAt = (timeA, timeB) => {
      if (typeof qualityForTime !== "function") return QUALITY_COLORS.GOOD;
      const mid = new Date((timeA + timeB) / 2);
      const q = qualityForTime(mid);
      return QUALITY_COLORS[q.label] || QUALITY_COLORS.GOOD;
    };

    for (let i = 0; i < predictions.length - 1; i++) {
      const v1 = parseFloat(predictions[i].v);
      const v2 = parseFloat(predictions[i + 1].v);
      const x1 = toX(predictions[i]);
      const x2 = toX(predictions[i + 1]);
      const y1 = toY(v1);
      const y2 = toY(v2);
      const tA = this._parsePredictionTime(predictions[i].t).getTime();
      const tB = this._parsePredictionTime(predictions[i + 1].t).getTime();
      const segFill = qualityFillAt(tA, tB);

      if (!hasThreshold) {
        fillTrapezoid(x1, y1, x2, y2, segFill);
        continue;
      }
      const aSafe = v1 >= threshold;
      const bSafe = v2 >= threshold;
      if (aSafe && bSafe) {
        fillTrapezoid(x1, y1, x2, y2, segFill);
      } else if (!aSafe && !bSafe) {
        fillTrapezoid(x1, y1, x2, y2, shallowFill);
      } else {
        // crossing — interpolate
        const ratio = (threshold - v1) / (v2 - v1);
        const xc = x1 + ratio * (x2 - x1);
        const yc = toY(threshold);
        if (aSafe) {
          fillTrapezoid(x1, y1, xc, yc, segFill);
          fillTrapezoid(xc, yc, x2, y2, shallowFill);
        } else {
          fillTrapezoid(x1, y1, xc, yc, shallowFill);
          fillTrapezoid(xc, yc, x2, y2, segFill);
        }
      }
    }

    // Threshold reference line (drawn over the bands).
    if (hasThreshold && threshold >= minV) {
      const thresholdY = toY(Math.min(threshold, maxV));
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = "rgba(180,100,70,0.62)";
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(padL, thresholdY);
      ctx.lineTo(W - padR, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);
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
      ctx.fillStyle = isHigh ? theme.highMarker : theme.lowMarker;
      ctx.fill();
      ctx.strokeStyle = theme.markerStroke;
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
      ctx.fillStyle = theme.labelBg;
      ctx.strokeStyle = theme.labelBorder;
      ctx.lineWidth = 1;
      this._roundedRect(ctx, lx, ly, lw + 8, 15, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = theme.labelText;
      ctx.textAlign = "left";
      ctx.fillText(label, lx + 4, ly + 10);
    });

    ctx.beginPath();
    predictions.forEach((p, i) => {
      const x = toX(p);
      const y = toY(parseFloat(p.v));
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.strokeStyle = theme.tideLine;
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
    ctx.fillStyle = theme.nowMarker;
    ctx.fill();
    ctx.strokeStyle = theme.nowMarkerStroke;
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
    ctx.fillStyle = theme.nowLabelBg;
    ctx.strokeStyle = theme.nowLabelBorder;
    ctx.lineWidth = 1;
    this._roundedRect(ctx, bx, by, tw + 10, 16, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = theme.labelText;
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

  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

  getCardSize() { return 5; }
}

class BoatWiseCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._hass = null;
    this._rendered = false;
    this._mapCenter = null;
    this._mapZoom = 12;
    this._mapDrag = null;
    this._mapRenderFrame = null;
    this._suppressMapClick = false;
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._rendered) this._render();
  }

  setConfig(config) {
    this._config = {
      title: "BoatWise",
      station: "8661070",
      units: "english",
      wind_units: "auto",
      theme_mode: "boatwise",
      auto_sources: true,
      grid_options: { rows: "full", columns: 18 },
      ...config
    };
    this._config.theme_mode = this._normalizeThemeMode(this._config.theme_mode);
    this._config.wind_units = this._normalizeWindUnits(this._config.wind_units);
    this._applyDefaultForecastPoint();
    this._syncMapCenterToConfig(this._config);
    this._render();
  }

  _applyDefaultForecastPoint() {
    if (!this._config) return;
    const hasLat = Number.isFinite(Number(this._config.latitude));
    const hasLon = Number.isFinite(Number(this._config.longitude));
    if (hasLat && hasLon) return;
    const preset = this._presetForStation(this._config.station);
    if (!preset) return;
    const lat = Number(preset.lat);
    const lon = Number(preset.lon);
    if (!hasLat && Number.isFinite(lat)) this._config.latitude = lat;
    if (!hasLon && Number.isFinite(lon)) this._config.longitude = lon;
  }

  _currentForecastPoint() {
    const lat = Number(this._config?.latitude);
    const lon = Number(this._config?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
    const preset = this._presetForStation(this._config?.station);
    const fallbackLat = Number(preset?.lat);
    const fallbackLon = Number(preset?.lon);
    return {
      lat: Number.isFinite(fallbackLat) ? fallbackLat : 33.688,
      lon: Number.isFinite(fallbackLon) ? fallbackLon : -78.886
    };
  }

  _syncMapCenterToConfig(config = this._config) {
    const lat = Number(config?.latitude);
    const lon = Number(config?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) this._mapCenter = { lat, lon };
  }

  _clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  _roundCoord(value) {
    return Math.round(Number(value) * 1000000) / 1000000;
  }

  _mapState() {
    const point = this._currentForecastPoint();
    if (!this._mapCenter || !Number.isFinite(this._mapCenter.lat) || !Number.isFinite(this._mapCenter.lon)) {
      this._mapCenter = { ...point };
    }
    this._mapZoom = Math.round(this._clamp(Number(this._mapZoom) || 12, 3, 18));
    return {
      point,
      center: this._mapCenter,
      zoom: this._mapZoom,
      label: `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`,
      zoomLabel: `Zoom ${this._mapZoom}`
    };
  }

  _wrapLon(lon) {
    return ((((Number(lon) || 0) + 180) % 360) + 360) % 360 - 180;
  }

  _projectLatLon(lat, lon, zoom = this._mapZoom) {
    const scale = 256 * 2 ** zoom;
    const clampedLat = this._clamp(Number(lat) || 0, -85.05112878, 85.05112878);
    const wrappedLon = this._wrapLon(lon);
    const sinLat = Math.sin(clampedLat * Math.PI / 180);
    return {
      x: (wrappedLon + 180) / 360 * scale,
      y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale
    };
  }

  _unprojectLatLon(x, y, zoom = this._mapZoom) {
    const scale = 256 * 2 ** zoom;
    const lon = x / scale * 360 - 180;
    const n = Math.PI - 2 * Math.PI * y / scale;
    const lat = 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return {
      lat: this._clamp(lat, -85.05112878, 85.05112878),
      lon: this._wrapLon(lon)
    };
  }

  _mapPointFromEvent(event) {
    const map = this.shadowRoot.getElementById("forecastMap");
    if (!map) return null;
    const rect = map.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const state = this._mapState();
    const centerPx = this._projectLatLon(state.center.lat, state.center.lon, state.zoom);
    const x = centerPx.x + (event.clientX - rect.left) - rect.width / 2;
    const y = centerPx.y + (event.clientY - rect.top) - rect.height / 2;
    return this._unprojectLatLon(x, y, state.zoom);
  }

  _renderForecastMapTiles() {
    const map = this.shadowRoot.getElementById("forecastMap");
    const tileRoot = this.shadowRoot.getElementById("mapTiles");
    const pin = this.shadowRoot.getElementById("mapPin");
    const coords = this.shadowRoot.getElementById("mapCoords");
    if (!map || !tileRoot || !pin) return;
    const rect = map.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const state = this._mapState();
    const zoom = state.zoom;
    const tileSize = 256;
    const tilesPerSide = 2 ** zoom;
    const centerPx = this._projectLatLon(state.center.lat, state.center.lon, zoom);
    const topLeft = {
      x: centerPx.x - rect.width / 2,
      y: centerPx.y - rect.height / 2
    };
    const minTileX = Math.floor(topLeft.x / tileSize);
    const maxTileX = Math.floor((topLeft.x + rect.width) / tileSize);
    const minTileY = Math.floor(topLeft.y / tileSize);
    const maxTileY = Math.floor((topLeft.y + rect.height) / tileSize);
    const imgs = [];
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      if (ty < 0 || ty >= tilesPerSide) continue;
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        const wrappedX = ((tx % tilesPerSide) + tilesPerSide) % tilesPerSide;
        const left = Math.round(tx * tileSize - topLeft.x);
        const top = Math.round(ty * tileSize - topLeft.y);
        imgs.push(`<img src="https://tile.openstreetmap.org/${zoom}/${wrappedX}/${ty}.png" alt="" draggable="false" style="left:${left}px;top:${top}px;">`);
      }
    }
    tileRoot.innerHTML = imgs.join("");
    const pointPx = this._projectLatLon(state.point.lat, state.point.lon, zoom);
    pin.style.left = `${pointPx.x - topLeft.x}px`;
    pin.style.top = `${pointPx.y - topLeft.y}px`;
    if (coords) coords.textContent = state.label;
  }

  _queueMapTileRender() {
    if (this._mapRenderFrame) return;
    this._mapRenderFrame = requestAnimationFrame(() => {
      this._mapRenderFrame = null;
      this._renderForecastMapTiles();
    });
  }

  _presetForStation(station) {
    return STATION_PRESETS.find((item) => item.station === String(station));
  }

  _isGeneratedTitle(title) {
    const value = String(title || "").trim();
    return value === ""
      || value === "BoatWise"
      || STATION_PRESETS.some((item) => value === `${item.name} Tides`);
  }

  _normalizeThemeMode(value) {
    return value === "auto" ? "auto" : "boatwise";
  }

  _normalizeWindUnits(value) {
    const unit = String(value || "auto").toLowerCase();
    return ["auto", "mph", "kmh", "knots", "beaufort"].includes(unit) ? unit : "auto";
  }

  _emitConfig(nextConfig, options = {}) {
    const oldLat = Number(this._config?.latitude);
    const oldLon = Number(this._config?.longitude);
    this._config = nextConfig;
    const newLat = Number(nextConfig?.latitude);
    const newLon = Number(nextConfig?.longitude);
    const pointChanged = oldLat !== newLat || oldLon !== newLon;
    if (!options.keepMapCenter && pointChanged) this._syncMapCenterToConfig(nextConfig);
    const event = new Event("config-changed", { bubbles: true, composed: true });
    event.detail = { config: nextConfig };
    this.dispatchEvent(event);
    this._render();
  }

  _setValue(key, value) {
    const next = { ...this._config, [key]: value };
    this._emitConfig(next);
  }

  _setForecastPoint(lat, lon, options = {}) {
    const nextLat = this._roundCoord(lat);
    const nextLon = this._roundCoord(lon);
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLon)) return;
    this._emitConfig({ ...this._config, latitude: nextLat, longitude: nextLon }, options);
  }

  _handleMapPick(event) {
    if (this._suppressMapClick) {
      this._suppressMapClick = false;
      return;
    }
    const point = this._mapPointFromEvent(event);
    if (point) this._setForecastPoint(point.lat, point.lon, { keepMapCenter: true });
  }

  _handleMapKey(event) {
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      this._zoomMap(1);
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      this._zoomMap(-1);
      return;
    }
    const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const point = this._currentForecastPoint();
    const step = (event.shiftKey ? 0.01 : 0.0025) * Math.max(1, 14 - this._mapZoom);
    const delta = {
      ArrowUp: [step, 0],
      ArrowDown: [-step, 0],
      ArrowLeft: [0, -step],
      ArrowRight: [0, step]
    }[event.key];
    this._setForecastPoint(point.lat + delta[0], point.lon + delta[1], { keepMapCenter: true });
  }

  _zoomMap(delta) {
    this._mapZoom = Math.round(this._clamp((Number(this._mapZoom) || 12) + delta, 3, 18));
    this._render();
  }

  _centerMapOnPoint() {
    const point = this._currentForecastPoint();
    this._mapCenter = { ...point };
    this._render();
  }

  _handleMapPointerDown(event) {
    const map = this.shadowRoot.getElementById("forecastMap");
    if (!map) return;
    this._mapDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      center: { ...this._mapState().center },
      moved: false
    };
    map.setPointerCapture?.(event.pointerId);
    map.classList.add("is-dragging");
  }

  _handleMapPointerMove(event) {
    if (!this._mapDrag || this._mapDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - this._mapDrag.startX;
    const dy = event.clientY - this._mapDrag.startY;
    if (Math.abs(dx) + Math.abs(dy) > 3) this._mapDrag.moved = true;
    const zoom = this._mapState().zoom;
    const startPx = this._projectLatLon(this._mapDrag.center.lat, this._mapDrag.center.lon, zoom);
    this._mapCenter = this._unprojectLatLon(startPx.x - dx, startPx.y - dy, zoom);
    this._queueMapTileRender();
  }

  _handleMapPointerUp(event) {
    const map = this.shadowRoot.getElementById("forecastMap");
    if (this._mapDrag?.moved) this._suppressMapClick = true;
    this._mapDrag = null;
    map?.classList.remove("is-dragging");
    try { map?.releasePointerCapture?.(event.pointerId); } catch (err) { /* noop */ }
  }

  _setNumber(key, value) {
    const num = Number(value);
    const next = { ...this._config };
    if (Number.isFinite(num)) next[key] = num;
    else delete next[key];
    this._emitConfig(next);
  }

  _setGridValue(key, value) {
    const grid = { ...(this._config.grid_options || {}) };
    if (key === "columns" && value !== "full") {
      const num = Number(value);
      grid.columns = Number.isFinite(num) ? num : 18;
    } else {
      grid[key] = value;
    }
    this._emitConfig({ ...this._config, grid_options: grid });
  }

  _applyStation(station) {
    const preset = this._presetForStation(station);
    const next = { ...this._config, station: String(station) };
    if (preset) {
      if (this._isGeneratedTitle(next.title)) next.title = `${preset.name} Tides`;
      next.latitude = preset.lat;
      next.longitude = preset.lon;
    }
    this._emitConfig(next);
  }

  async _useNoaaStationLocation() {
    const station = String(this._config.station || "").trim();
    if (!station) return;
    const button = this.shadowRoot.getElementById("stationLocation");
    if (button) button.disabled = true;
    try {
      const res = await fetch(`https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/${encodeURIComponent(station)}.json`);
      const json = await res.json();
      const stationInfo = json?.stations?.[0];
      const lat = Number(stationInfo?.lat);
      const lon = Number(stationInfo?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      const next = { ...this._config, latitude: lat, longitude: lon };
      const stationName = String(stationInfo?.name || "").trim();
      const state = String(stationInfo?.state || "").trim();
      if (stationName && this._isGeneratedTitle(next.title)) next.title = `${stationName}${state ? ", " + state : ""} Tides`;
      this._emitConfig(next);
    } catch (err) {
      // Keep the editor usable if NOAA metadata is unavailable.
    } finally {
      if (button) button.disabled = false;
    }
  }

  _render() {
    if (!this.shadowRoot) return;
    this._rendered = true;
    const config = this._config || {};
    const selectedPreset = this._presetForStation(config.station) ? String(config.station) : "custom";
    const grid = config.grid_options || {};
    const mapState = this._mapState();
    const tideOffsetUnit = config.units === "metric" ? "m" : "ft";
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
          color: var(--primary-text-color, #1f2933);
          font-family: var(--paper-font-body1_-_font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif);
        }
        .wrap { display: grid; gap: 16px; }
        .section { display: grid; gap: 10px; }
        .title { font-size: 14px; font-weight: 700; color: var(--primary-text-color, #1f2933); }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
        .wide { grid-column: 1 / -1; }
        label { display: grid; gap: 5px; font-size: 12px; font-weight: 700; color: var(--secondary-text-color, #536471); }
        input, select {
          box-sizing: border-box;
          width: 100%;
          min-height: 40px;
          padding: 8px 10px;
          border: 1px solid var(--divider-color, #d0d7de);
          border-radius: 8px;
          background: var(--card-background-color, #fff);
          color: var(--primary-text-color, #1f2933);
          font: inherit;
        }
        .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        button {
          min-height: 36px;
          padding: 7px 12px;
          border: 1px solid var(--divider-color, #d0d7de);
          border-radius: 8px;
          background: var(--secondary-background-color, #f6f8fa);
          color: var(--primary-text-color, #1f2933);
          font: inherit;
          font-weight: 700;
          cursor: pointer;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .check { display: flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 700; color: var(--primary-text-color, #1f2933); }
        .check input { width: auto; min-height: auto; }
        .hint { font-size: 12px; line-height: 1.35; color: var(--secondary-text-color, #536471); }
        .map-card {
          grid-column: 1 / -1;
          display: grid;
          gap: 8px;
          padding: 10px;
          border: 1px solid var(--divider-color, #d0d7de);
          border-radius: 12px;
          background: var(--secondary-background-color, rgba(246,248,250,0.78));
        }
        .map-head { display: flex; justify-content: space-between; gap: 10px; align-items: center; flex-wrap: wrap; }
        .map-title { font-size: 13px; font-weight: 850; color: var(--primary-text-color, #1f2933); }
        .map-subtitle { display: block; font-size: 11px; line-height: 1.3; color: var(--secondary-text-color, #536471); font-weight: 600; }
        .map-actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
        .map-actions button { min-height: 28px; padding: 4px 8px; border-radius: 7px; font-size: 12px; }
        .map-span { font-size: 11px; color: var(--secondary-text-color, #536471); font-weight: 800; white-space: nowrap; }
        .map-picker {
          position: relative;
          height: 168px;
          border: 1px solid var(--divider-color, #d0d7de);
          border-radius: 12px;
          overflow: hidden;
          cursor: grab;
          outline: none;
          touch-action: none;
          background: #b8d6df;
        }
        .map-picker.is-dragging { cursor: grabbing; }
        .map-picker:focus { box-shadow: 0 0 0 2px var(--accent-color, #2a9dcc); }
        .map-tiles {
          position: absolute;
          inset: 0;
          z-index: 0;
        }
        .map-tiles img {
          position: absolute;
          width: 256px;
          height: 256px;
          user-select: none;
          -webkit-user-drag: none;
        }
        .map-crosshair {
          position: absolute;
          inset: 0;
          z-index: 1;
          pointer-events: none;
        }
        .map-crosshair::before,
        .map-crosshair::after {
          content: "";
          position: absolute;
          background: rgba(10,30,45,0.20);
        }
        .map-crosshair::before {
          left: 50%;
          top: 0;
          bottom: 0;
          width: 1px;
        }
        .map-crosshair::after {
          top: 50%;
          left: 0;
          right: 0;
          height: 1px;
        }
        .map-pin {
          position: absolute;
          width: 18px;
          height: 18px;
          transform: translate(-50%, -100%) rotate(45deg);
          border-radius: 50% 50% 50% 2px;
          background: var(--accent-color, #2a9dcc);
          border: 2px solid var(--card-background-color, #fff);
          box-shadow: 0 2px 10px rgba(0,0,0,0.28);
          z-index: 2;
          pointer-events: none;
        }
        .map-pin::after {
          content: "";
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--card-background-color, #fff);
          left: 4px;
          top: 4px;
        }
        .map-coords {
          position: absolute;
          left: 8px;
          bottom: 8px;
          z-index: 2;
          padding: 3px 7px;
          border-radius: 99px;
          background: rgba(255,255,255,0.82);
          border: 1px solid rgba(0,0,0,0.10);
          color: #1f2933;
          font-size: 11px;
          font-weight: 800;
          font-family: var(--font-mono, monospace);
        }
        .map-attribution {
          position: absolute;
          right: 6px;
          bottom: 6px;
          z-index: 2;
          padding: 2px 5px;
          border-radius: 5px;
          background: rgba(255,255,255,0.82);
          color: #1f2933;
          font-size: 10px;
          font-weight: 700;
        }
        .map-attribution a { color: #1f2933; text-decoration: none; }
        @media (max-width: 520px) {
          .map-picker { height: 132px; }
          .map-head { align-items: flex-start; }
        }
      </style>
      <div class="wrap">
        <div class="section">
          <div class="title">Location</div>
          <div class="grid">
            <label>
              NOAA tide station
              <select id="stationPreset">
                ${STATION_PRESETS.map((item) => `<option value="${item.station}" ${selectedPreset === item.station ? "selected" : ""}>${item.name} (${item.station})</option>`).join("")}
                <option value="custom" ${selectedPreset === "custom" ? "selected" : ""}>Custom station ID</option>
              </select>
            </label>
            <label>
              Custom NOAA station ID
              <input id="station" value="${this._escape(config.station || "")}" placeholder="8661070">
            </label>
          </div>
          <div class="grid">
            <label>
              Forecast latitude
              <input id="latitude" type="number" step="0.000001" value="${config.latitude ?? ""}" placeholder="33.688">
            </label>
            <label>
              Forecast longitude
              <input id="longitude" type="number" step="0.000001" value="${config.longitude ?? ""}" placeholder="-78.886">
            </label>
          </div>
          <div class="map-card">
            <div class="map-head">
              <div>
                <span class="map-title">Forecast point picker</span>
                <span class="map-subtitle">Drag to pan, zoom in/out, then tap or click to set the forecast/marine point used for NWS weather context.</span>
              </div>
              <div class="map-actions">
                <button id="mapZoomOut" type="button" title="Zoom out">-</button>
                <span class="map-span">${mapState.zoomLabel}</span>
                <button id="mapZoomIn" type="button" title="Zoom in">+</button>
                <button id="mapCenter" type="button">Center on pin</button>
              </div>
            </div>
            <div id="forecastMap" class="map-picker" role="button" tabindex="0" aria-label="Tap or click to set forecast coordinates">
              <div id="mapTiles" class="map-tiles"></div>
              <div class="map-crosshair"></div>
              <div id="mapPin" class="map-pin"></div>
              <div id="mapCoords" class="map-coords">${this._escape(mapState.label)}</div>
              <div class="map-attribution">&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>
            </div>
            <div class="hint">This loads OpenStreetMap tiles only while the visual editor is open. Paste exact coordinates from Maps when precision matters, or use the map to move the forecast/marine point away from the tide gauge.</div>
          </div>
          <div class="row">
            <button id="stationLocation" type="button">Use NOAA station location</button>
            <span class="hint">Pick the marine/forecast point you care about, or use the tide station location for station-based context.</span>
          </div>
        </div>

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
          <label class="check">
            <input id="daylightOnly" type="checkbox" ${config.daylight_only ? "checked" : ""}>
            Daylight only (clip windows to dawn–dusk)
          </label>
          <div class="grid">
            <label>
              Dawn offset (minutes)
              <input id="dawnOffset" type="number" step="5" value="${config.dawn_offset_minutes ?? 0}" placeholder="0">
            </label>
            <label>
              Dusk offset (minutes)
              <input id="duskOffset" type="number" step="5" value="${config.dusk_offset_minutes ?? 0}" placeholder="0">
            </label>
          </div>
          <div class="hint">
            Depth threshold: tide height below which the river is too shallow to safely transit. Start at 4 ft and tune from experience.
            Marine zone ID lets BoatWise show NWS Small Craft Advisories and offshore wind/seas.
            <a href="https://www.weather.gov/marine_charts" target="_blank" rel="noopener">Find your marine zone</a>.
            Daylight offsets shift sunrise/sunset boundaries (negative = earlier / more permissive, positive = later / more restrictive).
          </div>
        </div>

        <div class="section">
          <div class="title">Card</div>
          <div class="grid">
            <label class="wide">
              Title
              <input id="title" value="${this._escape(config.title || "")}" placeholder="BoatWise">
            </label>
            <label>
              Units
              <select id="units">
                <option value="english" ${config.units !== "metric" ? "selected" : ""}>English (ft)</option>
                <option value="metric" ${config.units === "metric" ? "selected" : ""}>Metric (m)</option>
              </select>
            </label>
            <label>
              Wind units
              <select id="windUnits">
                <option value="auto" ${this._normalizeWindUnits(config.wind_units) === "auto" ? "selected" : ""}>Auto</option>
                <option value="mph" ${this._normalizeWindUnits(config.wind_units) === "mph" ? "selected" : ""}>MPH</option>
                <option value="kmh" ${this._normalizeWindUnits(config.wind_units) === "kmh" ? "selected" : ""}>km/h</option>
                <option value="knots" ${this._normalizeWindUnits(config.wind_units) === "knots" ? "selected" : ""}>Knots</option>
                <option value="beaufort" ${this._normalizeWindUnits(config.wind_units) === "beaufort" ? "selected" : ""}>Beaufort</option>
              </select>
            </label>
            <label>
              Theme
              <select id="themeMode">
                <option value="boatwise" ${config.theme_mode !== "auto" ? "selected" : ""}>BoatWise</option>
                <option value="auto" ${config.theme_mode === "auto" ? "selected" : ""}>Home Assistant theme</option>
              </select>
            </label>
          </div>
          <label class="check">
            <input id="autoSources" type="checkbox" ${config.auto_sources !== false ? "checked" : ""}>
            Fetch NOAA/NWS auto sources
          </label>
        </div>

        <div class="section">
          <div class="title">Dashboard Size</div>
          <div class="grid">
            <label>
              Rows
              <select id="gridRows">
                <option value="full" ${grid.rows === "full" ? "selected" : ""}>Full</option>
                <option value="auto" ${grid.rows === "auto" ? "selected" : ""}>Auto</option>
              </select>
            </label>
            <label>
              Columns
              <input id="gridColumns" value="${grid.columns ?? 18}" placeholder="18 or full">
            </label>
          </div>
          <div class="hint">Recommended: rows full, columns 18. Use columns full on narrower dashboards.</div>
        </div>
      </div>
    `;

    this.shadowRoot.getElementById("stationPreset")?.addEventListener("change", (event) => {
      const value = event.target.value;
      if (value !== "custom") this._applyStation(value);
    });
    this.shadowRoot.getElementById("station")?.addEventListener("change", (event) => this._setValue("station", String(event.target.value || "").trim()));
    this.shadowRoot.getElementById("latitude")?.addEventListener("change", (event) => this._setNumber("latitude", event.target.value));
    this.shadowRoot.getElementById("longitude")?.addEventListener("change", (event) => this._setNumber("longitude", event.target.value));
    const forecastMap = this.shadowRoot.getElementById("forecastMap");
    forecastMap?.addEventListener("click", (event) => this._handleMapPick(event));
    forecastMap?.addEventListener("keydown", (event) => this._handleMapKey(event));
    forecastMap?.addEventListener("pointerdown", (event) => this._handleMapPointerDown(event));
    forecastMap?.addEventListener("pointermove", (event) => this._handleMapPointerMove(event));
    forecastMap?.addEventListener("pointerup", (event) => this._handleMapPointerUp(event));
    forecastMap?.addEventListener("pointercancel", (event) => this._handleMapPointerUp(event));
    this.shadowRoot.getElementById("mapZoomOut")?.addEventListener("click", () => this._zoomMap(-1));
    this.shadowRoot.getElementById("mapZoomIn")?.addEventListener("click", () => this._zoomMap(1));
    this.shadowRoot.getElementById("mapCenter")?.addEventListener("click", () => this._centerMapOnPoint());
    this.shadowRoot.getElementById("stationLocation")?.addEventListener("click", () => this._useNoaaStationLocation());
    this.shadowRoot.getElementById("title")?.addEventListener("change", (event) => this._setValue("title", event.target.value || "BoatWise"));
    this.shadowRoot.getElementById("units")?.addEventListener("change", (event) => this._setValue("units", event.target.value));
    this.shadowRoot.getElementById("windUnits")?.addEventListener("change", (event) => this._setValue("wind_units", this._normalizeWindUnits(event.target.value)));
    this.shadowRoot.getElementById("themeMode")?.addEventListener("change", (event) => this._setValue("theme_mode", this._normalizeThemeMode(event.target.value)));
    this.shadowRoot.getElementById("autoSources")?.addEventListener("change", (event) => this._setValue("auto_sources", event.target.checked));
    this.shadowRoot.getElementById("depthThreshold")?.addEventListener("change", (event) => this._setNumber("depth_threshold", event.target.value));
    this.shadowRoot.getElementById("wharfBuffer")?.addEventListener("change", (event) => this._setNumber("wharf_buffer_minutes", event.target.value));
    this.shadowRoot.getElementById("marineZone")?.addEventListener("change", (event) => this._setValue("marine_zone", String(event.target.value || "").trim().toUpperCase()));
    this.shadowRoot.getElementById("daylightOnly")?.addEventListener("change", (event) => this._setValue("daylight_only", event.target.checked));
    this.shadowRoot.getElementById("dawnOffset")?.addEventListener("change", (event) => this._setNumber("dawn_offset_minutes", event.target.value));
    this.shadowRoot.getElementById("duskOffset")?.addEventListener("change", (event) => this._setNumber("dusk_offset_minutes", event.target.value));
    this.shadowRoot.getElementById("gridRows")?.addEventListener("change", (event) => this._setGridValue("rows", event.target.value));
    this.shadowRoot.getElementById("gridColumns")?.addEventListener("change", (event) => this._setGridValue("columns", event.target.value));
    requestAnimationFrame(() => this._renderForecastMapTiles());
  }

  _escape(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[char]));
  }

}

if (!customElements.get(CARD_TYPES[0])) customElements.define(CARD_TYPES[0], BoatWiseCard);
if (!customElements.get("boatwise-card-editor")) customElements.define("boatwise-card-editor", BoatWiseCardEditor);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "boatwise-card",
  name: "BoatWise",
  description: "Tide-depth boating windows with NWS marine alerts",
  preview: true
});

console.info(
  `%c BOATWISE CARD %c v${CARD_VERSION} `,
  "background:#0d3a5c;color:#7ecbca;font-weight:bold;padding:2px 4px;border-radius:3px 0 0 3px",
  "background:#7ecbca;color:#0d3a5c;font-weight:bold;padding:2px 4px;border-radius:0 3px 3px 0"
);
console.info(`BoatWise v${CARD_VERSION} loaded`);
