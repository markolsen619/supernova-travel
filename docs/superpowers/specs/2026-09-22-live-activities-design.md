# Live Activities & trip countdown widgets: design

**Status:** Draft, for after v1.0.0 ships
**Date:** 2026-09-22
**Scope:** iOS only. Android has no Live Activity equivalent; an ongoing notification is out of scope.

## Goal

On travel days, show what the traveler needs next on the Lock Screen, Dynamic Island, Apple Watch Smart Stack, CarPlay and StandBy, without opening the app. This covers the flight, gate, boarding time, hotel check-in and dinner reservation, each shown only during the hours it matters.

## Key constraint: what a Live Activity can and can't be

- A Live Activity stays active for **up to 8 hours**. After it ends, it can remain on the Lock Screen for **up to 4 more hours**. It's designed for an event happening today, not for something days away.
- **So "12 days until Tokyo" is not a Live Activity. It's a widget** (Home Screen + Lock Screen accessory). The same `expo-widgets` package builds both, so this spec covers both.
- Live Activities start in one of two ways: (a) locally, while the app is in the foreground, or (b) remotely by **push-to-start** (iOS 17.2+). Automatic travel-day activities need (b).
- Updates come from the app or from **ActivityKit pushes sent straight to APNs** (`apns-push-type: liveactivity`, topic `com.supernovatravel.app.push-type.liveactivity`). As far as I know, Expo's push service (`exp.host`, used by `functions/src/notify.ts`) doesn't send this push type, so the Cloud Functions need a direct APNs sender with a `.p8` key.

## What exists today (grounded in the repo)

| Piece | Current state | Gap for Live Activities |
|---|---|---|
| Expo SDK | 54 (`expo ~54.0.35`, RN 0.81.5) | `expo-widgets` is stable in **SDK 56** (alpha in 55). Needs a two-step upgrade |
| `checkFlightStatus` | Polls AviationStack every 30 min for flights departing within 24h; maps status to `boarded`/`completed`/`cancelled` only | No gate, terminal, delay, estimated times or baggage belt. Polling too coarse near departure |
| AviationStack plan | Free tier: **100 requests/month** | A single flight polled every 30 min for 24h uses ~48 calls. The current job will already hit the cap with real users. A paid plan or another provider is needed either way |
| `BoardingPass` | Has gate/terminal/seat/boardingGroup (manual) | Needs `estimated*`, `delayMinutes`, `baggageBelt`, airport time zones |
| `Reservation` | `checkIn`/`checkOut` are **date-only** | A restaurant or hotel activity needs a time + time zone |
| Push routing | `useNotificationRouting` + `pushData.ts` | Reuse the same route map for Live Activity deep links |
| Flight alerts | Pro-only (push skipped for free tier) | Decide the Live Activity tier (see Open decisions) |

## Experiences

### 1. Flight (hero)

The activity runs from **3h before departure** until it lands.

| Phase | Lock Screen / expanded | Compact (Dynamic Island) | Minimal |
|---|---|---|---|
| Before boarding | `UA 837 · SFO → NRT` eyebrow, big departure countdown (`Text(timerInterval:)`), gate + terminal, seat | Airline code · `1h 42m` | Plane icon + mins |
| Boarding | "Boarding · Group 3", gate large, the boarding pass button leads | `Gate G94` | Gate |
| Delayed / gate change | The changed value is highlighted, and an **alert push** lights up the screen | `+45m` or new gate | Warning icon |
| In the air | Progress bar (dep→arr), landing time in destination local time | `Lands 14:20` | Plane |
| Landed | Baggage belt if known, then "Welcome to Tokyo". Ends with a 30 min dismissal | `Belt 7` | Check |
| Cancelled | Cancelled state + "Open trip" | `Cancelled` | Warning |

