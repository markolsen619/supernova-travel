# Day-of Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Check-in reminders (free), leave-for-the-airport reminders (Pro), a day-of flight card on Home, and iPhone Live Activities / Android ongoing notification (Pro).

**Architecture:** Pure rules in `functions/src/dayOf.ts` decide what's due; a scheduled `dayOfReminders` job stamps `boarding_passes/{id}.dayOf` and calls `notifyUser`. The app has pure rules in `utils/dayOf.ts` (check-in links, today's flight, Live Activity content) and hooks/components for the Home card, the pass screen button and the Live Activity (`expo-live-activity`). Airport countries/coords come from a generated table.

**Tech Stack:** Firebase Functions v2 (scheduler), Mapbox Directions, Expo Router, `expo-live-activity` (installed), `expo-notifications`, Jest.

**Spec:** `docs/superpowers/specs/2026-11-01-day-of-assistant-design.md`

## Global Constraints

- Check-in: free. Leave-by + Live Activities + Android ongoing notification: Pro (`isPaidTier`).
- Windows: check-in (24 h − 10 m, 24 h + 10 m]; compute leave-by in (6 h − 10 m, 6 h + 10 m]; leave push at ≥ leaveBy − 30 m while departure is ahead. Each sent once (`dayOf.*SentAtMs`).
- Passes with status `upcoming` or `checked_in` only; `cancelled`/`completed`/`boarded` skipped.
- Buffer 120 min same-country, 180 otherwise. Drive via Mapbox `driving-traffic` (5 s timeout), from the trip's located hotel stop on the departure day, else the night before.
- No location permission, no new AviationStack calls. `dayOf` server-written only; bookkeeping (no share/stop jobs).
- Times shown on the origin airport's clock (`airportTime`).
- Live Activity starts ≤ 6 h before departure, ends at arrival / departure + 3 h / cancelled. Server LA pushes only when `APNS_LA_KEY` exists.
- Copy: sentence case, no emoji, verb-first.

## Review Focus

1. A pass with no `tripId` or a trip with no located hotel — leave-by still computed with no drive ("Be at LIS by …"). Test in Task 2.
2. The job running late / twice — never sends a reminder twice, never after departure. Test in Task 2.
3. Origin or destination airport unknown to the table — buffer falls back to 180 (international, the safe side). Test in Task 2.
4. A user with two flights the same day — Home and the Live Activity pick the next not-yet-departed one. Test in Task 4.
5. An older app version receiving `checkin_open` / `leave_by` pushes — routes via passId; older apps fall back to the notifications list (`notificationTapRoute`). Test in Task 4.

---

### Task 1: Airport info table

**Files:** Modify `scripts/build-airport-zones.mjs` (also write `functions/src/airportInfo.ts`); Create `functions/src/airportInfo.ts` (generated), Test `__tests__/functions/airportInfo.test.ts`.

**Produces:** `airportInfo(iata: string): { lat: number; lng: number; country: string } | null`.

- [ ] Test: `airportInfo('LIS')` → country `PT`, lat ≈ 38.77; `airportInfo('JFK').country` → `US`; `airportInfo('xxx')` → null; lowercase accepted.
- [ ] Extend the script: from mwgg airports.json, for each entry with a 3-letter `iata`, emit `"IATA":[lat,lng,"CC"]` (lat/lng rounded to 3 decimals) into `export const AIRPORTS: Record<string, [number, number, string]>` plus `airportInfo`. Run `curl -sSL -o /tmp/airports.json https://raw.githubusercontent.com/mwgg/Airports/master/airports.json && node scripts/build-airport-zones.mjs /tmp/airports.json` (zones output unchanged).
- [ ] Tests pass; commit `feat(dayof): airport coordinates and countries`.

### Task 2: Pure day-of rules (server)

**Files:** Create `functions/src/dayOf.ts`; Test `__tests__/functions/dayOf.test.ts`.

**Produces:**
```ts
export interface DayOfPass { id: string; ownerUid: string; status: string; departureMs: number; origin: string; destination: string;
  airline: string; flightNumber: string; destinationCity: string; tripId: string | null;
  dayOf: { checkInSentAtMs?: number; leaveByMs?: number; driveMin?: number | null; bufferMin?: number; leaveSentAtMs?: number } }
export type DayOfAction = { kind: 'checkin'; passId: string } | { kind: 'computeLeaveBy'; passId: string } | { kind: 'leave'; passId: string };
export function dueActions(passes: DayOfPass[], nowMs: number, paidUids: Set<string>): DayOfAction[];
export function bufferMinutes(origin: string, destination: string): number;          // 120 same country, else 180 (unknown → 180)
export function leaveByMs(departureMs: number, bufferMin: number, driveMin: number | null): number;
export function stayFor(stops: { dayKey: string; type: string; lat: number | null; lng: number | null }[], departureDay: string): { lat: number; lng: number } | null; // hotel on that day, else the previous day
export function previousDay(day: string): string;
```

- [ ] Tests (write first): check-in at 24 h ± 10 m only, once, any tier; computeLeaveBy only for Pro at 6 h ± 10 m and only without `leaveByMs`; leave at leaveBy − 30 m … departure, once; status cancelled/completed/boarded → nothing; departed → nothing; `bufferMinutes('LIS','OPO')=120`, `('LIS','JFK')=180`, `('LIS','ZZZ')=180`; `leaveByMs(t, 180, 35)` = t − 215 min; `leaveByMs(t,120,null)` = t − 120 min; `stayFor` picks the departure day's located hotel, else the night before, else null (unlocated ignored).
- [ ] Implement; tests pass; commit `feat(dayof): pure reminder rules`.

