# Calendar Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user can subscribe their phone's calendar to a private, always-current calendar of their trips, days, flights and reservations, with type switches and a per-booking switch to avoid duplicates.

**Architecture:** A pure iCalendar builder (`functions/src/calendarFeed.ts`) turned into an HTTPS feed (`calendarFeed`, served at `/cal/{token}.ics` via a Hosting rewrite) keyed by a secret token stored like the email-import address. Callables create, rotate, disable and configure the feed. The app shows a `CalendarSheet` (Settings row + trip chip) and a "Show in calendar" switch on booking detail screens.

**Tech Stack:** Firebase Functions v2 (Node 22, firebase-admin), Firebase Hosting rewrites, Expo / React Native, Jest (pure tests).

**Spec:** `docs/superpowers/specs/2026-10-19-calendar-feed-design.md`

## Global Constraints

- Free for everyone (no Pro gate).
- Token: 24 chars `a-z0-9`, unbiased (same rejection rule as `functions/src/emailImport.ts` `newToken`). `calendarFeeds/{token} = { uid, createdAt }` server-only; `users/{uid}/private/calendar = { token, types, createdAt }` (owner read, server write — existing rule).
- Types: `{ flights, stays, dining, transit, tripDays }`, all default `true`.
- Only the user's own bookings; own + joined trips; nothing ending before now − 30 days.
- Never emit confirmation codes, booking refs, barcodes, booking addresses, notes, attachments.
- Flights in UTC (`Z`); reservation/stop clock times floating (no `TZID`); hotels/trip/days all-day with exclusive `DTEND`.
- Stable UIDs `{kind}-{id}@supernovatravel.app`.
- `Cache-Control: private, max-age=900`; unknown token → 404 with an empty body.
- `deleteAccount` must remove `calendarFeeds/{token}` and the private doc (CLAUDE.md: new per-user data must be added there).
- Day dates reuse `tripDays` / `dayKey` from `functions/src/friendsTraveling.ts` — never re-derived.
- UI: CLAUDE.md design rules (theme tokens, sentence case, no emoji, haptics, 44 pt targets, `useCallback`, `requireOnline()` for writes).
- Trip entry point: a **Calendar chip** in the trip page's chip row (members only), not the ⋯ menu — the ⋯ on the trip page is Report/Block for others' trips (spec §3 says ⋯; this plan supersedes it; spec updated in Task 4).

## Review Focus

1. A boarding pass with no `arrivalTime` — must still produce a 2 h event (Task 1 test).
2. Text with commas, semicolons, backslashes and newlines in titles/stops must be escaped, and a 200-char line folded at 75 octets including multi-byte characters (Task 1 tests).
3. A trip with no dates must contribute no trip/day events and not throw (Task 1 test).
4. Disabling or rotating must make the old URL 404 immediately (Task 2 test on the pure resolver + order of deletes in the callable).
5. A Dates-TBD day or a stop on a day without a date must be skipped, not dated "Invalid" (Task 1 test).

---

### Task 1: The pure iCalendar builder

**Files:**
- Create: `functions/src/calendarFeed.ts`
- Test: `__tests__/functions/calendarFeed.test.ts`

**Interfaces:**
- Produces:
  - `type CalTypes = { flights: boolean; stays: boolean; dining: boolean; transit: boolean; tripDays: boolean }`
  - `DEFAULT_TYPES: CalTypes`
  - `type CalPass = { id: string; airline?: string; flightNumber?: string; origin?: string; destination?: string; departureTime?: string; arrivalTime?: string; seat?: string; gate?: string; terminal?: string; boardingGroup?: string; showInCalendar?: boolean }`
  - `type CalReservation = { id: string; type: string; title?: string; checkIn?: string; checkOut?: string; time?: string; transitMode?: string; departureLocalTime?: string; showInCalendar?: boolean }`
  - `type CalStop = { id: string; title?: string; startTime?: string | null; endTime?: string | null; order?: number }`
  - `type CalDay = { id: string; dayNumber?: number | null; dateMs: number | null; city?: string | null; stops: CalStop[] }`
  - `type CalTrip = { id: string; title?: string; region?: string | null; startDateMs: number | null; endDateMs: number | null; startDay?: string | null; days: CalDay[] }`
  - `buildCalendar(input: { trips: CalTrip[]; passes: CalPass[]; reservations: CalReservation[]; types?: Partial<CalTypes> }, now: Date): string`
  - `newFeedToken(random?: (n: number) => Buffer): string`
  - `escapeText(s: string): string`, `foldLine(line: string): string`

- [ ] **Step 1: Write the failing tests**

