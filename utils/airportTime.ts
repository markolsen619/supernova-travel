/**
 * Boarding-pass times on the airport's clock (2026-10-23). Passes store the departure as a UTC instant; people read
 * a flight by the time printed on it — Amsterdam's clock for a flight leaving Amsterdam, wherever they are. Times
 * typed into the pass form are read the same way. An airport the table doesn't know falls back to the phone's zone
 * (the old behaviour). Mirrors functions/src/airportTime.ts; the table is generated (data/airportZones.ts).
 */
import { AIRPORT_ZONES } from '@/data/airportZones';

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

const pad = (n: number) => String(n).padStart(2, '0');

/** Offset of `zone` from UTC at `ms`, in minutes. */
function offsetMinutes(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const n = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return Math.round((Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** The departure as printed: `{ date: 'YYYY-MM-DD', time: 'HH:MM' }` on the airport's clock. */
export function flightClock(iso: string | null | undefined, airport: string | null | undefined): { date: string; time: string } | null {
  const ms = Date.parse(iso ?? '');
  if (!Number.isFinite(ms)) return null;
  const zone = airportZone(airport);
  if (!zone) {
    const d = new Date(ms);
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  const l = new Date(ms + offsetMinutes(ms, zone) * 60_000);
  return { date: `${l.getUTCFullYear()}-${pad(l.getUTCMonth() + 1)}-${pad(l.getUTCDate())}`, time: `${pad(l.getUTCHours())}:${pad(l.getUTCMinutes())}` };
}

/** A date and time typed from the pass, on the departure airport's clock, as the real instant (ISO, UTC). */
export function flightInstant(date: string, time: string, airport: string | null | undefined): string | null {
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!dm || !tm || Number(tm[1]) > 23 || Number(tm[2]) > 59) return null;
  const [y, mo, d, h, mi] = [Number(dm[1]), Number(dm[2]) - 1, Number(dm[3]), Number(tm[1]), Number(tm[2])];
  const zone = airportZone(airport);
  if (!zone) return new Date(y, mo, d, h, mi).toISOString();
  const wall = Date.UTC(y, mo, d, h, mi);
  // Guess with the offset at the wall time, then correct once for a daylight-saving change in between.
  let ms = wall - offsetMinutes(wall, zone) * 60_000;
  ms = wall - offsetMinutes(ms, zone) * 60_000;
  return new Date(ms).toISOString();
}

/** For the form's pickers (which show the phone's clock): a Date whose local fields are the time printed on the pass. */
export function pickerDateFor(iso: string | null | undefined, airport: string | null | undefined): Date | null {
  const c = flightClock(iso, airport);
  if (!c) return null;
  const [y, mo, d] = c.date.split('-').map(Number);
  const [h, mi] = c.time.split(':').map(Number);
  return new Date(y, mo - 1, d, h, mi);
}

/** What the pickers show, read as that time at the departure airport — the real moment to save. */
export function instantFromPickers(date: Date, time: Date, airport: string | null | undefined): string | null {
  return flightInstant(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, `${pad(time.getHours())}:${pad(time.getMinutes())}`, airport);
}
