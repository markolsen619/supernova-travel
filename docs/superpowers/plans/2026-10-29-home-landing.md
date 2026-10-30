# Home Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home becomes a landing page (header with Wallet + Inbox, varied greeting, Today card / next trip / coming up / Get inspired) and the feed moves into Explore as a "From travelers" row that opens the full-screen feed.

**Architecture:** Decisions live in four pure, tested modules (`utils/homeState.ts`, `utils/todayCard.ts`, `utils/greeting.ts`, `utils/inboxBadge.ts`) fed by data the app already loads (`useOwnAndJoinedTrips`, `useTrip`, `useTripBookings`, `useDestinations`, `useFeed`). The current feed screen moves from `app/(tabs)/index.tsx` to a pushed route `app/feed.tsx`; `app/(tabs)/index.tsx` becomes the Home screen built from small `components/home/*` pieces. No server, rules or data changes.

**Tech Stack:** Expo SDK 54, Expo Router 6, React Native 0.81, TanStack Query 5, FlashList 2, expo-image, Phosphor icons, Jest.

**Spec:** `docs/superpowers/specs/2026-10-29-home-landing-design.md`

## Global Constraints

- Tabs stay Home · Explore · + · Globe · Profile; only the first tab's label changes, `Feed` → `Home` (the Globe tab keeps its existing label).
- Home header: splash logo (star + wordmark) left, white wordmark in dark mode, dark in light mode, star keeps its gradient; Wallet and one Inbox button right; sticky.
- Greeting bands: morning 5–11, afternoon 12–16, evening 17–21, late night 22–4; variant fixed per day, changes day to day; local language about one day in three while on a trip; no name → no name; sentence case, no "!".
- Get inspired whenever **0 or 1** trips are ahead (counting today's trip and undated ones).
- "Your trips" = own + joined (`useOwnAndJoinedTrips`); past trips never on Home.
- Two trips overlapping today → the one that started most recently is the Today card.
- Today card: up to 4 stops, next = first not visited by stop order; "Nothing planned today · Add a stop" when the day has none; city from the day's `destinationIndex`.
- Inbox badge = unread messages + unread notifications, label `9+` above 9; opens Messages when a conversation is unread, else Activity.
- From travelers = the 10 newest public posts, moderation-filtered; tap → `/feed?start={postId}`; hidden when empty; Share → `/add-to-feed`.
- Create tab gains "Share a photo or video" → `/add-to-feed`. Explore loses its wallet button.
- Design rules (CLAUDE.md, supernova-design): `useTheme()` colors only, Phosphor icons, ≥ 44 pt targets with labels, one primary action per screen, eyebrows, spring `tension 65 friction 11`, haptics (Light select, Medium create), light and dark themes, FlashList for long lists, no emoji.
- No new persisted query keys (offline: Home renders from what's already saved; Get inspired hides without the catalog).
- Commit trailer on every commit: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` / `Claude-Session: https://claude.ai/code/session_01GW6nHj9fLvq4aTve1m9fqj`.
- Never start an EAS build without the owner's go-ahead.

## Review Focus

1. **A trip whose `startDay` and `startDate` disagree or whose end is missing** (older trips, undated): Home must not crash and must not call it "today" wrongly — tested in Task 1.
2. **Today is past the last day document** (the trip's dates end later than its days, e.g. a day deleted): Today card still shows the city and "Nothing planned" — tested in Task 2.
3. **The feed opened with a `start` post that isn't in the first page** (deleted, hidden, older): the feed opens at the top instead of crashing or scrolling to a wrong page — tested in Task 5.
4. **Midnight and band edges** (04:59 vs 05:00, a phone in another time zone): the greeting uses the phone's local clock and never mixes bands — tested in Task 3.
5. **A user with no first name** (old accounts) or a name with spaces: greeting without a name / first word only — tested in Task 3.

---

### Task 1: Which trips Home shows (`utils/homeState.ts`)

**Files:**
- Create: `utils/homeState.ts`
- Test: `__tests__/utils/homeState.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface SpanTrip { startDay?: string | null; startDate?: { toDate(): Date } | null; endDate?: { toDate(): Date } | null }
  export function tripSpan(t: SpanTrip): { start: string | null; end: string | null }
  export interface HomeTrips<T> { today: T | null; next: T | null; comingUp: T[]; showInspired: boolean; isEmpty: boolean }
  export function homeTrips<T extends SpanTrip>(trips: T[], today: string): HomeTrips<T>
  export function daysBetween(a: string, b: string): number
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { daysBetween, homeTrips, tripSpan } from '@/utils/homeState';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T12:00:00`) });
const trip = (id: string, start: string | null, end: string | null) => ({ id, startDay: start, startDate: start ? ts(start) : null, endDate: end ? ts(end) : null });
const TODAY = '2026-10-29';

describe('tripSpan', () => {
  it('trusts startDay, else startDate; end from endDate, else the start', () => {
    expect(tripSpan(trip('a', '2026-11-18', '2026-11-24'))).toEqual({ start: '2026-11-18', end: '2026-11-24' });
    expect(tripSpan({ startDay: null, startDate: ts('2026-11-18'), endDate: null })).toEqual({ start: '2026-11-18', end: '2026-11-18' });
    expect(tripSpan({ startDay: 'garbage', startDate: ts('2026-11-18'), endDate: ts('2026-11-20') })).toEqual({ start: '2026-11-18', end: '2026-11-20' });
    expect(tripSpan({})).toEqual({ start: null, end: null });
  });
});

