/**
 * The day-of assistant on the phone (spec 2026-11-01-day-of-assistant-design.md): the airline's check-in page,
 * today's flight, the Live Activity's text, and the leave-by line. Pure.
 */
import { airportZone } from '@/utils/airportTime';
import type { BoardingPass } from '@/types';

const H = 3_600_000;

/** Check-in pages of major airlines by IATA code; anything else gets a web search. */
const CHECK_IN: Record<string, { name: RegExp; url: string }> = {
  AA: { name: /american airlines/i, url: 'https://www.aa.com/reservation/view/find-your-trip' },
  DL: { name: /delta/i, url: 'https://www.delta.com/mytrips/' },
  UA: { name: /united/i, url: 'https://www.united.com/en/us/checkin' },
  WN: { name: /southwest/i, url: 'https://www.southwest.com/air/check-in/' },
  AS: { name: /alaska/i, url: 'https://www.alaskaair.com/check-in' },
  B6: { name: /jetblue/i, url: 'https://www.jetblue.com/check-in' },
  NK: { name: /spirit/i, url: 'https://www.spirit.com/check-in' },
  F9: { name: /frontier/i, url: 'https://www.flyfrontier.com/travel/my-trips/check-in/' },
  HA: { name: /hawaiian/i, url: 'https://www.hawaiianairlines.com/manage-flights/check-in' },
  AC: { name: /air canada/i, url: 'https://www.aircanada.com/checkin' },
  WS: { name: /westjet/i, url: 'https://www.westjet.com/en-ca/check-in' },
  AM: { name: /aeromexico/i, url: 'https://aeromexico.com/en-us/check-in' },
  BA: { name: /british airways/i, url: 'https://www.britishairways.com/travel/olcilandingpageauthreq/public/en_gb' },
  VS: { name: /virgin atlantic/i, url: 'https://www.virginatlantic.com/check-in' },
  AF: { name: /air france/i, url: 'https://wwws.airfrance.us/check-in' },
  KL: { name: /klm/i, url: 'https://www.klm.com/check-in' },
  LH: { name: /lufthansa/i, url: 'https://www.lufthansa.com/us/en/online-check-in' },
  LX: { name: /swiss/i, url: 'https://www.swiss.com/us/en/prepare/check-in' },
  OS: { name: /austrian/i, url: 'https://www.austrian.com/us/en/check-in' },
  SN: { name: /brussels/i, url: 'https://www.brusselsairlines.com/en-us/practical-information/check-in/' },
  IB: { name: /iberia/i, url: 'https://www.iberia.com/us/online-check-in/' },
  VY: { name: /vueling/i, url: 'https://www.vueling.com/en/vueling-services/check-in' },
  TP: { name: /tap/i, url: 'https://www.flytap.com/en-us/check-in' },
  AZ: { name: /ita airways|alitalia/i, url: 'https://www.ita-airways.com/en_us/check-in.html' },
  FR: { name: /ryanair/i, url: 'https://www.ryanair.com/gb/en/check-in' },
  U2: { name: /easyjet/i, url: 'https://www.easyjet.com/en/manage-bookings' },
  W6: { name: /wizz/i, url: 'https://wizzair.com/en-gb/check-in' },
  EI: { name: /aer lingus/i, url: 'https://www.aerlingus.com/html/checkin.html' },
  SK: { name: /\bsas\b|scandinavian/i, url: 'https://www.flysas.com/en/check-in/' },
  AY: { name: /finnair/i, url: 'https://www.finnair.com/us-en/check-in' },
  TK: { name: /turkish/i, url: 'https://www.turkishairlines.com/en-us/flights/manage-booking/check-in/' },
  EK: { name: /emirates/i, url: 'https://www.emirates.com/us/english/manage-booking/online-check-in/' },
  QR: { name: /qatar/i, url: 'https://www.qatarairways.com/en-us/manage-booking/check-in.html' },
  EY: { name: /etihad/i, url: 'https://www.etihad.com/en-us/manage/check-in' },
  SQ: { name: /singapore/i, url: 'https://www.singaporeair.com/en_UK/us/travel-info/check-in/' },
  CX: { name: /cathay/i, url: 'https://www.cathaypacific.com/cx/en_US/manage-booking/check-in.html' },
  JL: { name: /japan airlines|\bjal\b/i, url: 'https://www.jal.co.jp/jp/en/inter/boarding/' },
  NH: { name: /\bana\b|all nippon/i, url: 'https://www.ana.co.jp/en/us/international/departure/check-in/' },
  KE: { name: /korean air/i, url: 'https://www.koreanair.com/check-in' },
  QF: { name: /qantas/i, url: 'https://www.qantas.com/us/en/travel-info/check-in.html' },
  NZ: { name: /air new zealand/i, url: 'https://www.airnewzealand.com/check-in' },
  LA: { name: /latam/i, url: 'https://www.latamairlines.com/us/en/check-in' },
  AV: { name: /avianca/i, url: 'https://www.avianca.com/en/check-in/' },
  CM: { name: /copa/i, url: 'https://www.copaair.com/en-us/check-in/' },
  ET: { name: /ethiopian/i, url: 'https://www.ethiopianairlines.com/aa/book/manage-your-booking/check-in' },
  AI: { name: /air india/i, url: 'https://www.airindia.com/in/en/manage/web-checkin.html' },
};