```ts
// __tests__/functions/calendarFeed.test.ts
import { buildCalendar, escapeText, foldLine, newFeedToken, type CalTrip } from '../../functions/src/calendarFeed';

const now = new Date('2026-10-19T12:00:00Z');
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1);

const trip = (over: Partial<CalTrip> = {}): CalTrip => ({
  id: 't1', title: 'Lisbon', region: 'Portugal', startDateMs: day('2026-11-02'), endDateMs: day('2026-11-04'), startDay: '2026-11-02',
  days: [
    { id: 'd1', dayNumber: 1, dateMs: null, city: 'Lisbon', stops: [{ id: 's1', title: 'Belém Tower', order: 0 }, { id: 's2', title: 'Dinner, Time Out', startTime: '19:30', order: 1 }] },
    { id: 'd2', dayNumber: 2, dateMs: null, city: 'Sintra', stops: [] },
  ],
  ...over,
});

describe('buildCalendar', () => {
  it('wraps events in a VCALENDAR with CRLF line endings', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [] }, now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('writes flights in UTC with a 2-hour default when there is no arrival', () => {
    const ics = buildCalendar({ trips: [], reservations: [], passes: [
      { id: 'p1', airline: 'BA', flightNumber: 'BA117', origin: 'LHR', destination: 'JFK', departureTime: '2026-11-01T09:20:00+00:00', seat: '14A', gate: 'B3' },
    ] }, now);
    const [ev] = events(ics);
    expect(ev).toContain('UID:flight-p1@supernovatravel.app');
    expect(ev).toContain('DTSTART:20261101T092000Z');
    expect(ev).toContain('DTEND:20261101T112000Z');
    expect(ev).toContain('SUMMARY:BA117 · LHR → JFK');
    expect(ev).toContain('Seat 14A');
  });

  it('writes hotels as all-day with an exclusive end', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [
      { id: 'r1', type: 'hotel', title: 'Pestana', checkIn: '2026-11-02', checkOut: '2026-11-04' },
    ] }, now);
    const [ev] = events(ics);
    expect(ev).toContain('DTSTART;VALUE=DATE:20261102');
    expect(ev).toContain('DTEND;VALUE=DATE:20261104');
    expect(ev).toContain('SUMMARY:Hotel: Pestana');
  });

  it('writes restaurant times as floating local times, all-day without a time', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [
      { id: 'r2', type: 'restaurant', title: 'Cervejaria', checkIn: '2026-11-03', time: '19:30' },
      { id: 'r3', type: 'activity', title: 'Tram tour', checkIn: '2026-11-03' },
    ] }, now);
    const [a, b] = events(ics);
    expect(a).toContain('DTSTART:20261103T193000\r\n');
    expect(a).toContain('DTEND:20261103T213000\r\n');
    expect(b).toContain('DTSTART;VALUE=DATE:20261103');
  });

  it('writes train tickets by their printed departure time', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [
      { id: 'r4', type: 'activity', transitMode: 'train', title: 'Lisbon → Porto', checkIn: '2026-11-04', departureLocalTime: '09:19' },
    ] }, now);
    expect(events(ics)[0]).toContain('DTSTART:20261104T091900\r\n');
  });

  it('writes the trip span, one event per day listing its stops, and timed stops', () => {
    const ics = buildCalendar({ trips: [trip()], passes: [], reservations: [] }, now);
    const evs = events(ics);
    const tripEv = evs.find((e) => e.includes('UID:trip-t1@'))!;
    expect(tripEv).toContain('DTSTART;VALUE=DATE:20261102');
    expect(tripEv).toContain('DTEND;VALUE=DATE:20261105');
    const d1 = evs.find((e) => e.includes('UID:day-d1@'))!;
    expect(d1).toContain('SUMMARY:Day 1 · Lisbon');
    expect(d1).toContain('Belém Tower\\nDinner\\, Time Out');
    const d2 = evs.find((e) => e.includes('UID:day-d2@'))!;
    expect(d2).toContain('DTSTART;VALUE=DATE:20261103');
    const s2 = evs.find((e) => e.includes('UID:stop-s2@'))!;
    expect(s2).toContain('DTSTART:20261102T193000\r\n');
    expect(s2).toContain('DTEND:20261102T203000\r\n');
    expect(evs.find((e) => e.includes('UID:stop-s1@'))).toBeUndefined();
  });

  it('skips trips with no dates and days it cannot date', () => {
    const ics = buildCalendar({ trips: [trip({ startDateMs: null, endDateMs: null, startDay: null })], passes: [], reservations: [] }, now);
    expect(events(ics)).toHaveLength(0);
  });

  it('honours type switches and the per-booking switch', () => {
    const input = {
      trips: [trip()],
      passes: [{ id: 'p1', flightNumber: 'BA1', departureTime: '2026-11-01T09:00:00Z' }, { id: 'p2', flightNumber: 'BA2', departureTime: '2026-11-01T09:00:00Z', showInCalendar: false }],
      reservations: [{ id: 'r1', type: 'hotel', title: 'H', checkIn: '2026-11-02', checkOut: '2026-11-03' }],
    };
    const all = unfold(buildCalendar(input, now));
    expect(all).toContain('flight-p1@');
    expect(all).not.toContain('flight-p2@');
    const noFlights = unfold(buildCalendar({ ...input, types: { flights: false, tripDays: false } }, now));
    expect(noFlights).not.toContain('flight-p1@');
    expect(noFlights).not.toContain('trip-t1@');
    expect(noFlights).toContain('res-r1@');
  });

  it('leaves out anything that ended more than 30 days ago', () => {
    const ics = buildCalendar({ trips: [], reservations: [], passes: [
      { id: 'old', flightNumber: 'X1', departureTime: '2026-08-01T09:00:00Z' },
      { id: 'recent', flightNumber: 'X2', departureTime: '2026-10-01T09:00:00Z' },
    ] }, now);
    expect(ics).not.toContain('flight-old@');
    expect(ics).toContain('flight-recent@');
  });

  it('never writes codes or booking references', () => {
    const ics = buildCalendar({ trips: [], passes: [
      { id: 'p1', flightNumber: 'BA1', departureTime: '2026-11-01T09:00:00Z', ...( { barcode: 'M1SECRET', confirmationCode: 'ABC123' } as object) },
    ], reservations: [{ id: 'r1', type: 'hotel', title: 'H', checkIn: '2026-11-02', checkOut: '2026-11-03', ...( { confirmationCode: 'XYZ789', address: '1 Rua' } as object) }] }, now);
    expect(ics).not.toMatch(/SECRET|ABC123|XYZ789|1 Rua/);
  });
});

describe('escapeText / foldLine', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const line = `SUMMARY:${'é'.repeat(100)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('newFeedToken', () => {
  it('is 24 lowercase letters or digits', () => {
    expect(newFeedToken()).toMatch(/^[a-z0-9]{24}$/);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest __tests__/functions/calendarFeed.test.ts`
Expected: FAIL — cannot find module `functions/src/calendarFeed`

- [ ] **Step 3: Implement**

```ts
// functions/src/calendarFeed.ts
/**
 * The private calendar feed (docs/superpowers/specs/2026-10-19-calendar-feed-design.md): the user's trips, days,
 * flights and reservations as iCalendar (RFC 5545). Pure — the HTTPS function loads the data and calls this.
 * Never writes codes, references, barcodes, addresses, notes or other members' bookings.
 */
import { randomBytes } from 'crypto';
import { dayKey, tripDays } from './friendsTraveling';

export type CalTypes = { flights: boolean; stays: boolean; dining: boolean; transit: boolean; tripDays: boolean };
export const DEFAULT_TYPES: CalTypes = { flights: true, stays: true, dining: true, transit: true, tripDays: true };

export type CalPass = { id: string; airline?: string; flightNumber?: string; origin?: string; destination?: string; departureTime?: string; arrivalTime?: string; seat?: string; gate?: string; terminal?: string; boardingGroup?: string; showInCalendar?: boolean };
export type CalReservation = { id: string; type: string; title?: string; checkIn?: string; checkOut?: string; time?: string; transitMode?: string; departureLocalTime?: string; showInCalendar?: boolean };
export type CalStop = { id: string; title?: string; startTime?: string | null; endTime?: string | null; order?: number };
export type CalDay = { id: string; dayNumber?: number | null; dateMs: number | null; city?: string | null; stops: CalStop[] };
export type CalTrip = { id: string; title?: string; region?: string | null; startDateMs: number | null; endDateMs: number | null; startDay?: string | null; days: CalDay[] };

const DOMAIN = 'supernovatravel.app';
const WINDOW_MS = 30 * 86_400_000;
const STAYS = new Set(['hotel', 'airbnb', 'rental_car']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds at 75 octets (RFC 5545 §3.1), never inside a UTF-8 character. */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const b = Buffer.byteLength(ch, 'utf8');
    const limit = parts.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + b > limit) { parts.push(current); current = ''; bytes = 0; }
    current += ch;
    bytes += b;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (day: string) => day.replace(/-/g, '');
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
const utc = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
function floating(day: string, time: string, plusMinutes = 0): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + plusMinutes;
  const d = addDays(day, Math.floor(total / 1440));
  const mins = total % 1440;
  return `${compactDate(d)}T${String(Math.floor(mins / 60)).padStart(2, '0')}${String(mins % 60).padStart(2, '0')}00`;
}

type Ev = { uid: string; start: string; end: string; summary: string; description?: string; endsAtMs: number };

function allDay(uid: string, first: string, lastInclusive: string, summary: string, description?: string): Ev {
  return {
    uid, summary, description,
    start: `DTSTART;VALUE=DATE:${compactDate(first)}`,
    end: `DTEND;VALUE=DATE:${compactDate(addDays(lastInclusive, 1))}`,
    endsAtMs: Date.parse(`${addDays(lastInclusive, 1)}T00:00:00Z`),
  };
}

function timed(uid: string, day: string, time: string, minutes: number, summary: string, description?: string): Ev {
  return {
    uid, summary, description,
    start: `DTSTART:${floating(day, time)}`,
    end: `DTEND:${floating(day, time, minutes)}`,
    endsAtMs: Date.parse(`${day}T00:00:00Z`) + 86_400_000,
  };
}

function minutesBetween(start: string, end: string | null | undefined, fallback: number): number {
  if (!end || !TIME_RE.test(end)) return fallback;
  const [a, b] = [start, end].map((t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; });
  return b > a ? b - a : fallback;
}

function flightEvents(passes: CalPass[]): Ev[] {
  const out: Ev[] = [];
  for (const p of passes) {
    const dep = p.departureTime ? Date.parse(p.departureTime) : NaN;
    if (Number.isNaN(dep)) continue;
    const arrRaw = p.arrivalTime ? Date.parse(p.arrivalTime) : NaN;
    const arr = !Number.isNaN(arrRaw) && arrRaw > dep ? arrRaw : dep + 2 * 3_600_000;
    const route = [p.origin, p.destination].filter(Boolean).join(' → ');
    const details = [p.seat && `Seat ${p.seat}`, p.gate && `Gate ${p.gate}`, p.terminal && `Terminal ${p.terminal}`, p.boardingGroup && `Group ${p.boardingGroup}`].filter(Boolean).join('\n');
    out.push({
      uid: `flight-${p.id}@${DOMAIN}`,
      start: `DTSTART:${utc(dep)}`, end: `DTEND:${utc(arr)}`,
      summary: [p.flightNumber || p.airline || 'Flight', route].filter(Boolean).join(' · '),
      description: details || undefined,
      endsAtMs: arr,
    });
  }
  return out;
}

function reservationEvents(rs: CalReservation[], types: CalTypes): Ev[] {
  const out: Ev[] = [];
  for (const r of rs) {
    if (!r.checkIn || !DAY_RE.test(r.checkIn)) continue;
    const uid = `res-${r.id}@${DOMAIN}`;
    const title = r.title?.trim() || 'Reservation';
    if (STAYS.has(r.type)) {
      if (!types.stays) continue;
      const last = r.checkOut && DAY_RE.test(r.checkOut) && r.checkOut > r.checkIn ? addDays(r.checkOut, -1) : r.checkIn;
      const label = r.type === 'rental_car' ? 'Car' : 'Hotel';
      out.push(allDay(uid, r.checkIn, last, `${label}: ${title}`));
    } else if (r.transitMode) {
      if (!types.transit) continue;
      const t = r.departureLocalTime && TIME_RE.test(r.departureLocalTime) ? r.departureLocalTime : null;
      out.push(t ? timed(uid, r.checkIn, t, 60, title) : allDay(uid, r.checkIn, r.checkIn, title));
    } else {
      if (!types.dining) continue;
      const t = r.time && TIME_RE.test(r.time) ? r.time : null;
      out.push(t ? timed(uid, r.checkIn, t, 120, title) : allDay(uid, r.checkIn, r.checkIn, title));
    }
  }
  return out;
}

function tripEvents(trips: CalTrip[]): Ev[] {
  const out: Ev[] = [];
  for (const trip of trips) {
    const like = { startDateMs: trip.startDateMs, endDateMs: trip.endDateMs, startDay: trip.startDay ?? null };
    const span = tripDays(like);
    if (!span) continue;
    const length = Math.round((Date.parse(`${span.end}T00:00:00Z`) - Date.parse(`${span.start}T00:00:00Z`)) / 86_400_000) + 1;
    out.push(allDay(`trip-${trip.id}@${DOMAIN}`, span.start, span.end, trip.title?.trim() || 'Trip',
      [`${length} ${length === 1 ? 'day' : 'days'}`, trip.region].filter(Boolean).join(' · ')));
    for (const d of trip.days) {
      const date = dayKey(like, { dateMs: d.dateMs, destinationIndex: null, dayNumber: d.dayNumber ?? null });
      if (!date) continue;
      const stops = [...d.stops].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      out.push(allDay(`day-${d.id}@${DOMAIN}`, date, date,
        [`Day ${d.dayNumber ?? ''}`.trim(), d.city].filter(Boolean).join(' · '),
        stops.map((s) => s.title?.trim()).filter(Boolean).join('\n') || undefined));
      for (const s of stops) {
        if (!s.startTime || !TIME_RE.test(s.startTime)) continue;
        out.push(timed(`stop-${s.id}@${DOMAIN}`, date, s.startTime, minutesBetween(s.startTime, s.endTime, 60), s.title?.trim() || 'Stop'));
      }
    }
  }
  return out;
}

export function buildCalendar(
  input: { trips: CalTrip[]; passes: CalPass[]; reservations: CalReservation[]; types?: Partial<CalTypes> },
  now: Date,
): string {
  const types = { ...DEFAULT_TYPES, ...(input.types ?? {}) };
  const shown = <T extends { showInCalendar?: boolean }>(xs: T[]) => xs.filter((x) => x.showInCalendar !== false);
  const evs = [
    ...(types.flights ? flightEvents(shown(input.passes)) : []),
    ...reservationEvents(shown(input.reservations), types),
    ...(types.tripDays ? tripEvents(input.trips) : []),
  ].filter((e) => e.endsAtMs >= now.getTime() - WINDOW_MS);
  const stamp = utc(now.getTime());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Galaxie Labs//Supernova//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Supernova trips', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  for (const e of evs) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${stamp}`, e.start, e.end, `SUMMARY:${escapeText(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${escapeText(e.description)}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** 24 characters a-z0-9; 252 is the largest multiple of 36 under 256, so every character is equally likely. */
export function newFeedToken(random: (n: number) => Buffer = randomBytes): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  while (out.length < 24) {
    for (const b of random(32)) {
      if (b >= 252) continue;
      out += alphabet[b % 36];
      if (out.length === 24) break;
    }
  }
  return out;
}
```

- [ ] **Step 4: Run to verify they pass**

Run: `npx jest __tests__/functions/calendarFeed.test.ts`
Expected: PASS. Then `cd functions && npm run build` — compiles.

- [ ] **Step 5: Commit**

```bash
git add functions/src/calendarFeed.ts __tests__/functions/calendarFeed.test.ts
git commit -m "feat(calendar): build a private iCalendar of your trips, days and bookings"
```

---

### Task 2: The feed endpoint, callables and clean-up

**Files:**
- Create: `functions/src/calendarFeedFunctions.ts`
- Modify: `functions/src/index.ts` (exports), `firebase.json` (rewrite `/cal/**` → `calendarFeed`), `functions/src/deleteAccount.ts` (remove feed docs), `firestore.rules` (`calendarFeeds` deny-all)
- Test: `__tests__/functions/calendarFeed.test.ts` (add `tokenFromPath`)

**Interfaces:**
- Consumes: `buildCalendar`, `newFeedToken`, `DEFAULT_TYPES`, `CalTypes` (Task 1)
- Produces: `tokenFromPath(path: string): string | null` (in `calendarFeed.ts`, pure); callables `createCalendarFeed() → { token }`, `rotateCalendarFeed() → { token }`, `disableCalendarFeed() → { ok: true }`, `setCalendarTypes({ types: Partial<CalTypes> }) → { types: CalTypes }`; HTTPS `calendarFeed`

- [ ] **Step 1: Failing test for the path parser** (append to the test file)

```ts
import { tokenFromPath } from '../../functions/src/calendarFeed';

describe('tokenFromPath', () => {
  it('reads /cal/{token}.ics and nothing else', () => {
    expect(tokenFromPath('/cal/abcdefghijklmnopqrstuvwx.ics')).toBe('abcdefghijklmnopqrstuvwx');
    expect(tokenFromPath('/cal/abcdefghijklmnopqrstuvwx')).toBe('abcdefghijklmnopqrstuvwx');
    expect(tokenFromPath('/cal/SHORT.ics')).toBeNull();
    expect(tokenFromPath('/cal/../users.ics')).toBeNull();
    expect(tokenFromPath('/trip/x')).toBeNull();
  });
});
```

Run `npx jest __tests__/functions/calendarFeed.test.ts` → FAIL (`tokenFromPath` not a function). Then add to `functions/src/calendarFeed.ts`:

```ts
/** The token in /cal/{token}.ics — exactly 24 of a-z0-9, so nothing else can be looked up. */
export function tokenFromPath(path: string): string | null {
  const m = /^\/cal\/([a-z0-9]{24})(?:\.ics)?$/.exec(path);
  return m ? m[1] : null;
}
```

Run again → PASS.

- [ ] **Step 2: Implement `functions/src/calendarFeedFunctions.ts`**

```ts
/**
 * Calendar feed wiring (spec 2026-10-19): token callables, and the HTTPS feed served at /cal/{token}.ics.
 * The token lives in users/{uid}/private/calendar (owner-read, server-write) and calendarFeeds/{token} (server-only).
 */
import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { buildCalendar, DEFAULT_TYPES, newFeedToken, tokenFromPath, type CalTypes, type CalTrip } from './calendarFeed';

const db = admin.firestore();
const privateDoc = (uid: string) => db.doc(`users/${uid}/private/calendar`);

async function liveTokens(uid: string): Promise<string[]> {
  return (await db.collection('calendarFeeds').where('uid', '==', uid).get()).docs.map((d) => d.id);
}

async function issue(uid: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = newFeedToken();
    try {
      await db.doc(`calendarFeeds/${token}`).create({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await privateDoc(uid).set({ token, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return token;
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS → another token
    }
  }
  throw new HttpsError('internal', 'Could not create a calendar link. Try again.');
}

function requireUid(request: { auth?: { uid: string } }): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  return request.auth.uid;
}

export const createCalendarFeed = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  const live = await liveTokens(uid);
  if (live.length > 0) {
    await privateDoc(uid).set({ token: live[0] }, { merge: true });
    return { token: live[0] };
  }
  return { token: await issue(uid) };
});

export const rotateCalendarFeed = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  // Old links die first, so a failure can never leave two live ones.
  await Promise.all((await liveTokens(uid)).map((t) => db.doc(`calendarFeeds/${t}`).delete()));
  return { token: await issue(uid) };
});

export const disableCalendarFeed = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  await Promise.all((await liveTokens(uid)).map((t) => db.doc(`calendarFeeds/${t}`).delete()));
  await privateDoc(uid).delete();
  return { ok: true };
});

