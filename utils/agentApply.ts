/**
 * Turns accepted agent operations into steps on the existing trip mutations
 * (docs/superpowers/specs/2026-10-14-trip-agent-design.md, "App: applying a proposal").
 * Pure: re-checks every operation against the trip as it is now.
 */
import type { TripActivity, TripWithDays } from '@/types';
import type { AgentOp } from '@/types/agent';
import { addRow, moveRow, removeRow, setRowNights, type RouteRow } from '@/utils/tripRoute';
import { manualSearchQuery } from '@/utils/groundingQueue';

export type ApplyStep =
  | { do: 'delete'; dayId: string; activity: TripActivity }
  | { do: 'move'; fromDayId: string; toDayId: string; activity: TripActivity; afterStopId: string | null }
  | { do: 'reorder'; dayId: string; before: TripActivity[]; after: TripActivity[] }
  | { do: 'update'; dayId: string; activityId: string; patch: Partial<TripActivity>; before: Partial<TripActivity> }
  | { do: 'add'; dayId: string; activity: Omit<TripActivity, 'id' | 'order' | 'createdAt'>; order: number }
  | { do: 'dates'; newStart: string; previousStart: string | null };

export interface ApplyPlan { steps: ApplyStep[]; routeOps: AgentOp[]; skipped: AgentOp[] }

const STEP = 1000;
const RANK: Record<string, number> = { delete: 0, move: 1, reorder: 1, update: 2, dates: 3, add: 4 };

export function orderAfter(stops: TripActivity[], afterStopId: string | null): number {
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  if (!sorted.length) return STEP;
  const i = afterStopId ? sorted.findIndex((s) => s.id === afterStopId) : -1;
  if (i < 0 || i === sorted.length - 1) return sorted[sorted.length - 1].order + STEP;
  return (sorted[i].order + sorted[i + 1].order) / 2;
}

export function planApply(trip: TripWithDays, ops: AgentOp[]): ApplyPlan {
  const steps: ApplyStep[] = [];
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
        if (a && day(op.toDayId)) steps.push({ do: 'move', fromDayId: op.dayId, toDayId: op.toDayId, activity: a, afterStopId: op.afterStopId });
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
        steps.push({
          do: 'add', dayId: d.id, order: orderAfter(d.activities, op.afterStopId),
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
      case 'trip.shiftDates':
        steps.push({ do: 'dates', newStart: op.newStart, previousStart: (trip as { startDay?: string | null }).startDay ?? null });
        break;
      default:
        routeOps.push(op);
    }
  }
  steps.sort((a, b) => RANK[a.do] - RANK[b.do]);
  return { steps, routeOps, skipped };
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
        if (id) out.unshift({ do: 'move', fromDayId: s.toDayId, toDayId: s.fromDayId, activity: { ...s.activity, id }, afterStopId: null });
        break;
      }
      case 'reorder': out.unshift({ do: 'reorder', dayId: s.dayId, before: s.after, after: s.before }); break;
      case 'update': out.unshift({ do: 'update', dayId: s.dayId, activityId: s.activityId, patch: s.before, before: s.patch }); break;
      case 'dates': if (s.previousStart) out.unshift({ do: 'dates', newStart: s.previousStart, previousStart: s.newStart }); break;
    }
  });
  return out;
}