export function checkInUrl(airline: string, flightNumber: string): string {
  const code = (flightNumber ?? '').trim().toUpperCase().match(/^([A-Z0-9]{2})\s?\d/)?.[1];
  const hit = (code && CHECK_IN[code]) || Object.values(CHECK_IN).find((a) => a.name.test(airline ?? ''));
  if (hit) return hit.url;
  return `https://www.google.com/search?${new URLSearchParams({ q: `${(airline || flightNumber).trim()} online check-in` }).toString()}`;
}

/** The calendar day on an airport's clock. */
function airportDay(ms: number, iata: string): string {
  const timeZone = airportZone(iata) ?? undefined;
  return new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(new Date(ms));
}

const ACTIVE = new Set(['upcoming', 'checked_in', 'boarded']);

/**
 * Today's next flight: departing today on its airport's clock, not more than 30 min gone, not cancelled. "Gone"
 * counts from the delayed time — a delayed flight is when the card matters most (final review I5).
 */
export function flightToday(passes: BoardingPass[], now: Date): BoardingPass | null {
  const n = now.getTime();
  return passes
    .filter((p) => ACTIVE.has(p.status))
    .map((p) => ({ p, ms: Date.parse(p.departureTime) + Math.max(0, p.delayMinutes ?? 0) * 60_000 }))
    .filter(({ p, ms }) => Number.isFinite(ms) && ms > n - 30 * 60_000 && airportDay(ms, p.origin) === airportDay(n, p.origin))
    .sort((a, b) => a.ms - b.ms)[0]?.p ?? null;
}

export function liveActivityContent(p: BoardingPass, nowMs: number): { title: string; subtitle: string; endsAtMs: number; ended: boolean } {
  const dep = Date.parse(p.departureTime);
  const arr = p.arrivalTime ? Date.parse(p.arrivalTime) : NaN;
  const ended = p.status === 'cancelled' || p.status === 'completed' || (Number.isFinite(arr) ? nowMs >= arr : nowMs >= dep + 3 * H);
  const delay = p.delayMinutes ?? 0;
  const bits = delay >= 15 ? [`Delayed ${delay} min`] : [p.gate ? `Gate ${p.gate}` : null, p.seat ? `Seat ${p.seat}` : null].filter((x): x is string => !!x);
  return {
    title: `${p.flightNumber} · ${p.origin} → ${p.destination}`,
    subtitle: bits.length ? bits.join(' · ') : `To ${p.destinationCity || p.destination}`,
    endsAtMs: dep + Math.max(0, delay) * 60_000,
    ended,
  };
}

export function shouldStartActivity(p: BoardingPass, nowMs: number, started: Set<string>, isPro: boolean): boolean {
  if (!isPro || started.has(p.id)) return false;
  const dep = Date.parse(p.departureTime);
  return Number.isFinite(dep) && dep - nowMs <= 6 * H && !liveActivityContent(p, nowMs).ended;
}

/**
 * "Leave by 11:10 AM" on the departure airport's clock, once the server has worked it out (Pro). With no drive known
 * the time is when to be at the airport, so it says that, as the push does. Stamps made for another departure time or
 * airport (the pass was edited) show nothing — the server's `dayOf.key`, as `stampKey` in functions/src/dayOf.ts.
 */
export function leaveByLine(p: BoardingPass): string | null {
  const d = p.dayOf;
  if (typeof d?.leaveByMs !== 'number' || d.key !== `${p.departureTime}|${p.origin}`) return null;
  const timeZone = airportZone(p.origin) ?? undefined;
  const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }).format(new Date(d.leaveByMs));
  return d.driveMin != null ? `Leave by ${time}` : `Be at ${p.origin} by ${time}`;
}

export interface ActivityPlan {
  stop: { passId: string; activityId: string }[];
  update: { activityId: string; pass: BoardingPass } | null;
  start: BoardingPass | null;
}

/**
 * What the Live Activity hook does, from what's started on this phone (`{ passId → activityId }`) and the user's
 * passes. A started flight is followed by its own pass until it lands or is cancelled/deleted — not by `flightToday`,
 * which lets go 30 min after departure. Only today's next flight starts one. Pro is checked by the caller.
 */
export function activityPlan(started: Record<string, string>, passes: BoardingPass[], nowMs: number): ActivityPlan {
  const byId = new Map(passes.map((p) => [p.id, p]));
  const stop: ActivityPlan['stop'] = [];
  let update: ActivityPlan['update'] = null;
  for (const [passId, activityId] of Object.entries(started)) {
    const p = byId.get(passId);
    if (!p || liveActivityContent(p, nowMs).ended) stop.push({ passId, activityId });
    else if (!update) update = { activityId, pass: p };
  }
  const today = flightToday(passes, new Date(nowMs));
  const start = !update && today && shouldStartActivity(today, nowMs, new Set(Object.keys(started)), true) ? today : null;
  return { stop, update, start };
}

/** Android's ongoing "Flight today" notification: within 6 h of departure until the flight lands, else none. */
export function androidFlightNotice(p: BoardingPass | null, nowMs: number): { title: string; body: string } | null {
  if (!p) return null;
  const c = liveActivityContent(p, nowMs);
  if (c.ended || Date.parse(p.departureTime) - nowMs > 6 * H) return null;
  return { title: `Flight today · ${c.title}`, body: c.subtitle };
}