export const setCalendarTypes = onCall({ region: 'us-central1' }, async (request) => {
  const uid = requireUid(request);
  const raw = (request.data as { types?: Record<string, unknown> } | undefined)?.types ?? {};
  const current = ((await privateDoc(uid).get()).get('types') ?? {}) as Partial<CalTypes>;
  const types: CalTypes = { ...DEFAULT_TYPES, ...current };
  for (const k of Object.keys(DEFAULT_TYPES) as (keyof CalTypes)[]) {
    if (typeof raw[k] === 'boolean') types[k] = raw[k] as boolean;
  }
  await privateDoc(uid).set({ types }, { merge: true });
  return { types };
});

async function loadTrips(uid: string): Promise<CalTrip[]> {
  const [own, joined] = await Promise.all([
    db.collection('trips').where('authorUid', '==', uid).get(),
    db.collection('trips').where('collaborators', 'array-contains', uid).get(),
  ]);
  const byId = new Map<string, admin.firestore.QueryDocumentSnapshot>();
  for (const d of [...own.docs, ...joined.docs]) byId.set(d.id, d);
  return Promise.all([...byId.values()].map(async (t) => {
    const daysSnap = await t.ref.collection('days').get();
    const days = await Promise.all(daysSnap.docs.map(async (d) => {
      const acts = await d.ref.collection('activities').get();
      const dd = d.data();
      const trip = t.data();
      const dests = [trip.destination, ...(trip.additionalDestinations ?? [])];
      return {
        id: d.id,
        dayNumber: typeof dd.dayNumber === 'number' ? dd.dayNumber : null,
        dateMs: dd.date?.toMillis?.() ?? null,
        city: dests[typeof dd.destinationIndex === 'number' ? dd.destinationIndex : 0]?.name ?? null,
        stops: acts.docs.map((a) => ({ id: a.id, title: a.get('title'), startTime: a.get('startTime') ?? null, endTime: a.get('endTime') ?? null, order: a.get('order') ?? 0 })),
      };
    }));
    const data = t.data();
    return {
      id: t.id, title: data.title, region: data.region ?? data.destination?.name ?? null,
      startDateMs: data.startDate?.toMillis?.() ?? null, endDateMs: data.endDate?.toMillis?.() ?? null,
      startDay: typeof data.startDay === 'string' ? data.startDay : null, days,
    };
  }));
}

