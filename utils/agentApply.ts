/**
 * Turns accepted agent operations into steps on the existing trip mutations
 * (docs/superpowers/specs/2026-10-14-trip-agent-design.md, "App: applying a proposal").
 * Pure: re-checks every operation against the trip as it is now.
 */
import type { PackingItem, Reservation, TripActivity, TripVisibility, TripWithDays } from '@/types';
import { bookingPatch, reservationFromOp } from '@/utils/agentWallet';
import type { AgentOp } from '@/types/agent';
import { addRow, moveRow, removeRow, setRowNights, type RouteRow } from '@/utils/tripRoute';
import { manualSearchQuery } from '@/utils/groundingQueue';
import { toCalendarDate } from '@/utils/calendarDate';
import { bestInsertion, insertionCostKm, optimizeDay, type PlaceStop } from '@/utils/routePlacement';
import type { NovaGround } from '@/utils/agentGround';

export type ApplyStep =
  | { do: 'delete'; dayId: string; activity: TripActivity }
  | { do: 'move'; fromDayId: string; toDayId: string; activity: TripActivity; afterStopId: string | null; order: number; keepOrder?: boolean }
  | { do: 'reorder'; dayId: string; before: TripActivity[]; after: TripActivity[] }
  | { do: 'update'; dayId: string; activityId: string; patch: Partial<TripActivity>; before: Partial<TripActivity> }
  | { do: 'add'; dayId: string; activity: Omit<TripActivity, 'id' | 'order' | 'createdAt'>; order: number }
  | { do: 'dates'; newStart: string; newEnd: string | null; previousStart: string | null; previousEnd: string | null }
  | { do: 'trip'; patch: TripPatch; before: TripPatch }
  | { do: 'packAdd'; label: string; category: string }
  | { do: 'packCheck'; itemId: string; checked: boolean }
  | { do: 'packRemove'; itemId: string; label: string; category: string }
  | { do: 'walletAdd'; doc: Omit<Reservation, 'id'> }
  | { do: 'walletLink'; kind: 'boarding_pass' | 'reservation'; id: string; tripId: string }
  | { do: 'walletUnlink'; kind: 'boarding_pass' | 'reservation'; id: string }
  | { do: 'walletUpdate'; id: string; patch: Record<string, unknown> };

type TripPatch = { title?: string; description?: string; visibility?: TripVisibility };
/** What applying needs beyond the trip: its packing list, and whether the account is private (no Public trips). */
export interface ApplyCtx { packing?: PackingItem[]; accountPrivate?: boolean; paid?: boolean; uid?: string; nowIso?: string }

/** `placedNote[opIndex]` = where a new stop went when code chose its spot ("after The Taco Stand"). */
export interface ApplyPlan { steps: ApplyStep[]; routeOps: AgentOp[]; skipped: AgentOp[]; placedNote: Record<number, string>; needsPro?: boolean }

/** How far a named spot may backtrack before code's best spot wins (phase 2 spec §3). */
const NAMED_SLACK_KM = 2;

const STEP = 1000;
const RANK: Record<string, number> = { delete: 0, move: 1, reorder: 1, update: 2, dates: 3, trip: 3, add: 4, packAdd: 5, packCheck: 5, packRemove: 5, walletAdd: 6, walletLink: 6, walletUnlink: 6, walletUpdate: 6 };

export function orderAfter(stops: { id: string; order: number }[], afterStopId: string | null): number {
  const sorted = [...stops].sort((a, b) => a.order - b.order);
  if (!sorted.length) return STEP;
  const i = afterStopId ? sorted.findIndex((s) => s.id === afterStopId) : -1;
  if (i < 0 || i === sorted.length - 1) return sorted[sorted.length - 1].order + STEP;
  return (sorted[i].order + sorted[i + 1].order) / 2;
}

