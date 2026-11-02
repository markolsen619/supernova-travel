/**
 * The day-of assistant's rules (spec 2026-11-01-day-of-assistant-design.md): when a boarding pass's check-in
 * reminder (free), leave-by time and leave push (Pro) are due, the airport buffer, and where the traveler is
 * staying. Pure — dayOfFunctions.ts reads passes and trips and sends.
 */
import { airportInfo } from './airportInfo';

const M = 60_000, H = 60 * M;
const SLACK = 10 * M; // the job runs every 10 minutes
const ACTIVE = new Set(['upcoming', 'checked_in']);

export interface DayOfPass {
  id: string; ownerUid: string; status: string; departureMs: number; origin: string; destination: string;
  airline: string; flightNumber: string; destinationCity: string; tripId: string | null;
  dayOf: { checkInSentAtMs?: number; leaveByMs?: number; driveMin?: number | null; bufferMin?: number; leaveSentAtMs?: number };
}
export type DayOfAction = { kind: 'checkin'; passId: string } | { kind: 'computeLeaveBy'; passId: string } | { kind: 'leave'; passId: string };

export function dueActions(passes: DayOfPass[], nowMs: number, paidUids: Set<string>): DayOfAction[] {
  const out: DayOfAction[] = [];
  for (const p of passes) {
    if (!ACTIVE.has(p.status) || p.departureMs <= nowMs) continue;
    const until = p.departureMs - nowMs;
    if (!p.dayOf.checkInSentAtMs && until > 24 * H - SLACK && until <= 24 * H + SLACK) out.push({ kind: 'checkin', passId: p.id });
    if (!paidUids.has(p.ownerUid)) continue;
    if (p.dayOf.leaveByMs == null && until > 6 * H - SLACK && until <= 6 * H + SLACK) out.push({ kind: 'computeLeaveBy', passId: p.id });
    if (p.dayOf.leaveByMs != null && !p.dayOf.leaveSentAtMs && nowMs >= p.dayOf.leaveByMs - 30 * M) out.push({ kind: 'leave', passId: p.id });
  }
  return out;
}

/** 2 hours when both airports are in one country, else 3 (unknown airports count as international — the safe side). */
export function bufferMinutes(origin: string, destination: string): number {
  const a = airportInfo(origin), b = airportInfo(destination);
  return a && b && a.country === b.country ? 120 : 180;
}

export const leaveByMs = (departureMs: number, bufferMin: number, driveMin: number | null) =>
  departureMs - (bufferMin + (driveMin ?? 0)) * M;

export function previousDay(day: string): string {
  return new Date(Date.parse(`${day}T12:00:00Z`) - 24 * H).toISOString().slice(0, 10);
}

/** Where the traveler sleeps before the flight: a located hotel stop on the departure day, else the night before. */
export function stayFor(stops: { dayKey: string; type: string; lat: number | null; lng: number | null }[], departureDay: string): { lat: number; lng: number } | null {
  for (const day of [departureDay, previousDay(departureDay)]) {
    const h = stops.find((s) => s.dayKey === day && s.type === 'hotel' && s.lat != null && s.lng != null);
    if (h) return { lat: h.lat!, lng: h.lng! };
  }
  return null;
}