export const calendarFeed = onRequest({ region: 'us-central1' }, async (req, res) => {
  const token = req.method === 'GET' ? tokenFromPath(req.path) : null;
  const feed = token ? await db.doc(`calendarFeeds/${token}`).get() : null;
  if (!feed?.exists) { res.status(404).send(''); return; }
  const uid = feed.get('uid') as string;
  const [trips, passes, reservations, priv] = await Promise.all([
    loadTrips(uid),
    db.collection('boarding_passes').where('ownerUid', '==', uid).get(),
    db.collection('reservations').where('ownerUid', '==', uid).get(),
    privateDoc(uid).get(),
  ]);
  const ics = buildCalendar({
    trips,
    passes: passes.docs.map((d) => ({ id: d.id, ...d.data() })),
    reservations: reservations.docs.map((d) => ({ id: d.id, ...d.data() })) as never,
    types: (priv.get('types') ?? {}) as Partial<CalTypes>,
  }, new Date());
  res.set('Content-Type', 'text/calendar; charset=utf-8');
  res.set('Cache-Control', 'private, max-age=900');
  res.status(200).send(ics);
});
```

Note: `buildCalendar` only reads whitelisted fields, so spreading the documents in is safe (the "never writes codes" test pins this).

- [ ] **Step 3: Wire up**
  - `functions/src/index.ts`: `export { calendarFeed, createCalendarFeed, rotateCalendarFeed, disableCalendarFeed, setCalendarTypes } from './calendarFeedFunctions';`
  - `firebase.json` hosting `rewrites`: add `{ "source": "/cal/**", "function": { "functionId": "calendarFeed", "region": "us-central1" } }` before any catch-all.
  - `firestore.rules`: add `match /calendarFeeds/{token} { allow read, write: if false; }` at the top level, next to `inboundAddresses`.
  - `functions/src/deleteAccount.ts`: next to the `inboundAddresses` removal, delete `calendarFeeds` where `uid == uid` and `users/{uid}/private/calendar`. Read the surrounding code and follow its batch/helper pattern exactly.

- [ ] **Step 4: Verify**

Run: `cd functions && npm run build && cd .. && npx jest --silent && npx tsc --noEmit -p .`
Expected: build clean; suite green.

- [ ] **Step 5: Commit**

```bash
git add functions/src firebase.json firestore.rules __tests__/functions/calendarFeed.test.ts
git commit -m "feat(calendar): private feed endpoint, link callables, account clean-up"
```

---

### Task 3: App — links, hook and the calendar sheet

**Files:**
- Create: `utils/calendarLinks.ts`, `__tests__/utils/calendarLinks.test.ts`, `services/calendar.ts`, `hooks/useCalendarFeed.ts`, `components/calendar/CalendarSheet.tsx`
- Modify: `app/settings/index.tsx` (Calendar row), `app/trip/[id].tsx` (Calendar chip)

**Interfaces:**
- Produces: `feedHttpsUrl(token)`, `feedWebcalUrl(token)`, `googleCalendarAddUrl(token)` (pure); `useCalendarFeed(): { token: string | null; types: CalTypes; isLoading: boolean; turnOn(): Promise<void>; rotate(): Promise<void>; turnOff(): Promise<void>; setType(k: keyof CalTypes, v: boolean): Promise<void> }`; `<CalendarSheet visible onClose />`

- [ ] **Step 1: Failing tests**

```ts
// __tests__/utils/calendarLinks.test.ts
import { feedHttpsUrl, feedWebcalUrl, googleCalendarAddUrl } from '@/utils/calendarLinks';

