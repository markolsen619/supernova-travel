import type { ActivityType, TripWithDays } from '@/types';
import type { AgentOp, AgentQuotaView } from '@/types/agent';
import { parseCalendarDate } from '@/utils/calendarDate';

export interface OpLine { icon: 'add' | 'remove' | 'move' | 'reorder' | 'edit' | 'route' | 'dates'; type: ActivityType | null; text: string }

const cities = (t: TripWithDays) => [t.destination, ...t.additionalDestinations];
const dayOf = (t: TripWithDays, id: string) => t.days.find((d) => d.id === id) ?? null;
const stopOf = (t: TripWithDays, dayId: string, id: string) => dayOf(t, dayId)?.activities.find((a) => a.id === id) ?? null;
const nightsWord = (n: number) => `${n} night${n === 1 ? '' : 's'}`;

export function opLine(op: AgentOp, trip: TripWithDays): OpLine | null {
  switch (op.kind) {
    case 'trip.addStop': {
      const d = dayOf(trip, op.dayId);
      return d ? { icon: 'add', type: op.type, text: `Day ${d.dayNumber} · ${op.title}${op.time ? ` at ${op.time}` : ''}` } : null;
    }
    case 'trip.removeStop': {
      const d = dayOf(trip, op.dayId); const s = stopOf(trip, op.dayId, op.stopId);
      return d && s ? { icon: 'remove', type: s.type, text: `Day ${d.dayNumber} · Remove ${s.title}` } : null;
    }
    case 'trip.moveStop': {
      const s = stopOf(trip, op.dayId, op.stopId); const to = dayOf(trip, op.toDayId);
      return s && to ? { icon: 'move', type: s.type, text: `Move ${s.title} to day ${to.dayNumber}` } : null;
    }
    case 'trip.reorderDay': {
      const d = dayOf(trip, op.dayId);
      return d ? { icon: 'reorder', type: null, text: `Day ${d.dayNumber} · New order` } : null;
    }
    case 'trip.updateStop': {
      const d = dayOf(trip, op.dayId); const s = stopOf(trip, op.dayId, op.stopId);
      if (!d || !s) return null;
      const what = op.time !== undefined ? (op.time ? `${s.title} at ${op.time}` : `${s.title}, no time`) : `Note on ${s.title}`;
      return { icon: 'edit', type: s.type, text: `Day ${d.dayNumber} · ${what}` };
    }
    case 'trip.setNights': {
      const c = cities(trip)[op.city];
      return c ? { icon: 'route', type: null, text: `${c.name} ${c.nights ?? '?'} → ${nightsWord(op.nights)}` } : null;
    }
    case 'trip.addCity': {
      const after = op.afterCity != null ? cities(trip)[op.afterCity] : null;
      return { icon: 'route', type: null, text: `Add ${op.name}, ${nightsWord(op.nights)}${after ? `, after ${after.name}` : ''}` };
    }
    case 'trip.removeCity': {
      const c = cities(trip)[op.city];
      return c ? { icon: 'route', type: null, text: `Remove ${c.name}` } : null;
    }
    case 'trip.moveCity': {
      const c = cities(trip)[op.city];
      return c ? { icon: 'route', type: null, text: `Visit ${c.name} ${op.by < 0 ? 'earlier' : 'later'}` } : null;
    }
    case 'trip.shiftDates': {
      const d = parseCalendarDate(op.newStart);
      if (!d) return null;
      const label = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      return { icon: 'dates', type: null, text: `Start the trip on ${label}` };
    }
  }
}

/** Three requests built from the trip: its busiest day, a food idea, and the route. */
export function agentSuggestions(trip: TripWithDays): string[] {
  const busiest = [...trip.days].sort((a, b) => b.activities.length - a.activities.length || a.dayNumber - b.dayNumber)[0];
  const list = cities(trip);
  const out = [
    busiest ? `Make day ${busiest.dayNumber} less rushed` : 'Plan a relaxed first day',
    `Find a great dinner in ${list[0]?.name ?? 'town'}`,
    list.length > 1 ? `Add a night in ${list[list.length - 1].name}` : `What should we not miss in ${list[0]?.name ?? 'town'}?`,
  ];
  return out;
}

export function quotaLine(q: AgentQuotaView): string | null {
  const left = Math.max(0, q.limit - q.used);
  if (!q.fairUse) return `${left} of ${q.limit} left this month`;
  return left <= 30 ? `${left} left this month` : null;
}

/**
 * The lines a proposal card shows. While open, a change that no longer fits stays (as a note);
 * once applied, a removed stop or a moved one (new id) can't be described from the trip any more,
 * so it's left out instead of being called stale (review 2026-10-15).
 */
export function cardLines(ops: AgentOp[], trip: TripWithDays, done: boolean): { index: number; op: AgentOp; line: OpLine | null }[] {
  const all = ops.map((op, index) => ({ index, op, line: opLine(op, trip) }));
  return done ? all.filter((l) => l.line) : all;
}

/** The id for a send: the failed attempt's id when the same message is retried, so the server can answer it once. */
export function requestIdFor(text: string, lastFailed: { text: string; requestId: string } | null, mint: () => string): string {
  return lastFailed && lastFailed.text.trim() === text.trim() ? lastFailed.requestId : mint();
}
