/**
 * A new AI trip's days, ordered once for the least travel after its stops are placed (owner, 2026-10-30): the AI
 * picks the places, but only the phone knows where they are, so it sent people back and forth across town. The same
 * free ordering Nova's "reorder day" uses (utils/routePlacement optimizeDay: hotels at the ends, meals in order,
 * booked stops fixed). Once per trip (`daysTidied`), only for a fresh AI trip, never after the person arranged it.
 */
import { optimizeDay, type PlaceStop } from '@/utils/routePlacement';

const FRESH_MS = 48 * 3_600_000;

interface TidyStop {
  id: string; order: number; lat?: number | null; lng?: number | null; type: string; title: string;
  startTime?: string | null; searchQuery?: string | null; groundingFailedAt?: unknown; fromBooking?: unknown;
}
export interface TidyTrip {
  isAiGenerated?: boolean; daysTidied?: boolean; createdAt?: { toMillis(): number } | null;
  days: { id: string; activities: TidyStop[] }[];
}

const pending = (a: TidyStop) => !!a.searchQuery && (a.lat == null || a.lng == null) && !a.groundingFailedAt;

export function tidyPlan(trip: TidyTrip, nowMs: number): { ready: boolean; reorders: { dayId: string; ids: string[] }[] } {
  const created = trip.createdAt?.toMillis?.() ?? null;
  const fresh = created !== null && nowMs - created <= FRESH_MS;
  if (!trip.isAiGenerated || trip.daysTidied || !fresh) return { ready: false, reorders: [] };
  if (trip.days.some((d) => d.activities.some(pending))) return { ready: false, reorders: [] };
  const reorders: { dayId: string; ids: string[] }[] = [];
  for (const d of trip.days) {
    const current = [...d.activities].sort((a, b) => a.order - b.order);
    const asStop = (x: TidyStop): PlaceStop => ({ id: x.id, lat: x.lat ?? null, lng: x.lng ?? null, type: x.type as PlaceStop['type'], title: x.title, startTime: x.startTime ?? null, fixed: !!x.fromBooking });
    const ids = optimizeDay(current.map(asStop)).map((p) => p.id);
    if (ids.some((id, i) => id !== current[i].id)) reorders.push({ dayId: d.id, ids });
  }
  return { ready: true, reorders };
}