const T = 'abcdefghijklmnopqrstuvwx';
it('builds the feed, webcal and Google links', () => {
  expect(feedHttpsUrl(T)).toBe(`https://supernova-a2125.web.app/cal/${T}.ics`);
  expect(feedWebcalUrl(T)).toBe(`webcal://supernova-a2125.web.app/cal/${T}.ics`);
  expect(googleCalendarAddUrl(T)).toBe(`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(`webcal://supernova-a2125.web.app/cal/${T}.ics`)}`);
});
```

Run `npx jest __tests__/utils/calendarLinks.test.ts` → FAIL (module not found).

- [ ] **Step 2: Implement**

```ts
// utils/calendarLinks.ts
/** Links for the private calendar feed (spec 2026-10-19 §1). Pure. */
const HOST = 'supernova-a2125.web.app';
export const feedHttpsUrl = (token: string) => `https://${HOST}/cal/${token}.ics`;
export const feedWebcalUrl = (token: string) => `webcal://${HOST}/cal/${token}.ics`;
export const googleCalendarAddUrl = (token: string) =>
  `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(feedWebcalUrl(token))}`;
```

Run → PASS.

```ts
// services/calendar.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

export type CalTypes = { flights: boolean; stays: boolean; dining: boolean; transit: boolean; tripDays: boolean };
export const DEFAULT_CAL_TYPES: CalTypes = { flights: true, stays: true, dining: true, transit: true, tripDays: true };

export const createCalendarFeed = async () => (await httpsCallable<void, { token: string }>(functions, 'createCalendarFeed')()).data.token;
export const rotateCalendarFeed = async () => (await httpsCallable<void, { token: string }>(functions, 'rotateCalendarFeed')()).data.token;
export const disableCalendarFeed = async () => { await httpsCallable(functions, 'disableCalendarFeed')(); };
export const setCalendarTypes = async (types: Partial<CalTypes>) =>
  (await httpsCallable<{ types: Partial<CalTypes> }, { types: CalTypes }>(functions, 'setCalendarTypes')({ types })).data.types;
```

```ts
// hooks/useCalendarFeed.ts
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  createCalendarFeed, DEFAULT_CAL_TYPES, disableCalendarFeed, rotateCalendarFeed, setCalendarTypes, type CalTypes,
} from '@/services/calendar';