- **Tap target:** `supernova://boarding-pass/{id}` (barcode ready at the gate).
- **Long-haul (>~5h flights):** the 8h cap would expire mid-flight. End the first activity after takeoff with final "In the air, lands 14:20" content (it stays visible for up to 4h). Then push-to-start an "Arriving" activity about 60 min before landing. Push-to-start requires an alert, which here doubles as "Landing in an hour."
- **Stale date:** always set to the next expected update + a buffer, so offline phones show "Last updated 10:42" instead of a wrong gate.
- **Priority:** use `apns-priority 5` for countdown and progress updates, and `10` + alert only for gate change, delay ≥15 min, boarding start, cancellation, landing.

### 2. Reservations (same-day, short-lived)

| Type | Starts | Shows | Tap / quick action |
|---|---|---|---|
| Hotel / Airbnb | Check-in day, 3h before check-in time (or on landing) | Name, check-in time, confirmation code, address | Directions (Apple Maps URL), open reservation |
| Restaurant / show / activity | 2h before | Time countdown, party/confirmation, address | Directions |
| Rental car | 2h before pickup | Pickup location, confirmation | Directions (also shows in CarPlay) |

End each activity at the event time + 30 min, with a short dismissal window.

### 3. Trip countdown: widgets, not Live Activities

- Home Screen widget (small/medium): trip cover photo, `IN 12 DAYS` eyebrow, destination title. The medium size adds the first flight.
- Lock Screen accessory (rectangular/inline): `Tokyo · 12 days`.
- On departure day, the widget switches to "Today", and the flight Live Activity takes over.
- Data goes through the app group (`groupIdentifier`). The app writes the next trip snapshot and cover image to the shared container (expo-widgets images must live there).

### Several at once

Use `relevance-score` so that an active flight (100) beats a reservation (50) for the Dynamic Island. Never run more than one flight activity. For connecting flights, one activity advances through the legs.

## Design (follows `.claude/skills/supernova-design`)