export function planApply(trip: TripWithDays, ops: AgentOp[], grounded: Record<number, NovaGround> = {}, ctx: ApplyCtx = {}): ApplyPlan {
  const steps: ApplyStep[] = [];
  const addAfter = new Map<number, string | null>();
  const addOp = new Map<number, number>();
  let needsPro = false;
  const routeOps: AgentOp[] = [];
  const skipped: AgentOp[] = [];
  const day = (id: string) => trip.days.find((d) => d.id === id) ?? null;
  const cityName = (dayId: string) => {
    const d = day(dayId);
    const list = [trip.destination, ...trip.additionalDestinations];
    return list[d?.destinationIndex ?? 0]?.name ?? list[0]?.name ?? null;
  };

  ops.forEach((op, opIndex) => {
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
        const g = grounded[opIndex];
        // A place grounding couldn't find near the day's city is never added (the Pennant Bar case).
        if (g?.status === 'notFound') { skipped.push(op); break; }
        const place = g?.status === 'found' ? g.place : null;
        addAfter.set(steps.length, op.afterStopId);
        addOp.set(steps.length, opIndex);
        steps.push({
          do: 'add', dayId: d.id, order: 0,
          activity: {
            type: op.type, title: op.title, placeId: place ? (place.placeId ?? '') : null, address: place?.address ?? null,
            lat: place?.lat ?? null, lng: place?.lng ?? null, ...(place?.isVenue ? { placeName: place.name } : {}),
            startTime: op.time, endTime: null, durationMinutes: null, notes: '', bookingRef: null,
            cost: null, currency: null, mediaUrls: [],
            searchQuery: op.query ?? manualSearchQuery(op.type, op.title, cityName(d.id)),
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
      case 'trip.editStop': {
        const a = day(op.dayId)?.activities.find((x) => x.id === op.stopId);
        if (!a) { skipped.push(op); break; }
        const g = grounded[opIndex];
        if (op.query && g?.status === 'notFound') { skipped.push(op); break; }
        const place = op.query && g?.status === 'found' ? g.place : null;
        const patch: Partial<TripActivity> = {};
        const before: Partial<TripActivity> = {};
        const set = <K extends keyof TripActivity>(k: K, v: TripActivity[K]) => { patch[k] = v; before[k] = a[k]; };
        if (op.title !== undefined) { set('title', op.title); set('titleSource', 'user' as TripActivity['titleSource']); }
        if (op.type !== undefined) set('type', op.type);
        if (op.time !== undefined) set('startTime', op.time);
        if (op.endTime !== undefined) set('endTime', op.endTime);
        if (op.durationMinutes !== undefined) set('durationMinutes', op.durationMinutes);
        if (op.notes !== undefined) set('notes', op.notes);
        if (place) {
          set('placeId', place.placeId ?? ''); set('address', place.address); set('lat', place.lat); set('lng', place.lng);
          if (place.isVenue) set('placeName' as keyof TripActivity, place.name as never);
          set('searchQuery' as keyof TripActivity, op.query as never);
          set('groundingFailedAt', null as TripActivity['groundingFailedAt']);
        }
        if (!Object.keys(patch).length) { skipped.push(op); break; }
        steps.push({ do: 'update', dayId: op.dayId, activityId: a.id, patch, before });
        break;
      }
      case 'trip.optimizeDay': {
        const d = day(op.dayId);
        if (!d) { skipped.push(op); break; }
        const current = [...d.activities].sort((x, y) => x.order - y.order);
        const asStop = (x: TripActivity): PlaceStop => ({ id: x.id, lat: x.lat ?? null, lng: x.lng ?? null, type: x.type, title: x.title, startTime: x.startTime ?? null, fixed: !!(x as { fromBooking?: unknown }).fromBooking });
        const order = optimizeDay(current.map(asStop)).map((p) => current.find((x) => x.id === p.id)!);
        // Already the shortest: nothing to change.
        if (order.every((x, i) => x.id === current[i].id)) { skipped.push(op); break; }
        steps.push({ do: 'reorder', dayId: d.id, before: current, after: order });
        break;
      }
      case 'trip.swapDays': {
        const a = day(op.dayId);
        const b = day(op.withDayId);
        if (!a || !b) { skipped.push(op); break; }
        for (const x of a.activities) steps.push({ do: 'move', fromDayId: a.id, toDayId: b.id, activity: x, afterStopId: null, order: x.order, keepOrder: true });
        for (const x of b.activities) steps.push({ do: 'move', fromDayId: b.id, toDayId: a.id, activity: x, afterStopId: null, order: x.order, keepOrder: true });
        break;
      }
      case 'trip.updateTrip': {
        if (op.visibility === 'public' && ctx.accountPrivate) { skipped.push(op); break; }
        const patch: TripPatch = {};
        const before: TripPatch = {};
        const t = trip as TripWithDays & { description?: string };
        if (op.title !== undefined) { patch.title = op.title; before.title = t.title; }
        if (op.description !== undefined) { patch.description = op.description; before.description = t.description ?? ''; }
        if (op.visibility !== undefined) { patch.visibility = op.visibility; before.visibility = t.visibility; }
        steps.push({ do: 'trip', patch, before });
        break;
      }
      case 'trip.addPacking': steps.push({ do: 'packAdd', label: op.label, category: op.category }); break;
      case 'trip.checkPacking': {
        if (ctx.packing && !ctx.packing.some((p) => p.id === op.itemId)) { skipped.push(op); break; }
        steps.push({ do: 'packCheck', itemId: op.itemId, checked: op.checked });
        break;
      }
      case 'trip.removePacking': {
        const item = ctx.packing?.find((p) => p.id === op.itemId);
        if (ctx.packing && !item) { skipped.push(op); break; }
        steps.push({ do: 'packRemove', itemId: op.itemId, label: item?.label ?? '', category: item?.category ?? 'Essentials' });
        break;
      }
      case 'wallet.addReservation': {
        if (!ctx.uid) { skipped.push(op); break; }
        steps.push({ do: 'walletAdd', doc: reservationFromOp(op, { uid: ctx.uid, tripId: trip.id, paid: !!ctx.paid, nowIso: ctx.nowIso ?? new Date().toISOString() }) });
        break;
      }
      case 'wallet.linkBooking': {
        // Linking is Pro (rules: walletLinkWriteAllowed): free accounts get the paywall instead of a refused write.
        if (!ctx.paid) { skipped.push(op); needsPro = true; break; }
        steps.push({ do: 'walletLink', kind: op.bookingKind, id: op.bookingId, tripId: trip.id });
        break;
      }
      case 'wallet.unlinkBooking': steps.push({ do: 'walletUnlink', kind: op.bookingKind, id: op.bookingId }); break;
      case 'wallet.updateBooking': {
        const patch = bookingPatch(op);
        if (!Object.keys(patch).length) { skipped.push(op); break; }
        steps.push({ do: 'walletUpdate', id: op.bookingId, patch });
        break;
      }
      default:
        routeOps.push(op);
    }
  });
  const ranked = steps.map((step, i) => ({ step, after: addAfter.get(i) ?? null, opIndex: addOp.get(i) ?? null })).sort((a, b) => RANK[a.step.do] - RANK[b.step.do]);
  const placedNote: Record<number, string> = {};
  placeInOrder(trip, ranked, placedNote);
  return { steps: ranked.map((r) => r.step), routeOps, skipped, placedNote, ...(needsPro ? { needsPro } : {}) };
}

type Placed = PlaceStop & { order: number };
const asPlaced = (a: { id: string; order: number; lat?: number | null; lng?: number | null; type: string; title: string; startTime?: string | null }): Placed =>
  ({ id: a.id, order: a.order, lat: a.lat ?? null, lng: a.lng ?? null, type: a.type, title: a.title, startTime: a.startTime ?? null });

/** The order value for a stop going in at `idx` of a sorted list. */
function orderAt(list: { order: number }[], idx: number): number {
  if (!list.length) return STEP;
  if (idx <= 0) return list[0].order / 2;
  if (idx >= list.length) return list[list.length - 1].order + STEP;
  return (list[idx - 1].order + list[idx].order) / 2;
}

/**
 * Positions for new and moved stops, worked out in the order the steps run (review 2026-10-15): each
 * day keeps a running list, a reorder renumbers it the way reorderActivities writes (idx * 1000), and
 * stops proposed after the same stop follow one another instead of sharing a position.
 */
function placeInOrder(trip: TripWithDays, ranked: { step: ApplyStep; after: string | null; opIndex: number | null }[], placedNote: Record<number, string>): void {
  const lists = new Map<string, Placed[]>();
  const list = (dayId: string) => {
    if (!lists.has(dayId)) {
      const d = trip.days.find((x) => x.id === dayId);
      lists.set(dayId, [...(d?.activities ?? [])].map(asPlaced).sort((a, b) => a.order - b.order));
    }
    return lists.get(dayId)!;
  };
  const chain = new Map<string, string>(); // `${dayId}|${after}` -> the stop most recently placed there
  const place = (dayId: string, after: string | null, stop: Placed): number => {
    const key = `${dayId}|${after ?? 'END'}`;
    const effective = chain.get(key) ?? after;
    const l = list(dayId);
    const order = orderAfter(l, effective);
    const id = stop.id;
    l.push({ ...stop, order });
    l.sort((a, b) => a.order - b.order);
    chain.set(key, id);
    return order;
  };
  ranked.forEach(({ step, after, opIndex }, i) => {
    switch (step.do) {
      case 'delete': lists.set(step.dayId, list(step.dayId).filter((x) => x.id !== step.activity.id)); break;
      case 'reorder': lists.set(step.dayId, step.after.map((a, idx) => ({ ...asPlaced(a), order: idx * 1000 }))); break;
      case 'move': {
        lists.set(step.fromDayId, list(step.fromDayId).filter((x) => x.id !== step.activity.id));
        // A swapped day keeps its own order; other moves are placed on the target day.
        if (step.keepOrder) { list(step.toDayId).push(asPlaced(step.activity)); break; }
        step.order = place(step.toDayId, step.afterStopId, asPlaced(step.activity));
        break;
      }
      case 'add': {
        const stop = asPlaced({ id: `new-${i}`, order: 0, lat: step.activity.lat, lng: step.activity.lng, type: step.activity.type, title: step.activity.title, startTime: step.activity.startTime });
        if (stop.lat == null || stop.lng == null) { step.order = place(step.dayId, after, stop); break; }
        // A grounded stop goes where it adds the least travel; a named spot wins unless it backtracks > 2 km.
        const l = list(step.dayId);
        const best = bestInsertion(l, stop);
        const named = after ? l.findIndex((x) => x.id === after) + 1 : 0;
        const useNamed = named > 0 && insertionCostKm(l, stop, named) - insertionCostKm(l, stop, best) <= NAMED_SLACK_KM;
        const idx = useNamed ? named : best;
        step.order = orderAt(l, idx);
        if (!useNamed && idx > 0 && opIndex != null) placedNote[opIndex] = `after ${l[idx - 1].title}`;
        l.splice(idx, 0, { ...stop, order: step.order });
        break;
      }
      default: break;
    }
  });
}

const DAY_MS = 86_400_000;
const utc = (day: string) => Date.parse(`${day}T00:00:00Z`);
function addDays(day: string, n: number): string { return new Date(utc(day) + n * DAY_MS).toISOString().slice(0, 10); }
function daysBetween(a: string, b: string): number { return Math.round((utc(b) - utc(a)) / DAY_MS); }
/** The trip's first calendar day (saved startDay first, else startDate). */
export function tripStart(trip: TripWithDays): string | null {
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
      case 'trip': out.unshift({ do: 'trip', patch: s.before, before: s.patch }); break;
      case 'packAdd': { const id = addedIds[i]; if (id) out.unshift({ do: 'packRemove', itemId: id, label: s.label, category: s.category }); break; }
      case 'packCheck': out.unshift({ do: 'packCheck', itemId: s.itemId, checked: !s.checked }); break;
      case 'packRemove': out.unshift({ do: 'packAdd', label: s.label, category: s.category }); break;
    }
  });
  return out;
}