/** The user's calendar link and type switches (users/{uid}/private/calendar, owner-read). */
export function useCalendarFeed() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const qc = useQueryClient();
  const key = ['calendarFeed', uid];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!uid,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'users', uid!, 'private', 'calendar'));
      return {
        token: (snap.get('token') as string | undefined) ?? null,
        types: { ...DEFAULT_CAL_TYPES, ...((snap.get('types') as Partial<CalTypes>) ?? {}) },
      };
    },
  });
  const set = useCallback((next: { token: string | null; types: CalTypes }) => qc.setQueryData(key, next), [qc, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = data?.types ?? DEFAULT_CAL_TYPES;
  return {
    token: data?.token ?? null,
    types,
    isLoading,
    turnOn: useCallback(async () => set({ token: await createCalendarFeed(), types }), [set, types]),
    rotate: useCallback(async () => set({ token: await rotateCalendarFeed(), types }), [set, types]),
    turnOff: useCallback(async () => { await disableCalendarFeed(); set({ token: null, types: DEFAULT_CAL_TYPES }); }, [set]),
    setType: useCallback(async (k: keyof CalTypes, v: boolean) => {
      set({ token: data?.token ?? null, types: { ...types, [k]: v } }); // optimistic
      set({ token: data?.token ?? null, types: await setCalendarTypes({ [k]: v }) });
    }, [set, types, data?.token]),
  };
}
```

`components/calendar/CalendarSheet.tsx` — RN `Modal` (`presentationStyle="pageSheet"`, `animationType="slide"`), `useTheme()` tokens, `ScrollView`:
- Header: eyebrow `CALENDAR`, title "Your trips in your calendar", close button (`X`, `accessibilityLabel="Close"`).
- **Off** (`!token`): body "Flights, stays and each day of your trips, kept up to date in the calendar app you already use. Free." + one primary `Button` "Turn on" (`requireOnline()` first; Medium haptic; spinner while working; on error an inline sentence "Couldn't turn it on. Try again.").
- **On**: primary `Button` "Add to Apple Calendar" (iOS only → `Linking.openURL(feedWebcalUrl(token))`), secondary `Button` "Add to Google Calendar" (`Linking.openURL(googleCalendarAddUrl(token))`), text link "Copy link" (`Clipboard.setStringAsync(feedHttpsUrl(token))`, then label "Copied" for 2 s); section eyebrow `SHOW IN YOUR CALENDAR` with five `SettingsRow`s whose `accessory` is a `Switch`: Flights, Hotels & stays, Restaurants & activities, Trains, buses & ferries, Trip days; caption "Gmail or your airline may already add flights and hotels to your calendar. Turn them off here so nothing shows twice."; then text links "New link" (Alert: "The old link stops working. Calendars using it stop updating." → Cancel / "Make a new link") and "Turn off" (Alert: "Your calendar stops showing Supernova trips." → Cancel / "Turn off", destructive).
- Every write calls `requireOnline()` first; switches use Light haptics.

- [ ] **Step 3: Entry points**
  - `app/settings/index.tsx`: a `SettingsRow label="Calendar" icon={CalendarBlank}` (from `phosphor-react-native`) before Notifications, `value` "On"/"Off" from `useCalendarFeed().token`, `onPress` opens `<CalendarSheet>` (state in the screen).
  - `app/trip/[id].tsx`: in the chip row, after Packing, members only (`isOwner || isCollaborator`): a chip with `CalendarBlank` + "Calendar" (`accessibilityLabel="Add to calendar"`), Light haptic, opens `<CalendarSheet>`.

- [ ] **Step 4: Verify**

Run: `npx jest --silent && npx tsc --noEmit -p . && npm run lint -- --quiet`
Expected: green and clean. Run the supernova-design pre-ship checklist on `CalendarSheet` and report it.

- [ ] **Step 5: Commit**

```bash
git add utils/calendarLinks.ts __tests__/utils/calendarLinks.test.ts services/calendar.ts hooks/useCalendarFeed.ts components/calendar app/settings/index.tsx "app/trip/[id].tsx"
git commit -m "feat(calendar): calendar sheet in Settings and on trips"
```

---

### Task 4: Per-booking switch, privacy line, docs

**Files:**
- Create: `components/wallet/CalendarSwitchRow.tsx`
- Modify: `app/(wallet)/boarding-pass/[id].tsx`, `app/(wallet)/reservation/[id].tsx` (render the row), `types/index.ts` (`showInCalendar?: boolean` on `BoardingPass` and `Reservation`), `hosting/privacy.html`, `CLAUDE.md`, `docs/superpowers/specs/2026-10-19-calendar-feed-design.md` (trip entry = chip)

- [ ] **Step 1: The row**

```tsx
// components/wallet/CalendarSwitchRow.tsx
import React, { useCallback, useState } from 'react';
import { Switch } from 'react-native';
import * as Haptics from 'expo-haptics';
import { doc, updateDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarBlank } from 'phosphor-react-native';
import { db } from '@/services/firebase';
import { requireOnline } from '@/services/offline';
import { SettingsRow } from '@/components/settings/SettingsRow';

/** "Show in calendar" for one booking (calendar spec §3): off hides it from the user's calendar feed. */
export function CalendarSwitchRow({ kind, item }: { kind: 'boarding_pass' | 'reservation'; item: { id: string; showInCalendar?: boolean } }) {
  const qc = useQueryClient();
  const [on, setOn] = useState(item.showInCalendar !== false);
  const handleChange = useCallback(async (next: boolean) => {
    if (!requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setOn(next);
    try {
      await updateDoc(doc(db, kind === 'boarding_pass' ? 'boarding_passes' : 'reservations', item.id), { showInCalendar: next });
      qc.invalidateQueries({ queryKey: [kind === 'boarding_pass' ? 'boardingPasses' : 'reservations'] });
    } catch {
      setOn(!next);
    }
  }, [kind, item.id, qc]);
  return (
    <SettingsRow
      label="Show in calendar"
      icon={CalendarBlank}
      accessory={<Switch value={on} onValueChange={handleChange} accessibilityLabel="Show in calendar" />}
    />
  );
}
```

Render it on both detail screens directly below the existing `BookingTripRow` (owner's own items only — these screens are owner-only). Add `showInCalendar?: boolean` to both types.

- [ ] **Step 2: Privacy policy** — in "How long we keep it" (after the offline sentence): "If you turn on the calendar link, your trips and booking times are available at a private address you add to a calendar app. You can make a new link or turn it off at any time in Settings." Do not deploy without the owner's OK.

- [ ] **Step 3: CLAUDE.md** — a "Calendar feed" bullet under Cloud Functions (token docs, `/cal/**` rewrite, whitelisted fields, UTC vs floating vs all-day, stable UIDs, type switches + `showInCalendar`, deleteAccount) and the new files under Services/Hooks. Update the spec's §3 trip entry to the chip.

- [ ] **Step 4: Verify and commit**

Run: `npx jest --silent && npx tsc --noEmit -p . && (cd functions && npm run build)`
Expected: green.

```bash
git add components/wallet/CalendarSwitchRow.tsx "app/(wallet)" types/index.ts hosting/privacy.html CLAUDE.md docs/superpowers/specs/2026-10-19-calendar-feed-design.md
git commit -m "feat(calendar): show-in-calendar switch on bookings; privacy line; docs"
```

Deploy (needs the owner's OK; the functions are additive and safe before any app build): `firebase deploy --only functions:calendarFeed,functions:createCalendarFeed,functions:rotateCalendarFeed,functions:disableCalendarFeed,functions:setCalendarTypes,functions:deleteAccount,firestore:rules,hosting`.
