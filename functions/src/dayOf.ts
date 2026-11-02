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
  dayOf: DayOfStamps;
}
export interface DayOfStamps { key?: string; checkInSentAtMs?: number; leaveByMs?: number; driveMin?: number | null; bufferMin?: number; leaveSentAtMs?: number }
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

const STAY_MAX_KM = 150;
function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/**
 * Where the traveler sleeps before the flight: a located hotel stop on the departure day, else the night before —
 * only one near the departure airport. Day 1 of a trip starts at the destination's hotel, and the outbound flight is
 * linked to that trip: measured from there, an SFO → LAX flight said "leave by 2:00 AM" (final review C1).
 */
export function stayFor(stops: { dayKey: string; type: string; lat: number | null; lng: number | null }[], departureDay: string, airport?: { lat: number; lng: number } | null): { lat: number; lng: number } | null {
  for (const day of [departureDay, previousDay(departureDay)]) {
    const h = stops.find((s) => s.dayKey === day && s.type === 'hotel' && s.lat != null && s.lng != null
      && (!airport || km({ lat: s.lat, lng: s.lng }, airport) <= STAY_MAX_KM));
    if (h) return { lat: h.lat!, lng: h.lng! };
  }
  return null;
}

/** A drive over 4 h to the airport is a wrong stay, not a plan: leave it out ("Be at LIS by …"). */
export const usableDrive = (driveMin: number | null): number | null => (driveMin != null && driveMin <= 240 ? driveMin : null);

/** What the stamps were made for: a changed departure time or airport makes them stale (final review I7). */
export const stampKey = (departureTime: string, origin: string) => `${departureTime}|${origin}`;
export const currentDayOf = (dayOf: DayOfStamps | undefined, key: string): DayOfStamps => (dayOf?.key === key ? dayOf : {});
