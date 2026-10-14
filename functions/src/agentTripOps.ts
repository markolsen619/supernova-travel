/**
 * Turns the model's proposed operations (labels: d1, s4, c2) into checked
 * operations on real ids, dropping anything that doesn't fit the trip.
 * Pure: no firebase-admin. Spec: docs/superpowers/specs/2026-10-14-trip-agent-design.md.
 */
import { ACTIVITY_TYPES, type ActivityType, type AgentOp } from './agentTypes';
import type { LabelMap } from './agentTripContext';

export const MAX_OPERATIONS = 12;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type Raw = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const int = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) ? v : null);

function validDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
function cityIndex(v: unknown, count: number): number | null {
  const m = /^c(\d+)$/.exec(str(v));
  const i = m ? Number(m[1]) - 1 : -1;
  return i >= 0 && i < count ? i : null;
}
function time(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined || v === '') return undefined;
  const t = str(v);
  return TIME_RE.test(t) ? t : undefined;
}

export function validateTripOps(raw: unknown, labels: LabelMap): { ops: AgentOp[]; dropped: number } {
  if (!Array.isArray(raw)) return { ops: [], dropped: 0 };
  const ops: AgentOp[] = [];
  const touched = new Set<string>();
  let dropped = 0;

  const stopRef = (v: unknown) => labels.stops[str(v)] ?? null;
  const take = (stopId: string) => {
    if (touched.has(stopId)) return false;
    touched.add(stopId);
    return true;
  };

  for (const item of raw) {
    if (ops.length >= MAX_OPERATIONS) { dropped += 1; continue; }
    const op = parse(item && typeof item === 'object' ? (item as Raw) : null);
    if (op) ops.push(op); else dropped += 1;
  }
  return { ops, dropped };

  function parse(r: Raw | null): AgentOp | null {
    if (!r) return null;
    switch (str(r.op)) {
      case 'addStop': {
        const dayId = labels.days[str(r.day)];
        const title = str(r.title);
        if (!dayId || title.length < 2 || title.length > 80) return null;
        const t = time(r.time);
        if (r.time !== undefined && r.time !== null && r.time !== '' && t === undefined) return null;
        const after = stopRef(r.after);
        const type = (ACTIVITY_TYPES as readonly string[]).includes(str(r.type)) ? (str(r.type) as ActivityType) : 'activity';
        return { kind: 'trip.addStop', dayId, title, type, afterStopId: after && after.dayId === dayId ? after.stopId : null, time: t ?? null };
      }
      case 'removeStop': {
        const s = stopRef(r.stop);
        if (!s || !take(s.stopId)) return null;
        return { kind: 'trip.removeStop', dayId: s.dayId, stopId: s.stopId };
      }
      case 'moveStop': {
        const s = stopRef(r.stop);
        const toDayId = labels.days[str(r.toDay)];
        if (!s || !toDayId || !take(s.stopId)) return null;
        const after = stopRef(r.after);
        return { kind: 'trip.moveStop', dayId: s.dayId, stopId: s.stopId, toDayId, afterStopId: after && after.dayId === toDayId ? after.stopId : null };
      }
      case 'reorderDay': {
        const dayId = labels.days[str(r.day)];
        if (!dayId || !Array.isArray(r.stops)) return null;
        const ids = r.stops.map((x) => stopRef(x)).map((s) => (s && s.dayId === dayId ? s.stopId : null));
        const current = labels.dayStops[dayId] ?? [];
        if (ids.some((x) => !x) || ids.length !== current.length || new Set(ids).size !== current.length) return null;
        if (current.some((id) => touched.has(id))) return null;
        current.forEach((id) => touched.add(id));
        return { kind: 'trip.reorderDay', dayId, stopIds: ids as string[] };
      }
      case 'updateStop': {
        const s = stopRef(r.stop);
        if (!s) return null;
        const t = time(r.time);
        const badTime = r.time !== undefined && r.time !== null && r.time !== '' && t === undefined;
        const notes = typeof r.note === 'string' ? r.note.trim().slice(0, 300) : undefined;
        if (badTime || (t === undefined && notes === undefined) || !take(s.stopId)) return null;
        return { kind: 'trip.updateStop', dayId: s.dayId, stopId: s.stopId, ...(t !== undefined ? { time: t } : {}), ...(notes !== undefined ? { notes } : {}) };
      }
      case 'setNights': {
        const city = cityIndex(r.city, labels.cityCount);
        const nights = int(r.nights);
        if (city == null || nights == null || nights < 1 || nights > 30) return null;
        return { kind: 'trip.setNights', city, nights };
      }
      case 'addCity': {
        const name = str(r.name);
        const nights = int(r.nights);
        if (name.length < 2 || name.length > 60 || nights == null || nights < 1 || nights > 30) return null;
        return { kind: 'trip.addCity', name, nights, afterCity: cityIndex(r.after, labels.cityCount) };
      }
      case 'removeCity': {
        const city = cityIndex(r.city, labels.cityCount);
        const mode = str(r.mode) === 'move' ? 'move' : 'delete';
        if (city == null || labels.cityCount < 2) return null;
        return { kind: 'trip.removeCity', city, mode };
      }
      case 'moveCity': {
        const city = cityIndex(r.city, labels.cityCount);
        const by = int(r.by);
        if (city == null || (by !== 1 && by !== -1)) return null;
        if (city + by < 0 || city + by >= labels.cityCount) return null;
        return { kind: 'trip.moveCity', city, by };
      }
      case 'shiftDates': {
        const newStart = str(r.newStart);
        return validDate(newStart) ? { kind: 'trip.shiftDates', newStart } : null;
      }
      default:
        return null;
    }
  }
}
