/**
 * The model's proposed wallet operations (labels b1…) checked into operations on the caller's
 * own bookings (docs/superpowers/specs/2026-10-16-nova-phase2-design.md §5). Pure: no firebase-admin.
 * A label exists only for the caller's own bookings, so another person's booking can never be named.
 */
import { WALLET_RES_TYPES, type AgentOp, type WalletResType } from './agentTypes';
import type { LabelMap } from './agentTripContext';

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
export const WALLET_OPS = new Set(['addReservation', 'linkBooking', 'unlinkBooking', 'updateBooking']);

export function validateWalletOps(
  raw: unknown, labels: LabelMap, trip: { startDay: string | null; endDay: string | null },
): { ops: AgentOp[]; dropped: number } {
  if (!Array.isArray(raw)) return { ops: [], dropped: 0 };
  const ops: AgentOp[] = [];
  let dropped = 0;
  const inTrip = (d: string) => {
    if (!trip.startDay) return true;
    const end = trip.endDay ?? trip.startDay;
    return d >= shift(trip.startDay, -1) && d <= shift(end, 1);
  };
  for (const item of raw) {
    const op = parse(item && typeof item === 'object' ? (item as Raw) : null);
    if (op) ops.push(op); else dropped += 1;
  }
  return { ops, dropped };

  function parse(r: Raw | null): AgentOp | null {
    if (!r) return null;
    switch (str(r.op)) {
      case 'addReservation': {
        const type = str(r.type) as WalletResType;
        if (!(WALLET_RES_TYPES as readonly string[]).includes(type)) return null;
        const title = str(r.title);
        const date = str(r.date);
        if (title.length < 2 || title.length > 120 || !validDate(date) || !inTrip(date)) return null;
        const rawTime = str(r.time);
        if (rawTime && !TIME_RE.test(rawTime)) return null;
        const endRaw = str(r.endDate);
        if (endRaw && (!validDate(endRaw) || endRaw < date)) return null;
        const code = str(r.confirmationCode);
        if (code.length > 40) return null;
        const mode = str(r.transitMode);
        if (type === 'transit' && mode !== 'train' && mode !== 'bus' && mode !== 'ferry') return null;
        return {
          kind: 'wallet.addReservation', type, ...(type === 'transit' ? { transitMode: mode as 'train' | 'bus' | 'ferry' } : {}),
          title, date, time: rawTime || null, endDate: endRaw || null, confirmationCode: code || null,
        };
      }
      case 'linkBooking': {
        const b = labels.bookings?.[str(r.booking)];
        if (!b || b.linked) return null;
        return { kind: 'wallet.linkBooking', bookingKind: b.kind, bookingId: b.id };
      }
      case 'unlinkBooking': {
        const b = labels.bookings?.[str(r.booking)];
        if (!b || !b.linked) return null;
        return { kind: 'wallet.unlinkBooking', bookingKind: b.kind, bookingId: b.id };
      }
      case 'updateBooking': {
        const b = labels.bookings?.[str(r.booking)];
        // Boarding passes are link/unlink only: their times come from the airline and the status poller.
        if (!b || b.kind !== 'reservation') return null;
        const out: { kind: 'wallet.updateBooking'; bookingKind: 'reservation'; bookingId: string; title?: string; date?: string; time?: string | null; confirmationCode?: string } =
          { kind: 'wallet.updateBooking', bookingKind: 'reservation', bookingId: b.id };
        const title = str(r.title);
        if (title) { if (title.length < 2 || title.length > 120) return null; out.title = title; }
        const date = str(r.date);
        if (date) { if (!validDate(date) || !inTrip(date)) return null; out.date = date; }
        if (r.time !== undefined) {
          const t = str(r.time);
          if (r.time === null) out.time = null;
          else if (t) { if (!TIME_RE.test(t)) return null; out.time = t; }
        }
        const code = str(r.confirmationCode);
        if (code) { if (code.length > 40) return null; out.confirmationCode = code; }
        return out.title || out.date || out.time !== undefined || out.confirmationCode ? out : null;
      }
      default:
        return null;
    }
  }
}
