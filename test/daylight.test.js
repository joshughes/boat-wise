import { test } from "node:test";
import assert from "node:assert/strict";
import { sunriseSunset, clipWindowsToDaylight } from "../boatwise-card.js";

// Plum Island Sound area: lat 42.755, lon -70.806
const IPSWICH = { lat: 42.755, lon: -70.806 };

test("sunriseSunset returns Date objects for Ipswich on 2026-06-15", () => {
  const { sunrise, sunset } = sunriseSunset(new Date("2026-06-15T12:00:00Z"), IPSWICH.lat, IPSWICH.lon);
  assert.ok(sunrise instanceof Date);
  assert.ok(sunset instanceof Date);
  assert.ok(sunrise.getTime() < sunset.getTime());
  // Summer sun in MA: rough sanity — sunrise before 6 AM local (10 AM UTC), sunset after 7 PM local (23:00 UTC)
  assert.ok(sunrise.getUTCHours() >= 8 && sunrise.getUTCHours() <= 10, `sunrise UTC hour ${sunrise.getUTCHours()}`);
  assert.ok(sunset.getUTCHours() >= 23 || sunset.getUTCHours() <= 1, `sunset UTC hour ${sunset.getUTCHours()}`);
});

test("sunriseSunset on winter solstice has shorter day than summer solstice", () => {
  const dec = sunriseSunset(new Date("2026-12-21T12:00:00Z"), IPSWICH.lat, IPSWICH.lon);
  const jun = sunriseSunset(new Date("2026-06-21T12:00:00Z"), IPSWICH.lat, IPSWICH.lon);
  const decDayMs = dec.sunset - dec.sunrise;
  const junDayMs = jun.sunset - jun.sunrise;
  assert.ok(junDayMs > decDayMs);
});

const win = (startIso, endIso) => ({
  start: new Date(startIso),
  end: new Date(endIso),
  duration_minutes: (new Date(endIso) - new Date(startIso)) / 60000,
  tide_direction_at_start: "rising",
  tide_direction_at_end: "falling"
});

test("clipWindowsToDaylight returns unchanged when daylight_only false", () => {
  const windows = [win("2026-06-15T22:00:00Z", "2026-06-16T02:00:00Z")];
  const out = clipWindowsToDaylight(windows, { daylightOnly: false, lat: 42.755, lon: -70.806 });
  assert.deepEqual(out, windows);
});

test("clipWindowsToDaylight drops fully-night windows", () => {
  // 11pm local to 3am local on June 15 in Ipswich = fully dark
  const windows = [win("2026-06-16T03:00:00Z", "2026-06-16T07:00:00Z")];
  const out = clipWindowsToDaylight(windows, { daylightOnly: true, lat: 42.755, lon: -70.806 });
  // 03:00 UTC = 11 PM local, 07:00 UTC = 3 AM local — both before sunrise. Should be empty.
  assert.equal(out.length, 0);
});

test("clipWindowsToDaylight clips window end at sunset", () => {
  // Window spans daytime into night
  const windows = [win("2026-06-15T14:00:00Z", "2026-06-16T05:00:00Z")];
  const out = clipWindowsToDaylight(windows, { daylightOnly: true, lat: 42.755, lon: -70.806 });
  assert.ok(out.length >= 1);
  // The clipped end should be approximately the sunset, well before 5 AM next day
  const { sunset } = sunriseSunset(new Date("2026-06-15T18:00:00Z"), 42.755, -70.806);
  assert.ok(Math.abs(out[0].end.getTime() - sunset.getTime()) < 60000);
});

test("clipWindowsToDaylight clips window start at sunrise", () => {
  // Window starts pre-dawn, ends mid-morning
  const windows = [win("2026-06-15T05:00:00Z", "2026-06-15T15:00:00Z")];
  const out = clipWindowsToDaylight(windows, { daylightOnly: true, lat: 42.755, lon: -70.806 });
  assert.ok(out.length >= 1);
  const { sunrise } = sunriseSunset(new Date("2026-06-15T12:00:00Z"), 42.755, -70.806);
  assert.ok(Math.abs(out[0].start.getTime() - sunrise.getTime()) < 60000);
});

test("clipWindowsToDaylight splits a window straddling night into multiple cards", () => {
  // Window from morning today through tomorrow afternoon — should produce 2 daylight chunks
  const windows = [win("2026-06-15T14:00:00Z", "2026-06-16T20:00:00Z")];
  const out = clipWindowsToDaylight(windows, { daylightOnly: true, lat: 42.755, lon: -70.806 });
  assert.equal(out.length, 2);
});

test("dawn/dusk offset minutes shift clipping boundaries", () => {
  const windows = [win("2026-06-15T05:00:00Z", "2026-06-16T05:00:00Z")];
  // Push dawn 60 min later (more restrictive), dusk 60 min earlier (more restrictive)
  const out = clipWindowsToDaylight(windows, {
    daylightOnly: true,
    lat: 42.755,
    lon: -70.806,
    dawnOffsetMinutes: 60,
    duskOffsetMinutes: -60
  });
  assert.ok(out.length >= 1);
  const { sunrise, sunset } = sunriseSunset(new Date("2026-06-15T12:00:00Z"), 42.755, -70.806);
  // Clipped start should be sunrise + 60 min
  assert.ok(Math.abs(out[0].start.getTime() - (sunrise.getTime() + 60 * 60000)) < 60000);
  // Clipped end should be sunset - 60 min
  assert.ok(Math.abs(out[0].end.getTime() - (sunset.getTime() - 60 * 60000)) < 60000);
});

test("clipWindowsToDaylight drops chunks shorter than 15 min", () => {
  // A 5-minute pre-dawn sliver should be discarded
  const { sunrise } = sunriseSunset(new Date("2026-06-15T12:00:00Z"), 42.755, -70.806);
  const sliverEnd = new Date(sunrise.getTime() + 5 * 60000);
  const windows = [win(new Date(sunrise.getTime() - 60 * 60000).toISOString(), sliverEnd.toISOString())];
  const out = clipWindowsToDaylight(windows, { daylightOnly: true, lat: 42.755, lon: -70.806, minDurationMinutes: 15 });
  assert.equal(out.length, 0);
});