describe('homeTrips', () => {
  it('on a trip today: Today card, upcoming soonest first, undated last, past dropped', () => {
    const h = homeTrips([
      trip('past', '2026-09-01', '2026-09-05'),
      trip('later', '2027-02-01', '2027-02-10'),
      trip('undated', null, null),
      trip('now', '2026-10-27', '2026-11-02'),
      trip('soon', '2026-11-18', '2026-11-24'),
    ], TODAY);
    expect(h.today?.id).toBe('now');
    expect(h.next).toBeNull();
    expect(h.comingUp.map((t) => t.id)).toEqual(['soon', 'later', 'undated']);
    expect(h.showInspired).toBe(false);
  });
  it('not travelling: the soonest dated trip is next; Get inspired with 0 or 1 ahead', () => {
    const one = homeTrips([trip('soon', '2026-11-18', '2026-11-24')], TODAY);
    expect(one.next?.id).toBe('soon');
    expect(one.comingUp).toEqual([]);
    expect(one.showInspired).toBe(true);
    const two = homeTrips([trip('soon', '2026-11-18', '2026-11-24'), trip('later', '2027-02-01', '2027-02-10')], TODAY);
    expect(two.next?.id).toBe('soon');
    expect(two.comingUp.map((t) => t.id)).toEqual(['later']);
    expect(two.showInspired).toBe(false);
  });
  it('a trip ending today is still today; one that ended yesterday is past', () => {
    expect(homeTrips([trip('a', '2026-10-25', TODAY)], TODAY).today?.id).toBe('a');
    expect(homeTrips([trip('a', '2026-10-25', '2026-10-28')], TODAY).isEmpty).toBe(true);
  });
  it('two trips overlapping today: the one that started most recently is today', () => {
    const h = homeTrips([trip('long', '2026-10-01', '2026-11-30'), trip('weekend', '2026-10-28', '2026-10-30')], TODAY);
    expect(h.today?.id).toBe('weekend');
    expect(h.comingUp.map((t) => t.id)).toEqual(['long']);
  });
  it('only undated trips: no big card, they are coming up', () => {
    const h = homeTrips([trip('u', null, null)], TODAY);
    expect(h.today).toBeNull();
    expect(h.next).toBeNull();
    expect(h.comingUp.map((t) => t.id)).toEqual(['u']);
    expect(h.isEmpty).toBe(false);
    expect(h.showInspired).toBe(true);
  });
  it('nothing ahead: empty, with Get inspired', () => {
    expect(homeTrips([], TODAY)).toEqual({ today: null, next: null, comingUp: [], showInspired: true, isEmpty: true });
  });
});