- Live Activities are an **immersive moment**, so use the dark palette (Void `#0B0A12`, Elevated `#171422`). This matches `BoardingPassCard`, which is already deliberately dark.
- Eyebrow pattern on the Lock Screen: `SFO → NRT · SEAT 42A` in 11pt tracked-out muted text above the large countdown.
- Use the brand gradient only for the progress bar and the star mark. No emoji. SF Symbols are acceptable inside the extension (Phosphor isn't available there). Map them to the same meanings as `ACTIVITY_ICONS`.
- Support the landscape Dynamic Island (`isDynamicIslandLimitedInWidth`), StandBy (`activityBackgroundTint`), and the Watch/CarPlay small family (`supplementalActivityFamilies([.small])`).

## Data model changes

```ts
// BoardingPass: add
estimatedDeparture?: string;   // ISO 8601
estimatedArrival?: string;
delayMinutes?: number;
baggageBelt?: string;
originTz?: string;             // IANA, e.g. "America/Los_Angeles"
destinationTz?: string;
liveStatus?: 'scheduled' | 'boarding' | 'departed' | 'landed' | 'cancelled' | 'diverted';

// Reservation: add
startTime?: string;            // "19:30" wall clock, same convention as TripActivity.startTime
timeZone?: string;             // IANA
```

New collection **`live_activities/{activityId}`** (server-only writes):
`ownerUid, kind ('flight'|'reservation'), refId, pushToken, state ('pending'|'active'|'ended'), relevance, startedAt, endsAt, lastContentHash`.

New field **`users/{uid}.liveActivityStartTokens: string[]`** (push-to-start tokens, via a callable).

> Per CLAUDE.md: add `live_activities` and the new user field to `deleteAccount` in the same phase that creates them.

## Build phases (one Claude Code prompt per phase, commit at each checkpoint)

**Phase 0: SDK upgrade (54 → 55 → 56).** Upgrade one SDK at a time using `npx expo install --fix`, rebuild the dev client, and run the full test suite. *Checkpoint:* the app builds on device and nothing regresses in auth, the Mapbox globe or RevenueCat.

**Phase 1: Data model + deletion.** Add the new types and the `live_activities` rules (owner read, no client write). Add the new data to `deleteAccount`. Add a boarding-pass form field for the airport time zone (derive it from IATA with a static lookup). *Checkpoint:* the tests for `accountDeletion.ts` cover the new collection.

**Phase 2: Widget extension + flight Live Activity UI (local only).** Add the `expo-widgets` config plugin (`groupIdentifier`, `enablePushNotifications`). Build all slots (Lock Screen, compact, minimal, expanded, small), then add a "Show on Lock Screen" button on the boarding pass detail that starts it locally with fake state transitions in a dev menu. *Checkpoint:* every phase renders correctly on a physical iPhone with a Dynamic Island, on an older iPhone without one, and in StandBy.

**Phase 3: APNs sender + token plumbing.** Store the `.p8` key, Key ID and Team ID as Firebase secrets. Add `functions/src/liveActivityPush.ts` (HTTP/2, a cached JWT refreshed every <60 min, sandbox vs production host by environment). The client sends per-activity tokens (`addPushTokenListener`) and push-to-start tokens (`addPushToStartTokenListener`) to a callable. Handle token rotation, plus `410`/`BadDeviceToken` → mark ended. *Checkpoint:* a curl-equivalent test push updates a live activity on device.

**Phase 4: Flight data upgrade.** Pick the provider (Open decisions). Parse gate, terminal, estimates, delay and belt. Poll adaptively: 30 min when >6h out, 5 min from T-3h to landing, and stop after landing. Only push when the content hash changes. *Checkpoint:* replaying a recorded provider response produces the right sequence of pushes (unit-test the pure diff → push decision, the same pattern as `tierEvents.ts`).

**Phase 5: Automatic start + reservations.** The scheduler push-to-starts the flight activity at T-3h (alert: "Your flight to Tokyo boards at 10:40") and hands off long-haul flights. Reservation activities come from `startTime`. Local fallback: when the app opens inside a window and no activity exists, start it locally. *Checkpoint:* with the app killed, the activity appears on schedule.

**Phase 6: Trip countdown widgets.** The Home Screen and Lock Screen widgets read the next-trip snapshot from the app group. Refresh the snapshot on trip create/edit and app foreground. *Checkpoint:* the widget updates within one foreground after editing trip dates.

**Phase 7: Settings, gating, QA, review.** Add Settings → Notifications → "Live Activities" toggles (flights / reservations / auto-start). Respect `areActivitiesEnabled` and `frequentPushesEnabled`. QA matrix: airplane mode mid-flight, time-zone crossings, two flights in one day, activities turned off in iOS Settings, iPad (no Live Activities; hide the button), expired Pro during an active activity. Add a note for App Review explaining what starts activities automatically.

## Open decisions (Mark)

1. **Tier.** Flight alerts are Pro today. Options: (a) Live Activities fully Pro; (b) free users can start manually (local, no live data) while Pro gets auto-start + live gate/delay updates; (c) everything free. **Suggest (b):** everyone sees the feature, and the live data is a good reason to upgrade.
2. **Flight data provider.** AviationStack Basic (10k req/month) vs a provider with push alerts (FlightAware AeroAPI alerts, Cirium, etc.), which removes polling entirely. Choose based on cost per tracked flight.
3. **Auto-start default.** On by default with a one-time explanation, or opt-in on the first boarding pass added. **Suggest:** ask when the first boarding pass is added, which is also the right moment for the push permission prompt (see the flow review).
4. **Timing.** Build after v1.0 is live. Phase 0 is an SDK upgrade and shouldn't be combined with the first submission.

## References

- Apple, *Starting and updating Live Activities with ActivityKit push notifications*
- Apple WWDC26, *Live Activities essentials* (landscape Dynamic Island, StandBy, Watch/CarPlay/Mac, broadcast channels)
- Expo, *iOS widgets and Live Activities are stable in Expo SDK 56*; `expo-widgets` docs
- `software-mansion-labs/expo-live-activity`: archived June 2026 in favor of `expo-widgets`, so don't use it