### Task 3: Server job, data rules, notification routes

**Files:** Create `functions/src/dayOfFunctions.ts`; Modify `functions/src/index.ts`, `functions/src/sharedBookings.ts` (`BOOKKEEPING` + `dayOf`), `firestore.rules` (clients may not write `dayOf` on `boarding_passes`; `users/{uid}/liveActivities/{passId}` owner read/write), `utils/notificationRoute.ts` (`checkin_open`, `leave_by` → pass screen), `functions/src/pushCopy.ts` if push wording lives there; Test: extend `__tests__/utils/notificationRoute.test.ts`, `__tests__/functions/sharedBookings.test.ts` (dayOf is bookkeeping), rules unchanged-tests if any.

- `dayOfReminders = onSchedule({ schedule: 'every 10 minutes', timeZone: 'UTC', timeoutSeconds: 300 })`: query `boarding_passes` where `departureTime` between now−1 h and now+25 h (string ISO compare works for UTC `Z` timestamps; if mixed offsets exist, query by a wider window and filter in code); owners' tiers in one `getAll`; `dueActions`; for `checkin` → notifyUser + stamp; for `computeLeaveBy` → trip days (`tripDays` + days docs + activities with lat/lng/type) → `stayFor` → Mapbox drive (`MAPBOX_TOKEN`) → stamp `dayOf.leaveByMs/driveMin/bufferMin`; for `leave` → notifyUser with time formatted on the origin airport's clock (`airportTime` helpers) + stamp. All stamps via `update({ 'dayOf.x': … })`.
- [ ] Tests first for routes/bookkeeping; implement; `(cd functions && npm run build)`; full jest; commit `feat(dayof): reminders job`.

### Task 4: App rules

**Files:** Create `utils/dayOf.ts`; Test `__tests__/utils/dayOf.test.ts`.

**Produces:** `checkInUrl(airline: string, flightNumber: string): string`; `flightToday(passes: BoardingPass[], now: Date): BoardingPass | null` (departure on the origin airport's local today, not departed more than 30 min ago, earliest first); `liveActivityContent(p: BoardingPass, nowMs: number): { title: string; subtitle: string; endsAtMs: number; ended: boolean }`; `shouldStartActivity(p, nowMs, started: Set<string>, isPro: boolean): boolean`.
- [ ] Tests first: check-in table hit by code (`TP204` → TAP page), by name ("Delta Air Lines"), fallback search URL; flightToday with two flights picks the next, ignores yesterday/tomorrow and a cancelled one; content shows gate/seat/boarding when known, "Delayed 25 min" from `delayMinutes`, ended when cancelled or after arrival/departure + 3 h; shouldStart only Pro, ≤ 6 h, not started. Implement; pass; commit `feat(dayof): app rules`.

### Task 5: Home card, pass screen button, Live Activity, Android ongoing notification

**Files:** Create `components/home/FlightTodayCard.tsx`, `hooks/useFlightLiveActivity.ts`, `assets/liveActivity/star.png` (≤ 4 KB, from SupernovaStar resized to 64 px); Modify `app/(tabs)/index.tsx` (card above Today/next), `app/(wallet)/boarding-pass/[id].tsx` (Check in online button until departure; "Leave by" line for Pro), `app/(tabs)/_layout.tsx` (mount `useFlightLiveActivity`), `app.json` (plugin `["expo-live-activity", { "enablePushNotifications": true }]`).
- `useFlightLiveActivity`: on mount/foreground and when boarding passes change: for the user's `flightToday` pass, if `shouldStartActivity` → `startActivity({ title, subtitle, progressBar: { date: endsAtMs }, imageName: 'star', dynamicIslandImageName: 'star' }, { backgroundColor: '#0B0A12', titleColor: '#F5F3F9', subtitleColor: '#B9B2CC', progressViewTint: '#7F77DD', deepLinkUrl: '/(wallet)/boarding-pass/{id}', timerType: 'digital' })`; keep `{ passId → activityId }` in AsyncStorage; `updateActivity` on changes; `stopActivity` when `ended`. `addActivityTokenListener` → `setDoc(users/{uid}/liveActivities/{passId}, { token, updatedAtMs })`. iOS only (`Platform.OS === 'ios'`), Pro only; wrapped in try/catch (module absent in older dev builds).
- Android: same hook schedules/updates an ongoing (`sticky: true`, `autoDismiss: false`) local notification "Flight today · TAP 204 to Porto" with the subtitle, dismissed when ended.
- [ ] tsc, full jest, supernova-design checklist (ledger), commit `feat(dayof): flight card, check-in button and Live Activity`.

### Task 6: Optional server Live Activity pushes + docs

**Files:** Create `functions/src/liveActivityPush.ts` (pure payload builder, tested) and wire into `checkFlightStatus` after a pass's live patch: if secret `APNS_LA_KEY` (+ `APNS_LA_KEY_ID`, team `R47484PAGA`) is configured and `users/{owner}/liveActivities/{passId}` exists → HTTP/2 POST to `api.push.apple.com/3/device/{token}` with `apns-push-type: liveactivity`, topic `com.supernovatravel.app.push-type.liveactivity`, ES256 JWT. Without the key: skip silently. Test the payload (`event: 'update' | 'end'`, `content-state` matching the module's `NativeLiveActivityState`).
- Docs: CLAUDE.md bullet **Day-of assistant**; Current state pending item "create an APNs auth key for Live Activities (Apple Developer → Keys) and set APNS_LA_KEY / APNS_LA_KEY_ID"; privacy policy unchanged (no new data leaves the device except the activity token to our server — add one sentence).
- [ ] Commit `feat(dayof): Live Activity server updates when configured; docs`.
