/**
 * Turns accepted agent operations into steps on the existing trip mutations
 * (docs/superpowers/specs/2026-10-14-trip-agent-design.md, "App: applying a proposal").
 * Pure: re-checks every operation against the trip as it is now.
 */
import type { TripActivity, TripWithDays } from '@/types';
import type { AgentOp } from '@/types/agent';
import { addRow, moveRow, removeRow, setRowNights, type RouteRow } from '@/utils/tripRoute';
import { manualSearchQuery } from '@/utils/groundingQueue';
import { toCalendarDate } from '@/utils/calendarDate';

export type ApplyStep =
  | { do: 'delete'; dayId: string; activity: TripActivity }
  | { do: 'move'; fromDayId: string; toDayId: string; activity: TripActivity; afterStopId: string | null; order: number }
  | { do: 'reorder'; dayId: string; before: TripActivity[]; after: TripActivity[] }
  | { do: 'update'; dayId: string; activityId: string; patch: Partial<TripActivity>; before: Partial<TripActivity> }
  | { do: 'add'; dayId: string; activity: Omit<TripActivity, 'id' | 'order' | 'createdAt'>; order: number }
  | { do: 'dates'; newStart: string; newEnd: string | null; previousStart: string | null; previousEnd: string | null };

export interface ApplyPlan { steps: ApplyStep[]; routeOps: AgentOp[]; skipped: AgentOp[] }

const STEP = 1000;
const RANK: Record<string, number> = { delete: 0, move: 1, reorder: 1, update: 2, dates: 3, add: 4 };

export function orderAfter(stops: { id: string; order: number }[], afterStopId: string | null): number {
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  if (!sorted.length) return STEP;
  const i = afterStopId ? sorted.findIndex((s) => s.id === afterStopId) : -1;
  if (i < 0 || i === sorted.length - 1) return sorted[sorted.length - 1].order + STEP;
  return (sorted[i].order + sorted[i + 1].order) / 2;
}

export function planApply(trip: TripWithDays, ops: AgentOp[]): ApplyPlan {
  const steps: ApplyStep[] = [];
  const addAfter = new Map<number, string | null>();
  const routeOps: AgentOp[] = [];
  const skipped: AgentOp[] = [];
  const day = (id: string) => trip.days.find((d) => d.id === id) ?? null;
  const cityName = (dayId: string) => {
    const d = day(dayId);
    const list = [trip.destination, ...trip.additionalDestinations];
    return list[d?.destinationIndex ?? 0]?.name ?? list[0]?.name ?? null;
  };

  for (const op of ops) {
    switch (op.kind) {
      case 'trip.removeStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (a) steps.push({ do: 'delete', dayId: op.dayId, activity: a }); else skipped.push(op);
        break;
      }
      case 'trip.moveStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (a && day(op.toDayId)) steps.push({ do: 'move', fromDayId: op.dayId, toDayId: op.toDayId, activity: a, afterStopId: op.afterStopId, order: 0 });
        else skipped.push(op);
        break;
      }
      case 'trip.reorderDay': {
        const d = day(op.dayId);
        const current = [...(d?.activities ?? [])].sort((a, b) => a.order - b.order);
        const ids = new Set(current.map((a) => a.id));
        if (!d || op.stopIds.length !== current.length || !op.stopIds.every((id) => ids.has(id))) { skipped.push(op); break; }
        steps.push({ do: 'reorder', dayId: d.id, before: current, after: op.stopIds.map((id) => current.find((a) => a.id === id)!) });
        break;
      }
      case 'trip.updateStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (!a) { skipped.push(op); break; }
        const patch: Partial<TripActivity> = {};
        const before: Partial<TripActivity> = {};
        if (op.time !== undefined) { patch.startTime = op.time; before.startTime = a.startTime; }
        if (op.notes !== undefined) { patch.notes = op.notes; before.notes = a.notes; }
        steps.push({ do: 'update', dayId: op.dayId, activityId: a.id, patch, before });
        break;
      }
      case 'trip.addStop': {
        const d = day(op.dayId);
        if (!d) { skipped.push(op); break; }
        addAfter.set(steps.length, op.afterStopId);
        steps.push({
          do: 'add', dayId: d.id, order: 0,
          activity: {
            type: op.type, title: op.title, placeId: null, address: null, lat: null, lng: null,
            startTime: op.time, endTime: null, durationMinutes: null, notes: '', bookingRef: null,
            cost: null, currency: null, mediaUrls: [],
            searchQuery: manualSearchQuery(op.type, op.title, cityName(d.id)),
            visited: false, visitedAt: null, groundingFailedAt: null,
          },
        });
        break;
      }
      case 'trip.shiftDates': {
        const previousStart = tripStart(trip);
        const previousEnd = trip.endDate ? toCalendarDate(trip.endDate.toDate()) : null;
        const newEnd = previousStart && previousEnd ? addDays(previousEnd, daysBetween(previousStart, op.newStart)) : null;
        steps.push({ do: 'dates', newStart: op.newStart, newEnd, previousStart, previousEnd });
        break;
      }
      default:
        routeOps.push(op);
    }
  }
  const ranked = steps.map((step, i) => ({ step, after: addAfter.get(i) ?? null })).sort((a, b) => RANK[a.step.do] - RANK[b.step.do]);
  placeInOrder(trip, ranked);
  return { steps: ranked.map((r) => r.step), routeOps, skipped };
}