it('daysBetween', () => {
  expect(daysBetween('2026-10-27', '2026-10-29')).toBe(2);
  expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across a daylight-saving change
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/homeState.test.ts`
Expected: FAIL — "Could not locate module @/utils/homeState"

- [ ] **Step 3: Write minimal implementation**

```ts
/**
 * Which of your trips Home shows (spec docs/superpowers/specs/2026-10-29-home-landing-design.md): today's trip,
 * the next one, the rest coming up (soonest first, undated last), and whether Get inspired fills the screen.
 */
import { toCalendarDate } from '@/utils/calendarDate';

export interface SpanTrip { startDay?: string | null; startDate?: { toDate(): Date } | null; endDate?: { toDate(): Date } | null }
export interface HomeTrips<T> { today: T | null; next: T | null; comingUp: T[]; showInspired: boolean; isEmpty: boolean }

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

/** Calendar start and end: the saved `startDay` when valid, else `startDate`; no end → the start. */
export function tripSpan(t: SpanTrip): { start: string | null; end: string | null } {
  const start = typeof t.startDay === 'string' && DAY.test(t.startDay) ? t.startDay : t.startDate ? toCalendarDate(t.startDate.toDate()) : null;
  const end = t.endDate ? toCalendarDate(t.endDate.toDate()) : start;
  return { start, end: end && start && end < start ? start : end };
}

export function homeTrips<T extends SpanTrip>(trips: T[], today: string): HomeTrips<T> {
  const spans = trips.map((t) => ({ t, ...tripSpan(t) }));
  const current = spans.filter((s) => s.start && s.end && s.start <= today && today <= s.end)
    .sort((a, b) => b.start!.localeCompare(a.start!));
  const upcoming = spans.filter((s) => s.start && s.start > today).sort((a, b) => a.start!.localeCompare(b.start!));
  const undated = spans.filter((s) => !s.start);
  const todayTrip = current[0]?.t ?? null;
  const otherCurrent = current.slice(1).map((s) => s.t);
  const next = todayTrip ? null : (upcoming[0]?.t ?? null);
  const comingUp = [...otherCurrent, ...upcoming.map((s) => s.t).filter((t) => t !== next), ...undated.map((s) => s.t)];
  const ahead = (todayTrip ? 1 : 0) + (next ? 1 : 0) + comingUp.length;
  return { today: todayTrip, next, comingUp, showInspired: ahead <= 1, isEmpty: ahead === 0 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/homeState.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/homeState.ts __tests__/utils/homeState.test.ts
git commit -m "feat(home): which trips Home shows"
```

---

### Task 2: The Today card's content (`utils/todayCard.ts`)

**Files:**
- Create: `utils/todayCard.ts`
- Test: `__tests__/utils/todayCard.test.ts`

**Interfaces:**
- Consumes: `daysBetween`, `tripSpan` (Task 1); `bookingsByDay`, `DayBooking` from `@/utils/bookingDays`; `TripBooking`.
- Produces:
  ```ts
  export interface TodayStop { id: string; title: string; visited: boolean; next: boolean }
  export interface TodayInfo { dayNumber: number; totalDays: number; dayId: string | null; city: string | null; stops: TodayStop[]; nothingPlanned: boolean }
  export function todayInfo(trip: TodayTrip, today: string): TodayInfo | null
  export function countdownLabel(start: string, today: string): string   // "TOMORROW" | "IN 20 DAYS"
  export function todaysBooking(bookings: TripBooking[], today: string): DayBooking | null
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { countdownLabel, todayInfo, todaysBooking } from '@/utils/todayCard';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T12:00:00`) });
const act = (id: string, order: number, visited = false) => ({ id, title: `Stop ${id}`, order, visited });
const cities = { destination: { name: 'Prague' }, additionalDestinations: [{ name: 'Budapest' }, { name: 'Vienna' }] };

// The owner's Europe trip shape: many days, cities by destinationIndex, most days empty, no times.
const europe = {
  ...cities, startDay: '2026-11-18', startDate: ts('2026-11-18'), endDate: ts('2026-11-25'),
  days: [
    { id: 'd1', dayNumber: 1, destinationIndex: 0, activities: [act('a', 0)] },
    { id: 'd2', dayNumber: 2, destinationIndex: 0, activities: [] },
    { id: 'd4', dayNumber: 4, destinationIndex: 1, activities: [act('b', 1000, true), act('c', 2000), act('d', 3000)] },
    { id: 'd8', dayNumber: 8, destinationIndex: 2, activities: [] },
  ],
};

describe('todayInfo', () => {
  it('a day with stops: number, city, stops in order, next = first not visited', () => {
    expect(todayInfo(europe, '2026-11-21')).toEqual({
      dayNumber: 4, totalDays: 8, dayId: 'd4', city: 'Budapest', nothingPlanned: false,
      stops: [
        { id: 'b', title: 'Stop b', visited: true, next: false },
        { id: 'c', title: 'Stop c', visited: false, next: true },
        { id: 'd', title: 'Stop d', visited: false, next: false },
      ],
    });
  });
  it('an empty day: nothing planned, still its city', () => {
    const t = todayInfo(europe, '2026-11-19')!;
    expect([t.dayNumber, t.city, t.nothingPlanned, t.stops]).toEqual([2, 'Prague', true, []]);
  });
  it('a date with no day document (deleted day): nothing planned, the trip city', () => {
    const t = todayInfo(europe, '2026-11-20')!;
    expect([t.dayNumber, t.dayId, t.city, t.nothingPlanned]).toEqual([3, null, 'Prague', true]);
  });
  it('more than 4 stops: a window of 4 around the next one', () => {
    const many = { ...europe, days: [{ id: 'x', dayNumber: 1, destinationIndex: 0, activities: [0, 1, 2, 3, 4, 5, 6].map((i) => act(`s${i}`, i, i < 5)) }] };
    expect(todayInfo(many, '2026-11-18')!.stops.map((s) => s.id)).toEqual(['s3', 's4', 's5', 's6']);
  });
  it('all visited: no stop is next', () => {
    const done = { ...europe, days: [{ id: 'x', dayNumber: 1, destinationIndex: 0, activities: [act('a', 0, true)] }] };
    expect(todayInfo(done, '2026-11-18')!.stops[0].next).toBe(false);
  });
  it('outside the trip, or undated: null', () => {
    expect(todayInfo(europe, '2026-11-26')).toBeNull();
    expect(todayInfo({ ...europe, startDay: null, startDate: null }, '2026-11-20')).toBeNull();
  });
});

it('countdownLabel', () => {
  expect(countdownLabel('2026-10-30', '2026-10-29')).toBe('TOMORROW');
  expect(countdownLabel('2026-11-18', '2026-10-29')).toBe('IN 20 DAYS');
});

describe('todaysBooking', () => {
  const flight = { kind: 'boarding_pass', item: { id: 'f', flightNumber: 'TP204', origin: 'LIS', destination: 'OPO', departureTime: '2026-10-29T13:20:00Z', localDate: '2026-10-29' } };
  const hotel = { kind: 'reservation', item: { id: 'h', type: 'hotel', title: 'Hotel Lisboa', checkIn: '2026-10-27', checkOut: '2026-10-31' } };
  it('a flight today wins over a hotel stay', () => {
    expect(todaysBooking([hotel, flight] as never, '2026-10-29')?.booking.item.id).toBe('f');
  });
  it('else the stay, else null', () => {
    expect(todaysBooking([hotel] as never, '2026-10-29')?.role).toBe('staying');
    expect(todaysBooking([] as never, '2026-10-29')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/todayCard.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
/** The Today card on Home (spec 2026-10-29): day N of M, today's city, up to 4 stops with the next unvisited, today's booking. */
import { bookingsByDay, type DayBooking } from '@/utils/bookingDays';
import { daysBetween, tripSpan, type SpanTrip } from '@/utils/homeState';
import type { TripBooking } from '@/utils/bookingDays';

export interface TodayStop { id: string; title: string; visited: boolean; next: boolean }
export interface TodayInfo { dayNumber: number; totalDays: number; dayId: string | null; city: string | null; stops: TodayStop[]; nothingPlanned: boolean }
export interface TodayTrip extends SpanTrip {
  destination?: { name?: string | null } | null;
  additionalDestinations?: { name?: string | null }[] | null;
  days: { id: string; dayNumber: number; destinationIndex?: number | null; activities: { id: string; title: string; order: number; visited?: boolean }[] }[];
}

const MAX_STOPS = 4;

export function todayInfo(trip: TodayTrip, today: string): TodayInfo | null {
  const { start, end } = tripSpan(trip);
  if (!start || !end || today < start || today > end) return null;
  const dayNumber = daysBetween(start, today) + 1;
  const totalDays = daysBetween(start, end) + 1;
  const day = trip.days.find((d) => d.dayNumber === dayNumber) ?? null;
  const cities = [trip.destination, ...(trip.additionalDestinations ?? [])];
  const city = cities[day?.destinationIndex ?? 0]?.name ?? trip.destination?.name ?? null;
  const ordered = [...(day?.activities ?? [])].sort((a, b) => a.order - b.order);
  const nextIdx = ordered.findIndex((a) => !a.visited);
  const from = ordered.length <= MAX_STOPS ? 0 : Math.max(0, Math.min((nextIdx < 0 ? ordered.length : nextIdx) - 1, ordered.length - MAX_STOPS));
  const stops = ordered.slice(from, from + MAX_STOPS).map((a) => ({ id: a.id, title: a.title, visited: a.visited === true, next: a.id === ordered[nextIdx]?.id }));
  return { dayNumber, totalDays, dayId: day?.id ?? null, city, stops, nothingPlanned: ordered.length === 0 };
}

export function countdownLabel(start: string, today: string): string {
  const n = daysBetween(today, start);
  return n === 1 ? 'TOMORROW' : `IN ${n} DAYS`;
}

const ROLE_RANK: Record<string, number> = { flight: 0, booked: 1, check_in: 2, check_out: 3, staying: 4 };

/** The one booking for today's card: a flight first, then a ticket or table, then hotel moves. */
export function todaysBooking(bookings: TripBooking[], today: string): DayBooking | null {
  const [y, m, d] = today.split('-').map(Number);
  const list = bookingsByDay([{ id: 'today', date: new Date(y, m - 1, d, 12) }], bookings).today ?? [];
  return [...list].sort((a, b) => (ROLE_RANK[a.role] ?? 9) - (ROLE_RANK[b.role] ?? 9))[0] ?? null;
}
```

Check before writing: `TripBooking` is exported from `@/utils/bookingDays` (`grep -n "export type TripBooking\|export interface TripBooking" utils/*.ts`); import it from wherever it lives. `bookingsByDay` reads `day.date` with `toCalendarDate` (local midnight) — a noon local `Date` is safe.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/todayCard.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add utils/todayCard.ts __tests__/utils/todayCard.test.ts
git commit -m "feat(home): the Today card's day, city, stops and booking"
```

---

### Task 3: Greetings (`utils/greeting.ts`)

**Files:**
- Create: `utils/greeting.ts`
- Test: `__tests__/utils/greeting.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Band = 'morning' | 'afternoon' | 'evening' | 'night'
  export function band(hour: number): Band
  export function firstName(displayName: string | null | undefined): string | null
  export function greeting(o: { name: string | null; now: Date; countryCode?: string | null }): string
  ```

- [ ] **Step 1: Write the failing test**

```ts
import { band, firstName, greeting } from '@/utils/greeting';

const at = (iso: string) => new Date(iso); // local time (no Z)

describe('band', () => {
  it('edges', () => {
    expect([band(4), band(5), band(11), band(12), band(16), band(17), band(21), band(22), band(0)])
      .toEqual(['night', 'morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
  });
});

describe('greeting', () => {
  it('the same all day within a band', () => {
    expect(greeting({ name: 'Mark', now: at('2026-10-29T07:00:00') })).toBe(greeting({ name: 'Mark', now: at('2026-10-29T10:59:00') }));
  });
  it('varies from day to day', () => {
    const week = Array.from({ length: 10 }, (_, i) => greeting({ name: 'Mark', now: new Date(2026, 9, 20 + i, 8) }));
    expect(new Set(week).size).toBeGreaterThan(1);
  });
  it('always names the person and never shouts', () => {
    for (let i = 0; i < 30; i++) {
      const g = greeting({ name: 'Mark', now: new Date(2026, 9, i + 1, 8 + (i % 14)) });
      expect(g).toContain('Mark');
      expect(g).not.toContain('!');
    }
  });
  it('no name: a greeting without one', () => {
    const g = greeting({ name: null, now: at('2026-10-29T08:00:00') });
    expect(g).not.toMatch(/,\s*$/);
    expect(g).not.toContain('null');
  });
  it('on a trip in Portugal, some mornings say Bom dia; unknown countries stay English', () => {
    const days = Array.from({ length: 12 }, (_, i) => greeting({ name: 'Mark', now: new Date(2026, 10, 1 + i, 8), countryCode: 'PT' }));
    expect(days.some((g) => g.startsWith('Bom dia'))).toBe(true);
    expect(days.some((g) => !g.startsWith('Bom dia'))).toBe(true);
    const zz = Array.from({ length: 12 }, (_, i) => greeting({ name: 'Mark', now: new Date(2026, 10, 1 + i, 8), countryCode: 'ZZ' }));
    expect(zz.every((g) => /^[A-Z][a-z]/.test(g) && !g.startsWith('Bom'))).toBe(true);
  });
});

it('firstName', () => {
  expect(firstName('Mark Olsen')).toBe('Mark');
  expect(firstName('  ')).toBeNull();
  expect(firstName(null)).toBeNull();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/greeting.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
/** Home's greeting (owner, 2026-10-29): varied per day, sometimes in the trip's local language. Sentence case, no "!". */
export type Band = 'morning' | 'afternoon' | 'evening' | 'night';

export function band(hour: number): Band {
  if (hour >= 5 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 16) return 'afternoon';
  if (hour >= 17 && hour <= 21) return 'evening';
  return 'night';
}

// "{n}" is the first name; a phrasing ending in "?" keeps it (no "!").
const EN: Record<Band, string[]> = {
  morning: ['Morning, {n}', 'Good morning, {n}', 'Rise and shine, {n}', 'Fresh start, {n}'],
  afternoon: ['Afternoon, {n}', 'Good afternoon, {n}', "Hope the day's going well, {n}"],
  evening: ['Evening, {n}', 'Good evening, {n}', 'Winding down, {n}?'],
  night: ['Night owl, {n}?', 'Still up, {n}?', 'Evening, {n}'],
};
const EN_NO_NAME: Record<Band, string> = { morning: 'Good morning', afternoon: 'Good afternoon', evening: 'Good evening', night: 'Good evening' };

// Local greetings by the trip city's country: [morning, afternoon, evening/night].
const LOCAL: Record<string, [string, string, string]> = {
  PT: ['Bom dia', 'Boa tarde', 'Boa noite'], BR: ['Bom dia', 'Boa tarde', 'Boa noite'],
  ES: ['Buenos días', 'Buenas tardes', 'Buenas noches'], MX: ['Buenos días', 'Buenas tardes', 'Buenas noches'],
  FR: ['Bonjour', 'Bonjour', 'Bonsoir'], BE: ['Bonjour', 'Bonjour', 'Bonsoir'],
  IT: ['Buongiorno', 'Buon pomeriggio', 'Buonasera'], DE: ['Guten Morgen', 'Guten Tag', 'Guten Abend'],
  AT: ['Guten Morgen', 'Guten Tag', 'Guten Abend'], NL: ['Goedemorgen', 'Goedemiddag', 'Goedenavond'],
  IE: ['Dia duit', 'Dia duit', 'Dia duit'], CZ: ['Dobré ráno', 'Dobrý den', 'Dobrý večer'],
  HU: ['Jó reggelt', 'Jó napot', 'Jó estét'], JP: ['Ohayō', "Kon'nichiwa", 'Konbanwa'],
  GR: ['Kaliméra', 'Kaliméra', 'Kalispéra'], TR: ['Günaydın', 'İyi günler', 'İyi akşamlar'],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function firstName(displayName: string | null | undefined): string | null {
  const first = displayName?.trim().split(/\s+/)[0];
  return first ? first : null;
}

export function greeting(o: { name: string | null; now: Date; countryCode?: string | null }): string {
  const b = band(o.now.getHours());
  const day = `${o.now.getFullYear()}-${o.now.getMonth() + 1}-${o.now.getDate()}`;
  const local = o.countryCode ? LOCAL[o.countryCode.toUpperCase()] : undefined;
  if (local && hash(`local:${day}`) % 3 === 0) {
    const word = local[b === 'morning' ? 0 : b === 'afternoon' ? 1 : 2];
    return o.name ? `${word}, ${o.name}` : word;
  }
  if (!o.name) return EN_NO_NAME[b];
  const options = EN[b];
  return options[hash(`${day}:${b}`) % options.length].replace('{n}', o.name);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/greeting.test.ts`
Expected: PASS (7 tests). If "on a trip in Portugal" fails because no day in the 12 hit `% 3 === 0`, widen the test window to 20 days rather than changing the rate (one in three is the spec).

- [ ] **Step 5: Commit**

```bash
git add utils/greeting.ts __tests__/utils/greeting.test.ts
git commit -m "feat(home): varied greetings, sometimes in the trip's language"
```

---

### Task 4: The Inbox badge and which tab it opens

**Files:**
- Create: `utils/inboxBadge.ts`, `hooks/useInboxBadge.ts`
- Modify: `app/notifications.tsx:77-90` (open on a requested tab)
- Test: `__tests__/utils/inboxBadge.test.ts`

**Interfaces:**
- Consumes: `isThreadUnread` (`@/utils/dm`), `DmThread`.
- Produces:
  ```ts
  export function badgeLabel(count: number): string | null   // null | "3" | "9+"
  export function inboxTab(unreadMessages: number): 'messages' | 'activity'
  export function useInboxBadge(): { messages: number; notifications: number; total: number }
  ```
  `/notifications?tab=messages` opens on Messages.

- [ ] **Step 1: Write the failing test**

```ts
import { badgeLabel, inboxTab } from '@/utils/inboxBadge';

it('badgeLabel', () => {
  expect([badgeLabel(0), badgeLabel(3), badgeLabel(9), badgeLabel(10), badgeLabel(42)]).toEqual([null, '3', '9', '9+', '9+']);
});
it('inboxTab: Messages when a conversation is unread', () => {
  expect(inboxTab(2)).toBe('messages');
  expect(inboxTab(0)).toBe('activity');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/inboxBadge.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement**

`utils/inboxBadge.ts`:

```ts
/** Home's Inbox button (spec 2026-10-29): one count for unread messages and notifications, "9+" above 9. */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

export function inboxTab(unreadMessages: number): 'messages' | 'activity' {
  return unreadMessages > 0 ? 'messages' : 'activity';
}
```

`hooks/useInboxBadge.ts` (same data as `useHasUnreadActivity`, counted; at most 10 of each are read):

```ts
import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isThreadUnread } from '@/utils/dm';
import type { DmThread } from '@/types';

async function counts(uid: string): Promise<{ messages: number; notifications: number }> {
  const [notifs, threads, user] = await Promise.all([
    getDocs(query(collection(db, 'users', uid, 'notifications'), where('read', '==', false), limit(10))),
    getDocs(query(collection(db, 'dmThreads'), where('participants', 'array-contains', uid), orderBy('lastMessageAt', 'desc'), limit(10))),
    getDoc(doc(db, 'users', uid)),
  ]);
  const seen = user.data()?.lastMessagesSeenAt;
  const seenMs = seen ? seen.toMillis() : null;
  const messages = threads.docs.filter((t) => isThreadUnread(t.data() as DmThread, uid, seenMs)).length;
  return { messages, notifications: notifs.size };
}

/** Unread messages and notifications for Home's Inbox button. Same queries as useHasUnreadActivity, counted. */
export function useInboxBadge(): { messages: number; notifications: number; total: number } {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { data } = useQuery({ queryKey: ['inboxBadge', uid], queryFn: () => counts(uid), enabled: !!uid, staleTime: 30 * 1000 });
  const messages = data?.messages ?? 0;
  const notifications = data?.notifications ?? 0;
  return { messages, notifications, total: messages + notifications };
}
```

`useMarkMessagesSeen` and wherever notifications are marked read must also invalidate `['inboxBadge', uid]`: in `hooks/useUnreadActivity.ts` `useMarkMessagesSeen.onSuccess` add `queryClient.invalidateQueries({ queryKey: ['inboxBadge', uid] });`, and find the notifications "mark read" mutation (`grep -rn "read: true" hooks app/notifications.tsx`) and add the same invalidation next to its `hasUnreadActivity` invalidation.

`app/notifications.tsx`: read a `tab` param and start there:

```tsx
  const { highlight, tab: tabParam } = useLocalSearchParams<{ highlight?: string; tab?: string }>();
  const [tab, setTab] = useState<'Activity' | 'Messages'>(tabParam === 'messages' && !highlight ? 'Messages' : 'Activity');
```

(replace the existing `useState<'Activity' | 'Messages'>('Activity')` and the existing `useLocalSearchParams<{ highlight?: string }>()` line; keep the highlight effect, which still switches to Activity.)

- [ ] **Step 4: Run tests and type check**

Run: `npx jest __tests__/utils/inboxBadge.test.ts && npx tsc --noEmit -p .`
Expected: PASS, no type errors

- [ ] **Step 5: Commit**

```bash
git add utils/inboxBadge.ts hooks/useInboxBadge.ts hooks/useUnreadActivity.ts app/notifications.tsx __tests__/utils/inboxBadge.test.ts
git commit -m "feat(home): Inbox badge count and opening on the tab that needs you"
```

---

### Task 5: The feed becomes its own page (`app/feed.tsx`)

**Files:**
- Move: `app/(tabs)/index.tsx` → `app/feed.tsx` (`git mv`)
- Modify: `app/feed.tsx` (start param, header: back + logo + Share; no tabPress listener)
- Modify: `utils/feedMix.ts` (export `feedItemKey`, add `feedStartIndex`)
- Modify: `app/_layout.tsx` (register `feed`)
- Test: `__tests__/utils/feedMix.test.ts` (append)

**Interfaces:**
- Produces: `export const feedItemKey(item: FeedItem<{ id: string }>): string`; `export function feedStartIndex(items: FeedItem<{ id: string }>[], postId: string | null | undefined): number` (0 when missing); route `/feed?start={postId}`.

- [ ] **Step 1: Write the failing test** (append)

```ts
import { feedItemKey, feedStartIndex } from '@/utils/feedMix';

describe('feedStartIndex (Explore → the feed at a post)', () => {
  const items = [
    { kind: 'post', post: { id: 'p1' } }, { kind: 'trip', trip: { id: 't1' } }, { kind: 'post', post: { id: 'p2' } },
  ] as never[];
  it('finds the post', () => expect(feedStartIndex(items, 'p2')).toBe(2));
  it('a post not in the list (deleted, hidden, older): the top', () => {
    expect(feedStartIndex(items, 'gone')).toBe(0);
    expect(feedStartIndex(items, undefined)).toBe(0);
  });
  it('keys', () => expect(items.map(feedItemKey)).toEqual(['post:p1', 'trip:t1', 'post:p2']));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/feedMix.test.ts`
Expected: FAIL — "feedStartIndex is not a function"

- [ ] **Step 3: Implement the helpers** in `utils/feedMix.ts`:

```ts
/** A feed page's stable key (moved from the feed screen so Explore's links and the feed agree). */
export const feedItemKey = (item: FeedItem<{ id: string }>): string =>
  item.kind === 'post' ? `post:${item.post.id}` : item.kind === 'trip' ? `trip:${item.trip.id}` : 'suggestions';

/** Where the feed opens from Explore: the tapped post, or the top when it isn't loaded (deleted, hidden, older). */
export function feedStartIndex(items: FeedItem<{ id: string }>[], postId: string | null | undefined): number {
  if (!postId) return 0;
  const i = items.findIndex((it) => it.kind === 'post' && it.post.id === postId);
  return i < 0 ? 0 : i;
}
```

Check `FeedItem`'s shape in `utils/feedMix.ts` (`grep -n "export type FeedItem" -A4 utils/feedMix.ts`) and type the helpers against it.

Run: `npx jest __tests__/utils/feedMix.test.ts` → Expected: PASS

- [ ] **Step 4: Move and adapt the screen**

```bash
git mv "app/(tabs)/index.tsx" app/feed.tsx
```

In `app/feed.tsx`:
- Rename the component `FeedScreen` (already) and delete the local `const feedItemKey = …` (import it from `@/utils/feedMix` with `feedStartIndex`).
- Delete the `navigation.addListener('tabPress' …)` effect and the now-unused `useNavigation`/`useQueryClient` imports (a pushed screen has no tab press).
- Read the start post and scroll there once the list has items:

```tsx
  const { start } = useLocalSearchParams<{ start?: string }>();
  const startedAt = useRef(false);
  useEffect(() => {
    if (startedAt.current || isLoading || items.length === 0) return;
    startedAt.current = true;
    const index = feedStartIndex(items, start);
    if (index > 0) requestAnimationFrame(() => listRef.current?.scrollToIndex({ index, animated: false }));
  }, [isLoading, items, start]);
```

- Header: left button becomes **back** (`CaretLeft`, `accessibilityLabel="Back"`, `router.back()`), centre logo unchanged, right button becomes **Share** (`Plus`, `accessibilityLabel="Share a photo or video"`, `/add-to-feed`). Remove the heart/notifications button and `useHasUnreadActivity` (the Inbox now lives on Home).
- Empty state stays ("Your feed starts here" / Share a moment).

In `app/_layout.tsx`, next to the other full-screen pushes, add: `<Stack.Screen name="feed" />` (default push presentation, header hidden by the stack's screenOptions).

- [ ] **Step 5: Type check, test, commit**

Run: `npx tsc --noEmit -p . && npx jest __tests__/utils/feedMix.test.ts`
Expected: no errors (the tabs layout still lists `index`; Task 8 creates the new Home there — until then `npx tsc` passes because Expo Router resolves routes at runtime), PASS

```bash
git add app/feed.tsx app/_layout.tsx utils/feedMix.ts __tests__/utils/feedMix.test.ts
git commit -m "feat(feed): the feed is its own page, opened at a post"
```

---

### Task 6: Explore's From travelers row; no wallet button

**Files:**
- Create: `components/explore/FromTravelersRow.tsx`, `utils/postTile.ts`
- Modify: `app/(tabs)/explore.tsx` (row at the top; remove `handleWalletPress` and its button)
- Test: `__tests__/utils/postTile.test.ts`

**Interfaces:**
- Consumes: `useFeed('forYou')`, `useModeration`, `filterVisible`, `contentKey`, `gridImageUrl` (`@/utils/postImages`).
- Produces: `export function postTileLabel(p: { authorDisplayName?: string | null; placeName?: string | null }): string`; `export function fromTravelers<T>(posts: T[], n?: number): T[]`.

- [ ] **Step 1: Write the failing test**

```ts
import { fromTravelers, postTileLabel } from '@/utils/postTile';

it('postTileLabel: first name · place, either alone, never empty', () => {
  expect(postTileLabel({ authorDisplayName: 'Kuba Czerwinski', placeName: 'Brussels' })).toBe('Kuba · Brussels');
  expect(postTileLabel({ authorDisplayName: 'Kuba', placeName: null })).toBe('Kuba');
  expect(postTileLabel({ authorDisplayName: '', placeName: 'Paris' })).toBe('Paris');
  expect(postTileLabel({})).toBe('A traveler');
});
it('fromTravelers: the 10 newest', () => {
  expect(fromTravelers(Array.from({ length: 14 }, (_, i) => i))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/postTile.test.ts` → Expected: FAIL — module not found

- [ ] **Step 3: Implement** `utils/postTile.ts`:

```ts
/** Explore's From travelers tiles (spec 2026-10-29). */
import { firstName } from '@/utils/greeting';

export function postTileLabel(p: { authorDisplayName?: string | null; placeName?: string | null }): string {
  const parts = [firstName(p.authorDisplayName), p.placeName?.trim() || null].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : 'A traveler';
}

export function fromTravelers<T>(posts: T[], n = 10): T[] {
  return posts.slice(0, n);
}
```

Run: `npx jest __tests__/utils/postTile.test.ts` → Expected: PASS

- [ ] **Step 4: The row component** `components/explore/FromTravelersRow.tsx`:

```tsx
/** "From travelers" on Explore (spec 2026-10-29): the newest public posts; a tap opens the feed at that post. */
import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Play } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useFeed } from '@/hooks/useFeed';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { gridImageUrl } from '@/utils/postImages';
import { fromTravelers, postTileLabel } from '@/utils/postTile';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { Post } from '@/types';

export const FromTravelersRow = memo(function FromTravelersRow() {
  const { colors } = useTheme();
  const { data } = useFeed('forYou');
  const moderation = useModeration();
  const posts = useMemo(() => fromTravelers(filterVisible(data?.pages.flatMap((p) => p.posts) ?? [], moderation, (post: Post) => ({
    authorUid: post.authorUid, key: contentKey({ type: 'post', id: post.id }), moderationHidden: post.moderationHidden,
  }))), [data, moderation]);
  const open = useCallback((id: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/feed', params: { start: id } }); }, []);
  const share = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/add-to-feed'); }, []);
  if (posts.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text.primary }]}>From travelers</Text>
        <Pressable onPress={share} hitSlop={10} style={styles.link} accessibilityRole="button" accessibilityLabel="Share a photo or video">
          <Text style={[styles.linkText, { color: colors.brand.purple }]}>Share</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {posts.map((p) => (
          <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="button" accessibilityLabel={`${p.mediaType === 'video' ? 'Video' : 'Photo'} by ${postTileLabel(p)}`}>
            <Image source={{ uri: gridImageUrl(p) ?? undefined }} style={[styles.tile, { backgroundColor: colors.background.sunken }]} contentFit="cover" />
            {p.mediaType === 'video' && <View style={styles.play}><Play size={10} weight="fill" color="#fff" /></View>}
            <Text style={styles.caption} numberOfLines={1}>{postTileLabel(p)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: Spacing['2'], marginTop: Spacing['4'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing['5'] },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  row: { gap: Spacing['2'], paddingHorizontal: Spacing['5'] },
  tile: { width: 112, height: 168, borderRadius: 14 },
  play: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 8, right: 8, bottom: 8, color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.medium, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
});
```

(The caption sits on the photo, so it's white with a shadow in both themes — like `DestinationCard`'s captions.)

`app/(tabs)/explore.tsx`: render `<FromTravelersRow />` directly under the screen title, above the destination chips; remove `handleWalletPress` and the header button that uses it (and its icon import if unused).

- [ ] **Step 5: Type check, lint, commit**

Run: `npx tsc --noEmit -p . && npx eslint "app/(tabs)/explore.tsx" components/explore/FromTravelersRow.tsx`
Expected: no errors

```bash
git add utils/postTile.ts __tests__/utils/postTile.test.ts components/explore/FromTravelersRow.tsx "app/(tabs)/explore.tsx"
git commit -m "feat(explore): From travelers opens the feed; wallet button leaves Explore"
```

---

### Task 7: Create tab — "Share a photo or video"

**Files:**
- Modify: `app/(tabs)/create.tsx:42-60` (`secondaryOptions`)

- [ ] **Step 1: Add the option** (import `Camera` from `phosphor-react-native`), after the past-trip option:

```ts
    {
      Icon: Camera,
      iconColor: colors.accent.teal,
      title: 'Share a photo or video',
      description: 'Post a moment to Explore',
      onPress: () => router.push('/add-to-feed'),
    },
```

- [ ] **Step 2: Type check and commit**

Run: `npx tsc --noEmit -p .` → Expected: no errors

```bash
git add "app/(tabs)/create.tsx"
git commit -m "feat(create): share a photo or video from the Create tab"
```

---

### Task 8: The Home screen

**Files:**
- Create: `app/(tabs)/index.tsx` (Home)
- Create: `components/home/HomeHeader.tsx`, `components/home/TodayCard.tsx`, `components/home/NextTripCard.tsx`, `components/home/TripRow.tsx`, `components/home/InspiredStrip.tsx`, `components/home/PlanCard.tsx`
- Modify: `app/(tabs)/_layout.tsx:23` (label `Feed` → `Home`)

**Interfaces:**
- Consumes: `homeTrips`, `tripSpan` (T1), `todayInfo`, `countdownLabel`, `todaysBooking` (T2), `greeting`, `firstName` (T3), `useInboxBadge`, `badgeLabel`, `inboxTab` (T4); `useOwnAndJoinedTrips`, `useTrip`, `useTripBookings`, `useDestinations`, `useUserStore`, `bookingLines`, `toCalendarDate`.

- [ ] **Step 1: `components/home/HomeHeader.tsx`**

```tsx
/** Home's sticky header (spec 2026-10-29): the splash star + wordmark, Wallet, Inbox with one badge. */
import { memo, useCallback } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Bell, Wallet } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useInboxBadge } from '@/hooks/useInboxBadge';
import { badgeLabel, inboxTab } from '@/utils/inboxBadge';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export const HomeHeader = memo(function HomeHeader({ topInset }: { topInset: number }) {
  const { colors } = useTheme();
  const badge = useInboxBadge();
  const label = badgeLabel(badge.total);
  const wallet = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push('/(wallet)'); }, []);
  const inbox = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push({ pathname: '/notifications', params: { tab: inboxTab(badge.messages) } }); }, [badge.messages]);
  return (
    <View style={[styles.bar, { paddingTop: topInset + Spacing['2'], backgroundColor: colors.background.primary, borderBottomColor: colors.background.cardBorder }]}>
      <View style={styles.logo} accessible accessibilityLabel="Supernova">
        <Image source={require('@/assets/images/SupernovaStar.png')} style={styles.star} resizeMode="contain" />
        <Text style={[styles.word, { color: colors.text.primary }]}>Supernova</Text>
      </View>
      <View style={styles.buttons}>
        <Pressable onPress={wallet} style={[styles.btn, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel="Wallet">
          <Wallet size={20} color={colors.text.primary} />
        </Pressable>
        <Pressable onPress={inbox} style={[styles.btn, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel={label ? `Inbox, ${label} unread` : 'Inbox'}>
          <Bell size={20} color={colors.text.primary} />
          {label && <View style={[styles.badge, { backgroundColor: colors.brand.pink }]}><Text style={styles.badgeText}>{label}</Text></View>}
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing['5'], paddingBottom: Spacing['2'], borderBottomWidth: StyleSheet.hairlineWidth },
  logo: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  star: { width: 28, height: 28 },
  word: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold, letterSpacing: -0.3 },
  buttons: { flexDirection: 'row', gap: Spacing['2'] },
  btn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', top: 4, right: 2, minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: FontWeight.bold },
});
```

Check the star asset crops cleanly at 28 pt (`assets/images/SupernovaStar.png` is the gradient star alone); the wordmark is text in the theme's primary colour, so it's white in dark mode and dark in light mode (spec).

- [ ] **Step 2: `components/home/TodayCard.tsx`, `NextTripCard.tsx`, `TripRow.tsx`, `InspiredStrip.tsx`, `PlanCard.tsx`**

Each is a small presentational component taking already-computed data. Shared look: card radius 20, `colors.background.card` fill, no border plus shadow (one treatment), eyebrow 11 pt uppercase tracked `colors.text.tertiary`, title 17–20 pt semibold, cover photo via `expo-image` (trip `coverImageUrl`, falling back to a `colors.background.sunken` block — never a Places call).

```tsx
// TodayCard: props { trip: Trip; info: TodayInfo; booking: DayBooking | null }
//  - cover 140 pt with a pill "TODAY · DAY {info.dayNumber} OF {info.totalDays}"
//  - title: info.city ?? trip.title; subtitle: trip.title when the city is shown
//  - stops: for each info.stops → dot (purple ring when next) + title (primary when next, secondary otherwise, struck-through look via muted colour when visited)
//  - info.nothingPlanned → row "Nothing planned today" + text button "Add a stop" → router.push({ pathname: '/trip/[id]', params: { id: trip.id } })
//  - booking → a sunken row with bookingLines(booking).title / .detail; tap → wallet detail:
//      booking.booking.kind === 'boarding_pass' ? `/(wallet)/boarding-pass/${id}` : `/(wallet)/reservation/${id}`
//  - whole card pressable → `/trip/${trip.id}`; accessibilityLabel `Today in ${city}, day N of M`
// NextTripCard: props { trip: Trip; label: string; booking: DayBooking | null } — cover, pill = label ("IN 20 DAYS"), eyebrow dates (formatDateRange as TripCard does), title, booking row; tap → trip
// TripRow: props { trip: Trip } — 56 pt thumbnail, eyebrow (dates, or "DATES NOT SET"), title; tap → trip
// InspiredStrip: props { destinations: Destination[] } — "Get inspired" heading + "See all" (→ router.navigate('/(tabs)/explore')), horizontal ScrollView of the top 8 by popularity using the existing DestinationCard (tap → `/destination/${slug}`)
// PlanCard: "Plan your next trip" title, line "Build it with Nova in a minute, or day by day.", Button primary "Plan a trip" → router.navigate('/(tabs)/create')
```

Write these as real components following `HomeHeader`'s style (module-level `StyleSheet`, theme colours inline, `useCallback` handlers, 44 pt targets, labels). Reuse `formatDateRange` from wherever `TripCard` imports it (`grep -n "formatDateRange" components/trip/TripCard.tsx`).

- [ ] **Step 3: `app/(tabs)/index.tsx` (Home)**

```tsx
/** Home (spec docs/superpowers/specs/2026-10-29-home-landing-design.md): everything at a glance. */
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useOwnAndJoinedTrips } from '@/hooks/useTripList';
import { useTrip } from '@/hooks/useTrip';
import { useTripBookings } from '@/hooks/useTripBookings';
import { useDestinations } from '@/hooks/useDestinations';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { HomeHeader } from '@/components/home/HomeHeader';
import { TodayCard } from '@/components/home/TodayCard';
import { NextTripCard } from '@/components/home/NextTripCard';
import { TripRow } from '@/components/home/TripRow';
import { InspiredStrip } from '@/components/home/InspiredStrip';
import { PlanCard } from '@/components/home/PlanCard';
import { homeTrips, tripSpan } from '@/utils/homeState';
import { countdownLabel, todayInfo, todaysBooking } from '@/utils/todayCard';
import { firstName, greeting } from '@/utils/greeting';
import { toCalendarDate } from '@/utils/calendarDate';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export default function HomeScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const profile = useUserStore((s) => s.profile);
  const { data: trips = [], refetch } = useOwnAndJoinedTrips(uid);
  const { destinations } = useDestinations();
  const now = new Date();
  const today = toCalendarDate(now);
  const h = useMemo(() => homeTrips(trips, today), [trips, today]);
  const lead = h.today ?? h.next;
  const { data: leadTrip } = useTrip(lead?.id ?? null);
  const { bookings } = useTripBookings(lead?.id ?? null);
  const info = h.today && leadTrip ? todayInfo(leadTrip, today) : null;
  const leadStart = lead ? tripSpan(lead).start : null;
  const booking = h.today ? todaysBooking(bookings, today) : leadStart ? todaysBooking(bookings, leadStart) : null;
  const cityCountry = h.today && leadTrip && info ? [leadTrip.destination, ...(leadTrip.additionalDestinations ?? [])][leadTrip.days.find((d) => d.id === info.dayId)?.destinationIndex ?? 0]?.countryCode ?? null : null;
  const hello = greeting({ name: firstName(profile?.displayName), now, countryCode: cityCountry });
  const eyebrow = now.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase();

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetch(), queryClient.invalidateQueries({ queryKey: ['inboxBadge'] }), lead ? queryClient.invalidateQueries({ queryKey: ['trip', lead.id] }) : null]);
    setRefreshing(false);
  }, [refetch, queryClient, lead]);

  return (
    <ScreenEntrance>
      <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
        <HomeHeader topInset={insets.top} />
        <ScrollView contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
          <View style={styles.greet}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{eyebrow}</Text>
            <Text style={[styles.hello, { color: colors.text.primary }]}>{hello}</Text>
          </View>
          {h.today && leadTrip && info ? <TodayCard trip={leadTrip} info={info} booking={booking} /> : null}
          {h.next && leadStart ? <NextTripCard trip={h.next} label={countdownLabel(leadStart, today)} booking={booking} /> : null}
          {h.isEmpty ? <PlanCard /> : null}
          {h.comingUp.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>Coming up</Text>
              {h.comingUp.map((t) => <TripRow key={t.id} trip={t} />)}
            </View>
          )}
          {h.showInspired && destinations.length > 0 ? <InspiredStrip destinations={destinations} /> : null}
        </ScrollView>
      </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingBottom: 120, gap: Spacing['4'] },
  greet: { paddingTop: Spacing['4'], gap: 2 },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  hello: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  section: { gap: Spacing['2'] },
  sectionTitle: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
});
```

Check names against the code before writing: `useTripBookings`'s return shape (`grep -n "return {" hooks/useTripBookings.ts`), `useTrip(id)` returns `{ data: TripWithDays }`, `Destination.countryCode`, the user store's profile field name (`grep -n "profile" stores/useUserStore.ts`). `InspiredStrip` must sit edge-to-edge: give it negative horizontal margin (`marginHorizontal: -Spacing['5']`) and its own inner padding so the cards scroll to the screen edge.

- [ ] **Step 4: Tab label**

`app/(tabs)/_layout.tsx` line 23: `{ name: 'index',   label: 'Home'    },`.

- [ ] **Step 5: Type check, lint, full suite, commit**

Run: `npx tsc --noEmit -p . && npx eslint "app/(tabs)/index.tsx" components/home && npx jest`
Expected: no errors; all tests PASS

Run the supernova-design pre-ship checklist on Home and note each line in the commit body.

```bash
git add "app/(tabs)/index.tsx" "app/(tabs)/_layout.tsx" components/home
git commit -m "feat(home): the Home landing page"
```

---

### Task 9: Docs

**Files:**
- Modify: `CLAUDE.md` (routing tree: `(tabs)/index.tsx` = Home, `feed.tsx`; Hooks table: `useInboxBadge`; `useFeed` row: the feed is now `app/feed.tsx` opened from Explore's From travelers; Utils: the four rule files; Components: `components/home/*`, `FromTravelersRow`)

- [ ] **Step 1: Edit CLAUDE.md** — add under Architecture:

```markdown
**Home landing page** (spec `docs/superpowers/specs/2026-10-29-home-landing-design.md`): the Home tab (`app/(tabs)/index.tsx`) is a landing page — `components/home/HomeHeader` (splash star + wordmark, Wallet, Inbox with one badge from `useInboxBadge`, `utils/inboxBadge.ts`; opens `/notifications?tab=messages` when a conversation is unread), a greeting (`utils/greeting.ts`: bands, daily-stable variants, the trip city's language about one day in three), then by state (`utils/homeState.ts` `homeTrips`): Today card (`utils/todayCard.ts`: day N of M, city by `destinationIndex`, ≤ 4 stops with the next unvisited, "Nothing planned today · Add a stop", today's booking), the next trip with a countdown, Coming up (undated last), Get inspired when ≤ 1 trip ahead, Plan card when none. The feed moved to `app/feed.tsx` (pushed; `?start={postId}`, `feedStartIndex`), opened from Explore's **From travelers** row (`components/explore/FromTravelersRow`); posting is Explore's Share link and the Create tab's "Share a photo or video". No server changes
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(home): CLAUDE.md"
```

---

### Task 10: Final review and device test (owner go-ahead for the build)

- [ ] **Step 1:** Whole-branch review (executing skill's final review).
- [ ] **Step 2:** With the owner's OK, an iOS TestFlight build (`npx eas-cli build --platform ios --profile production --auto-submit --non-interactive --no-wait`; app version is 1.0.9 on main).
- [ ] **Step 3:** Owner checks on the phone: Home on a trip day (create a test trip covering today), with one trip ahead, with none; the Wallet and Inbox buttons and badge; Explore's From travelers → feed at that post → back; Share from Explore and from Create; light and dark mode.
