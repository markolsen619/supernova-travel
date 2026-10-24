/**
 * Boarding-pass times in the airport's local time (2026-10-23): passes store the departure as a UTC instant, and a
 * flight is read by the time printed on it — Amsterdam's clock for a flight leaving Amsterdam, wherever the traveler is.
 * Pure; the table is generated (airportZones.ts, scripts/build-airport-zones.mjs).
 */
import { AIRPORT_ZONES } from './airportZones';

let byCode: Map<string, string> | null = null;

export function airportZone(iata: string | null | undefined): string | null {
  const code = (iata ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) return null;
  if (!byCode) {
    byCode = new Map();
    for (const [zone, codes] of Object.entries(AIRPORT_ZONES)) for (let i = 0; i < codes.length; i += 3) byCode.set(codes.slice(i, i + 3), zone);
  }
  return byCode.get(code) ?? null;
}

/** The zone's offset from UTC at that moment, in minutes. */
export function zoneOffsetMinutes(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** "2026-11-18T16:10:00+01:00": the same instant written on the zone's clock, or null for a bad time or zone. */
export function zonedIso(iso: string | null | undefined, zone: string): string | null {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return null;
  let offset: number;
  try { offset = zoneOffsetMinutes(ms, zone); } catch { return null; }
  const local = new Date(ms + offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