/**
 * Positions for new and moved stops, worked out in the order the steps run (review 2026-10-15): each
 * day keeps a running list, a reorder renumbers it the way reorderActivities writes (idx * 1000), and
 * stops proposed after the same stop follow one another instead of sharing a position.
 */
function placeInOrder(trip: TripWithDays, ranked: { step: ApplyStep; after: string | null }[]): void {
  const lists = new Map<string, { id: string; order: number }[]>();
  const list = (dayId: string) => {
    if (!lists.has(dayId)) {
      const d = trip.days.find((x) => x.id === dayId);
      lists.set(dayId, [...(d?.activities ?? [])].map((a) => ({ id: a.id, order: a.order })).sort((a, b) => a.order - b.order));
    }
    return lists.get(dayId)!;
  };
  const chain = new Map<string, string>(); // `${dayId}|${after}` -> the stop most recently placed there
  const place = (dayId: string, after: string | null, id: string): number => {
    const key = `${dayId}|${after ?? 'END'}`;
    const effective = chain.get(key) ?? after;
    const l = list(dayId);
    const order = orderAfter(l, effective);
    l.push({ id, order });
    l.sort((a, b) => a.order - b.order);
    chain.set(key, id);
    return order;
  };
  ranked.forEach(({ step, after }, i) => {
    switch (step.do) {
      case 'delete': lists.set(step.dayId, list(step.dayId).filter((x) => x.id !== step.activity.id)); break;
      case 'reorder': lists.set(step.dayId, step.after.map((a, idx) => ({ id: a.id, order: idx * 1000 }))); break;
      case 'move': {
        lists.set(step.fromDayId, list(step.fromDayId).filter((x) => x.id !== step.activity.id));
        step.order = place(step.toDayId, step.afterStopId, step.activity.id);
        break;
      }
      case 'add': step.order = place(step.dayId, after, `new-${i}`); break;
      default: break;
    }
  });
}

const DAY_MS = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
function addDays(day: string, n: number): string { return new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10); }
function daysBetween(a: string, b: string): number { return Math.round((utc(b) - utc(a)) / DAY_MS); }
function tripStart(trip: TripWithDays): string | null {
  const saved = (trip as { startDay?: string | null }).startDay;
  if (typeof saved === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(saved)) return saved;
  return trip.startDate ? toCalendarDate(trip.startDate.toDate()) : null;
}

/** Route operations refer to cities by their index when proposed; rows keep it in `from`. */
export function applyRouteOps<T>(rows: RouteRow<T>[], ops: AgentOp[], newPlace: (name: string) => T | null): { rows: RouteRow<T>[]; skipped: AgentOp[] } {
  let out = rows;
  const skipped: AgentOp[] = [];
  const at = (city: number) => out.findIndex((r) => r.from === city);
  let n = 0;
  for (const op of ops) {
    switch (op.kind) {
      case 'trip.setNights': { const i = at(op.city); if (i < 0) skipped.push(op); else out = setRowNights(out, i, op.nights); break; }
      case 'trip.moveCity': { const i = at(op.city); if (i < 0) skipped.push(op); else out = moveRow(out, i, op.by); break; }
      case 'trip.removeCity': { const i = at(op.city); if (i < 0 || out.length < 2) skipped.push(op); else out = removeRow(out, i, op.mode); break; }
      case 'trip.addCity': {
        // Append, then step into place with moveRow — the editor's own helpers, which keep the
        // last city's departure-day night right (relast) at every step.
        const place = newPlace(op.name);
        if (place == null) { skipped.push(op); break; }
        out = addRow(out, place, `agent-${n++}`);
        let i = out.length - 1;
        const after = op.afterCity != null ? out.findIndex((r) => r.from === op.afterCity) : -1;
        while (after >= 0 && i > after + 1) { out = moveRow(out, i, -1); i -= 1; }
        out = setRowNights(out, i, op.nights);
        break;
      }
      default: skipped.push(op);
    }
  }
  return { rows: out, skipped };
}

/** The steps that put things back, newest first. `addedIds[i]` is the id created by step i (an 'add' or a 'move'). */
export function undoSteps(steps: ApplyStep[], addedIds: Record<number, string>): ApplyStep[] {
  const out: ApplyStep[] = [];
  steps.forEach((s, i) => {
    switch (s.do) {
      case 'add': {
        const id = addedIds[i];
        if (id) out.unshift({ do: 'delete', dayId: s.dayId, activity: { ...(s.activity as TripActivity), id, order: s.order } });
        break;
      }
      case 'delete': {
        const { id: _id, order, createdAt: _c, ...rest } = s.activity;
        out.unshift({ do: 'add', dayId: s.dayId, activity: rest, order });
        break;
      }
      case 'move': {
        const id = addedIds[i];
        if (id) out.unshift({ do: 'move', fromDayId: s.toDayId, toDayId: s.fromDayId, activity: { ...s.activity, id }, afterStopId: null, order: s.activity.order });
        break;
      }
      case 'reorder': out.unshift({ do: 'reorder', dayId: s.dayId, before: s.after, after: s.before }); break;
      case 'update': out.unshift({ do: 'update', dayId: s.dayId, activityId: s.activityId, patch: s.before, before: s.patch }); break;
      case 'dates': if (s.previousStart) out.unshift({ do: 'dates', newStart: s.previousStart, newEnd: s.previousEnd, previousStart: s.newStart, previousEnd: s.newEnd }); break;
    }
  });
  return out;
}
