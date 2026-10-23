# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npx expo start          # start Metro bundler (press i/a/w for iOS/Android/Web)
npx expo start --ios    # launch iOS simulator directly
npx expo start --android
npm run lint            # expo lint (ESLint)
npm test                # jest --watchAll
cd functions && npm run build   # compile Cloud Functions TypeScript
cd functions && npm run deploy  # deploy Cloud Functions to Firebase
```

There is no separate build step for local dev — Expo handles transpilation at runtime. Cloud builds use EAS (`eas build --profile development|preview|production`).

**EAS build profiles** (`eas.json`):
- `development` — dev client; iOS simulator + Android APK
- `preview` — internal distribution (device install)
- `production` — app store submission with auto-incremented versions

## Environment

Copy `.env.local.example` to `.env.local` and fill in all keys. Client vars are prefixed `EXPO_PUBLIC_` so Expo exposes them to the bundle. Cloud Function vars are set via `firebase functions:config:set` or Firebase environment secrets — never `EXPO_PUBLIC_`.

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_FIREBASE_API_KEY` | client | Firebase API key |
| `EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN` | client | Firebase auth domain |
| `EXPO_PUBLIC_FIREBASE_PROJECT_ID` | client | Firebase project ID |
| `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET` | client | Firebase storage bucket |
| `EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | client | Firebase messaging sender ID |
| `EXPO_PUBLIC_FIREBASE_APP_ID` | client | Firebase app ID |
| `EXPO_PUBLIC_GOOGLE_MAPS_API_KEY` | client | Google Places autocomplete (New API) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | client | RevenueCat iOS SDK |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | client | RevenueCat Android SDK |
| `EXPO_PUBLIC_ALGOLIA_APP_ID` | client | Algolia search app ID |
| `EXPO_PUBLIC_BOOKING_AFFILIATE_ID` | client | Booking.com affiliate `aid`. **Optional** — without it the booking button still links out, it just earns nothing |
| `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY` | client | Algolia **Search-Only** key (never Admin) |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` | client | Google Sign-In. Required **even on iOS** — it is the audience Firebase validates the ID token against. The iOS client ID is read from `GoogleService-Info.plist`, not from env |
| `ALGOLIA_APP_ID` | Cloud Function | Algolia sync (Admin key context) |
| `ALGOLIA_ADMIN_KEY` | Cloud Function | Algolia index write access |
| `AVIATIONSTACK_API_KEY` | Cloud Function | Flight status polling |
| `GEMINI_API_KEY` | Cloud Function | AI trip generation (never expose to client) |
| `REVENUECAT_WEBHOOK_SECRET` | Cloud Function | `syncTier` webhook Authorization header |
| `REVENUECAT_SECRET_API_KEY` | Cloud Function | `reconcileTier` REST lookups: a v1 `sk_…` key, never on the client |

## Architecture

### Routing (Expo Router v6)

File-based routing under `app/`. App bundle ID: `com.supernovatravel.app`. React Native New Architecture is enabled.

```
app/
├── _layout.tsx                    # Root layout — auth listener, RevenueCat init, notification tap routing
├── (auth)/
│   ├── _layout.tsx
│   ├── welcome.tsx
│   ├── sign-in.tsx
│   ├── sign-up.tsx
│   ├── forgot-password.tsx
│   ├── complete-profile.tsx       # Gate: authenticated but no users/{uid} doc
│   └── onboarding.tsx             # 6-slide showcase after sign-up (useOnboardingShowcase); sets users/{uid}.hasSeenOnboarding
├── (tabs)/
│   ├── _layout.tsx                # Tab bar: Feed, Explore, Create, Search, Profile
│   ├── index.tsx                  # Feed
│   ├── explore.tsx
│   ├── create.tsx
│   ├── search.tsx
│   └── profile.tsx
├── (wallet)/
│   ├── _layout.tsx
│   ├── boarding-passes.tsx        # List
│   ├── boarding-pass/[id].tsx     # Detail
│   ├── boarding-pass/add.tsx      # Add form
│   ├── reservations.tsx           # List
│   ├── reservation/[id].tsx       # Detail
│   ├── loyalty.tsx                # List
│   ├── loyalty/[id].tsx           # Detail
│   └── loyalty/add.tsx            # Add form
├── trip/
│   ├── [id].tsx                   # Trip detail (modal)
│   ├── new.tsx                    # Manual trip wizard (modal)
│   ├── ai-generate.tsx            # AI generation form (modal)
│   └── ai-generating.tsx          # Generation loading screen → routes to trip/[id]
├── destination/[slug].tsx         # Destination page (full-screen push): picks, travelers' trips, places to go, plan with AI
├── post/[id].tsx                  # Post detail (modal)
├── user/[uid].tsx                 # Public profile (full-screen push)
├── settings.tsx                   # Theme toggle, account, sign out (modal)
└── paywall.tsx                    # RevenueCat paywall (modal)
```

**Auth routing is centralised in `app/_layout.tsx`** via a single `onAuthStateChanged` listener. On sign-in it calls `configureRevenueCat(uid)`, refreshes the Expo push token *if already granted* (it never prompts — see `services/push.ts`), fetches the user's `tier`, then `router.replace('/(tabs)')`. On sign-out: `router.replace('/(auth)/welcome')`. There is no route guard middleware.

`_layout.tsx` also mounts `useNotificationRouting()`, which sends a tapped notification to its screen. That listener must wait for the auth listener above: the `router.replace('/(tabs)')` on sign-in discards any navigation made before it, so a cold-start tap is **held** until the root navigator is mounted and auth has settled.

Path alias `@/` maps to the project root (see `tsconfig.json`).

**Onboarding showcase** (2026-10-11; `hooks/useOnboardingShowcase.ts`, rules in `utils/onboardingShowcase.ts`): Discover (Supernova's **editorial** trips — never real users' trips, which showed dates, "Upcoming" and someone's actual plans), AI itinerary (Day 1 of an editorial trip, stops written in one by one), trip flyover (`assets/onboarding/flyover.mp4`: an iPhone screen recording of the Lisbon editorial trip, status bar cropped, 600×1208 HEVC ~1.3 Mbps, 3.3 MB — re-record from a real phone, the simulator can't draw it smoothly), wallet, community (`pickCommunityFaces`: a random 6 from the most-followed + newest 30 each, photo required; never private, editorial, moderation-hidden, the App Review demo account or yourself), Pro.

### State Management

Three Zustand stores in `stores/`:
- `useAuthStore` — Firebase `User | null`, `tier: 'free' | 'pro' | 'business'`, initialization flag
- `useUserStore` — cached `UserProfile` (displayName, avatarUrl, bio, location, follower counts)
- `useThemeStore` — `mode: 'dark' | 'light' | 'system'` (default `'dark'`, versioned with a one-time migration — `utils/themeDefault.ts`) and `chosen`, persisted via AsyncStorage; `useTheme()` hook resolves `'system'` via `useColorScheme`

TanStack React Query (staleTime 2 min, 2 retries) wraps all Firestore reads. **No `onSnapshot` listeners in hooks** — use `getDocs`/`getDoc` only. Exception: post comments screen uses `onSnapshot` directly in a `useEffect`.

### Firebase

`services/firebase.ts` exports `auth`, `db`, `storage`, `functions` as named singletons (region: `us-central1`). Import these directly — never call `getAuth()` / `getFirestore()` elsewhere.

Firestore collections:
- `users/{uid}` — profile + `tier` + `expoPushTokens[]`; subcollections: `feed/`, `notifications/`, `savedTrips/`
- `posts/{postId}` — travel posts; subcollection `comments/`
- `trips/{tripId}` — itineraries; subcollections: `days/{dayId}`, `days/{dayId}/activities/{activityId}`, `private/budget` (the trip budget — **members only**, kept off the trip doc because every viewer can read that; `moveTripBudgetPrivate` moves budgets older apps still write onto the trip), `expenses/` and `packingItems/` (members only: owner + accepted invitees, `utils/tripAccess.ts` `isTripMember`; the Budget/Packing chips and screens show nothing else to anyone else), `routes/cache` (the trip map's routed legs — one doc, read by anyone who can see the trip, written only by owner/collaborators; see `useTripRoutes`)
- `follows/{docId}` — follow graph
- `boarding_passes/{passId}` — owner-only (`isOwner(resource.data.ownerUid)`)
- `reservations/{reservationId}` — owner-only
- `loyalty_programs/{programId}` — owner-only
- `usage_quotas/{uid}` — server-side Admin SDK only
- `destinations/{slug}` — the editorial destination catalog (seeded from `data/destinations.json`: centre, box, cover, vibes, popularity) plus daily aggregates (`topPlaces`, `itineraryCount`, `communityTripCount`). Read-only to clients
- `aggregates/heatmap` — the globe's heat points, **flattened** `[lng, lat, w, …]` with `stride: 3` (Firestore rejects nested arrays). Read-only to clients
- `reports/{reportId}` — create-only from client
- `users/{uid}/agentThreads/{surface}_{id}/messages` — Ask Nova conversations: owner reads/deletes, only the server writes, the owner may set `status`

**The `feed/` and `notifications/` subcollections are write-only from Cloud Functions.** `usage_quotas` is entirely server-side.

**Firestore security rules** (`firestore.rules`): public trips/posts are readable by all; boarding passes, reservations, and loyalty programs are owner-only; `usage_quotas` has no client access at all; `reports` is create-only from the client.

### Cloud Functions (`functions/src/`)

All functions use Firebase Functions v2.

- `generateTrip` (`generateTrip.ts`) — HTTPS callable; receives `GenerateTripRequest`, calls Gemini 1.5 Flash, writes `trips` + `days` + `activities` subcollections, enforces weekly quota via `usage_quotas`
- **Wallet ↔ trips** (`bookingMatch.ts` pure, `bookingMatchFunctions.ts`; Pro only) — `boarding_passes` / `reservations` carry `tripId`, `tripLink` (`auto` may be re-decided, `manual` never), `tripSuggestions`, `tripLinkDismissed`, plus `placeCity` / `placeCountryCode` / `localDate` / `originCountryCode` (the parser now returns city, country codes and the local departure day). `matchDecision`: dates overlap (trip padded ±1 day for timezones, flights ±1 day) **and** place matches (country, or city after folding + aliases like Roma/Rome; a flight also by its origin) on exactly one trip → link; several, or dates with an unknown place → ask (≤3); else none; Dates TBD trips never. The app calls the `matchBooking` callable after a save (`useBookingMatch`: "Added to … · Undo" banner, or the detail screen's "Is this for a trip?" card); `onTripWrittenRematch` re-decides members' unlinked/auto bookings only when a trip's dates, places or members change (`tripMatchInputsChanged` — trips are written constantly) and clears links when a trip is deleted. Rules: only a paid `tier` may set a link; anyone may clear one. **Shared with the trip's members** (2026-10-08): the wallet docs stay owner-only, because rules can't hide one field and a boarding pass barcode must never leave its owner. Instead `onBoardingPassWrittenShare` / `onReservationWrittenShare` (`sharedBookingFunctions.ts`, pure whitelist in `sharedBookings.ts`) keep a copy at `trips/{tripId}/bookings/{kind}_{id}` — **no barcode, no pass record locator, no notes/attachments** — readable by owner + collaborators only. Sharing is on unless the booking's `sharedWithTrip == false` (switch on the detail screen's trip row). `onTripWrittenRematch` calls `syncTripShares` when members change or the trip is deleted (a member who leaves stops sharing; a deleted trip's subcollection would otherwise linger). The app merges them in `useTripBookings` / `useSharedTripBookings` (`utils/sharedBookings.ts`; `TripBooking.sharedBy`), labels them with the owner's first name, and opens them read-only at `/(wallet)/shared-booking`. **A new booking field is private until added to `SHARED_FIELDS`.** **`trips/{id}.collaborators` is server-written only** (rules refuse it on create and update): it decides who reads shared bookings, budget, expenses and packing, and a client-editable list let anyone add a stranger and read their bookings (caught in review, 2026-10-08). A booking's `ownerUid` is immutable for the same reason. Backfill: `node scripts/backfill-shared-bookings.mjs [--dry-run]`
- **Email import** (`emailImport.ts` pure, `emailImportFunctions.ts`; Pro only) — each Pro user can create a forwarding address `{token}@supernovatravel.xyz` (10 × `a-z0-9`). Mail path: Cloudflare Email Routing catch-all on `supernovatravel.xyz` (Cloudflare account olsen.mark85@gmail.com) → Worker `supernova-email-inbound` (`cloudflare/email-inbound/`, deploy with `cd cloudflare/email-inbound && npx wrangler deploy`) → signed POST (`X-Supernova-Signature`, HMAC-SHA256; secret `INBOUND_EMAIL_SECRET` in `functions/.env` = Worker secret `INBOUND_SECRET`) → `inboundEmail` (onRequest; 401 unless signed, then **always 200** so Cloudflare never retries into duplicates). It reads the email with `mailparser`, catches Gmail's forwarding confirmation (**Gmail now confirms only by the link in that email — its settings page has no code box**; `gmailConfirmationLink` keeps the link, Google hosts only, and the app shows "Confirm in Gmail"), gates (`importGate`: Pro → AI consent → 25/day → keyword filter), asks Gemini for a **list** of bookings (text + up to 2 PDFs), saves them in one batch (`source: 'email'`), runs `matchOne`, logs to `users/{uid}/emailImports` (newest 50; the email body is never stored) and pushes `email_import_pass` / `_reservation` / `_batch`. **The token lives in `users/{uid}/private/emailImport`, never on `users/{uid}`** (every signed-in user can read profiles; the token is the only thing between a stranger and your wallet). `createImportAddress` (Pro + consent) / `rotateImportAddress` (old address dies first); `deleteAccount` removes `inboundAddresses/{token}`. App: `app/(wallet)/email-import.tsx`, `EmailImportRow`, `useEmailImport`, `utils/emailImport.ts`; Copy uses `expo-clipboard` (native — needs a build from 1.0.3). **If forwarded emails vanish**, check `inboundEmail`'s request log for 401s: that is the Worker's secret not matching `functions/.env` (it happened at launch). Reset it with `grep '^INBOUND_EMAIL_SECRET=' functions/.env | cut -d= -f2- | tr -d '\n' | (cd cloudflare/email-inbound && npx wrangler secret put INBOUND_SECRET)`
- **Calendar feed** (spec `docs/superpowers/specs/2026-10-19-calendar-feed-design.md`; pure `calendarFeed.ts`, wiring `calendarFeedFunctions.ts`; free) — a private subscribed calendar: token (24 × `a-z0-9`) in `users/{uid}/private/calendar` (`{ token, types }`, owner-read) and `calendarFeeds/{token}` (server-only, no rule = denied). Callables `createCalendarFeed` (idempotent) / `rotateCalendarFeed` (old link dies first) / `disableCalendarFeed` / `setCalendarTypes`. Hosting rewrites `/cal/**` → `calendarFeed` (onRequest, `private, max-age=900`, unknown token → 404). `buildCalendar` reads only whitelisted fields: flights in UTC, reservation/stop clock times **floating** (printed time wherever the phone is), hotels/trip/days all-day with exclusive `DTEND`, stable UIDs `{kind}-{id}@supernovatravel.app`, only the user's own bookings, nothing ended > 30 days ago; never codes, refs, barcodes, addresses, notes. Duplicates with Gmail/airline calendars: type switches (`flights`, `stays`, `dining`, `transit`, `tripDays`) and `showInCalendar: false` per booking (`CalendarSwitchRow`). App: `components/calendar/CalendarSheet` from Settings → Calendar and the trip's Calendar chip; `hooks/useCalendarFeed`, `services/calendar.ts`, `utils/calendarLinks.ts` (webcal + Google `cid=` links). `deleteAccount` removes `calendarFeeds`
- **Apple Wallet boarding passes** (spec `docs/superpowers/specs/2026-10-22-apple-wallet-pass-design.md`; pure `applePass.ts` (pass.json) + `walletLink.ts` (5-min HMAC links), firebase-free signer `applePassSign.ts` (`passkit-generator`), wiring `appleWalletFunctions.ts`; free) — Pass Type ID `pass.com.supernovatravel.app`, team `R47484PAGA`, serial `bp-{passId}` (adding again replaces). Callable `appleWalletLink({ passId })` (owner only) → `https://supernova-a2125.web.app/wallet/apple/{token}.pkpass`; Hosting `/wallet/apple/**` → `appleWalletPass`, which re-checks `ownerUid`, signs fresh, `no-store`; bad/expired → 404. Secrets `PASSKIT_KEY`, `PASSKIT_CERT`, `PASSKIT_WWDR`, `WALLET_LINK_SECRET` (source files in `~/.config/supernova/`; **certificate expires 2027-11-22 — renew in Apple Developer before then**). pass.json is a whitelist (no name, notes, refs, trip); real barcode format (aztec/qr/pdf417/code128, unknown → QR); times shown in the **phone's** time zone (boarding passes are stored in UTC, not the airport's offset, so `ignoresTimeZone` would show UTC); `relevantDate` = departure. Static for now (live updates later via the pass web service). Check signing locally: `(cd functions && npm run build) && node scripts/check-apple-pass.mjs`. App: Apple's **own PKAddPassButton** (Apple: apps must not use the badge image) from the local Expo module `modules/add-pass-button` (Swift view; null in builds without it — **`.gitignore`/`.easignore` must keep `/ios/` and `/android/` anchored** or the module's own `ios/` folder never reaches git or EAS), passes added in-app by `react-native-wallet-manager` (`addPassFromUrl`; `utils/appleWalletOutcome`: cancel = silent, already there = note, network = error, browser fallback only when the sheet couldn't run; hidden when `canAddPasses()` is false; outline style in dark mode) in `components/wallet/AddToAppleWallet` under the pass on `app/(wallet)/boarding-pass/[id].tsx`. No Wallet entitlement yet (only needed for "already in Wallet?" via `hasPass`)
- **Rewards statements** (`loyaltyImport.ts`, pure) — the email import prompt also returns `{kind:'loyalty'}` entries for a program's own balance statement. `matchLoyalty`: member number (a masked "••••4821" by its last digits), else the one program with that name and no conflicting number, else a new program. `loyaltyWrite` never lets a statement older than the saved `balanceAsOf` win, never puts a masked number over a full one, and keeps `programType`/`unit`/`tier` to values shipped apps know (they index `LOYALTY_ICONS` and crash otherwise). Push `email_import_loyalty` (`programId`). Gmail gets a second filter, `LOYALTY_FILTER`
- **Retry-safe generation** (`generationRequest.ts`, client `utils/generationRecovery.ts` in `useAiGenerateTrip`) — the app sends `requestId` (a Firestore auto-id) and the trip is written at `trips/{requestId}` with `create()`. A call with an id that already holds your trip returns it before any quota check or Gemini call; someone else's id is refused. Why: a phone can lose the connection while the server finishes, which the Functions SDK reports as a bare `internal` — users saw "Generation failed", retried, and got duplicate trips (2026-10-03). On a connection-loss error (`internal` / `unavailable` / `deadline-exceeded`) the app polls for `trips/{requestId}` (3 s × 30) before showing a failure; a missing trip reads as permission-denied under the trips rules, so a failed read means "not yet". The function logs `client disconnected before the response` with `afterMs` when the phone hangs up — check that before guessing at the cause
- `checkFlightStatus` (`checkFlightStatus.ts`) — Cloud Scheduler every 30 min; queries upcoming boarding passes, calls AviationStack HTTP API, updates Firestore status, then `notifyUser` (in-app row + push). **Live flight status is Pro-only end to end** — a free user's pass is never polled, so its status never changes. Cost decisions are pure and live in `flightPolling.ts` (no firebase-admin, unit-tested): `filterPassesForPaidOwners()` drops free owners **before** anything is spent (one `db.getAll` for the distinct owners — a Firestore read is orders of magnitude cheaper than an API call); `groupPassesByFlight()` makes one call per flight rather than per passenger, normalising the hand-typed flight number first; `shouldPollFlight()` thins the 30-min schedule by distance from departure (every run under 3h, hourly to 12h, every 4h beyond), derived from the clock so back-off costs no extra write. **Any new AviationStack call must go through these** — the previous version polled everyone at full cost and merely suppressed the push afterwards
- `notify.ts` / `pushData.ts` — `notifyUser(uid, payload)` writes the in-app notification doc and sends the push. The push's `data` (what the client taps through on) is derived from the notification doc by `pushDataFor()`, a whitelist of `type` + one id — never a spread of the doc, which holds display fields and would eat Expo's 4KiB payload cap. `pushData.ts` imports no firebase-admin so it stays unit-testable
- `syncTripToAlgolia` / `syncUserToAlgolia` (`syncAlgolia.ts`) — `onDocumentWritten` triggers; upserts/deletes public trips in the Algolia `trips` index and users in the `users` index
- `syncTier` (`syncTier.ts`) — RevenueCat webhook; the normal writer of `users/{uid}.tier`, ordered by `tierEventTimestampMs`
- `reconcileTier` (`reconcileTier.ts`) — HTTPS callable; re-reads the tier from RevenueCat's REST API when a webhook is late or lost. Throttled per user (30s). Pure logic lives in `tierEvents.ts`
- `deleteAccount` (`deleteAccount.ts`) — HTTPS callable; App Store 5.1.1(v) in-app account deletion. Removes the caller's traces in others' data (likes + counts, comments, actor notifications, follows + counts, collaborator slots, invites, DMs), then their own content, Storage folders, RevenueCat customer, and finally the Auth user — last, so a failure leaves them signed in to retry. Idempotent. Pure decisions in `accountDeletion.ts`. Its collection-group queries rely on `fieldOverrides` in `firestore.indexes.json`. **Adding a new per-user collection, subcollection, or Storage folder means adding it here too** — `cancellation_feedback` is *anonymised* rather than deleted (the uid is nulled), since the aggregate "why people leave" is the point of collecting it; `places/{placeId}` is deliberately untouched, being a shared cache keyed by place, not by user
- `tagTripDestinations` / `aggregateDiscovery` (`discoveryFunctions.ts`) — the first tags every public non-editorial trip with the catalog destinations its destinations fall in (`destinationKeys`; cleared when it stops being public; `sameKeys` stops its own write re-triggering it). The second runs daily (04:00 UTC): per-destination `topPlaces` (sights and restaurants only, ranked by how many itineraries include them) and the heat map (world baseline from catalog popularity + community stops). Pure rules in `discovery.ts`. `runAggregation()` is exported for the seed script
- **Friends on a trip** (spec `docs/superpowers/specs/2026-10-12-friends-on-trips-design.md`; pure `friendsTraveling.ts`, `friendsTravelingFunctions.ts`) — people you follow appear on the Search globe at **today's city from their itinerary** (no GPS, no location permission) while a **Public/Followers** trip is under way, unless `users/{uid}.settings.showOnGlobe === false` (Settings → Privacy, on by default) or a block either way. Each viewer has a server-written list `users/{V}/friendsTraveling/{T}` (owner-read only) kept by `syncTraveler(T)` — hourly `refreshFriendsTraveling` + triggers on trips, days, follows, users (switch/name/photo) and blocks. **Days store no date**: day N is the trip's first day + (N − 1) calendar days (`dayKey`); the first day is the saved `startDay` (exact, 1.0.4+) when it agrees with `startDate` within a day, else `startDate` read at noon UTC (`calendarDay`, right only from UTC−11 to +12 — New Zealand summer is +13); the end shifts by the same offset (`tripDays`). The hourly job runs at **minute 1 UTC** (entries turn into yesterday at 00:00 UTC and the app hides them), queries only shared trips that could be under way (composite indexes), writes an entry only when it changed, and isolates failures (`allSettled`). A collaborator on a followers-only trip shows only to viewers who follow its author (they could not open it otherwise). Composite index `(authorUid, endDate)`; collection-group overrides on `friendsTraveling.uid/day`; `deleteAccount` removes your entries in others' lists. App: `useFriendsTraveling` (polls 10 min, only entries dated today — `isCurrentEntry`), `FriendTravelMarker` `MarkerView`s on `GlobeMapView`, spread when sharing a city (`spreadCluster`, by whole-number zoom). `services/session.ts` must carry `settings.showOnGlobe` into the profile store or the switch reads "on" after a restart
- **Trending** (spec `docs/superpowers/specs/2026-10-11-trending-destinations-design.md`; pure `trending.ts`, `trendingFunctions.ts`) — `onTripWrittenTrend` counts every non-editorial trip, **any visibility**, once per catalog city **ever** (`trendSeen/{tripId}`, server-only, transaction; nothing subtracted) into `trendCounts/{slug}.days.{UTC day}` — **server-only** (rules deny all). `refreshTrending` (every 15 min) sums 14 days, ignores cities under 3 (`TREND_MIN` — a lone private trip can never show), weights in **four broad bands** (3–5, 6–15, 16–50, 50+ → 24/48/72/96 — a weight per count let watchers read exact counts and spot one private trip), caps saved community points at 4000, and rebuilds `aggregates/heatmap` = baseline + trending + the daily job's public stop points saved at `serverState/heatCommunity`; it writes only on change and **never without that saved doc** (`heatWrite`: on shipping day it ran first and replaced 1,259 points with the 150 baseline ones). Backfill: `node scripts/backfill-trends.mjs [--dry-run]` (sets, safe to re-run). `useHeatmap` polls every 10 min (`refetchInterval`; the Search tab never remounts). Privacy policy promises bands only, never counts or who
- **Editorial seed** — `scripts/seed-destinations.mjs` (Admin SDK; key at `~/.config/supernova/service-account.json`, Gemini key from `functions/.env`, Mapbox/Google from `.env.local`). Flags: `--dry-run`, `--only a,b,c`, `--limit N`, `--reground` (re-place stops of existing editorial trips, no AI cost). Idempotent: counts existing editorial trips per destination before generating. Writes trips through `tripDocuments()` (`functions/src/tripDocs.ts`) — the same writer `generateTrip` uses, so seeded trips are ordinary AI trips plus `isEditorial: true` and `destinationKeys`. Grounding accepts a geocoder answer only if it is a business whose own words are mostly the stop's (`plausibleMatch` in `seedSupport.ts`) — a stop left unplaced beats one pinned to the wrong venue. It publishes as the **"Supernova" editorial account** (`editorial@galaxielabs.space`, `users/{uid}.isEditorial: true`) — its profile photo is the star (`profile_photos/{uid}/avatar.png`, the app icon at 512px; set 2026-10-01) — never run `deleteAccount` against it. 30 of the catalog's 60 destinations are seeded (2026-09-30); seed more with `--only`
- **Comments** (`postEvents.ts` `onCommentCreated`, `commentEvents.ts`) — replies carry `replyTo: { commentId, rootId, authorUid, authorName }` (one level of threading; `utils/commentThreads.ts` groups them, and a reply whose root is gone shows at the top level). A new comment notifies the person replied to (`comment_reply`) and the post author (`post_comment`), never twice and never yourself (`commentNotificationTargets`). Comment likes live at `comments/{id}/likes/{uid}` with a `likesCount` that rules let anyone move by exactly one; `onCommentLikeCreated` sends `comment_like`. A comment may be deleted by its author **or the post's author**; `onCommentDeleted` removes its likes and every notification carrying its `commentId`. Notification types are mapped in `utils/notificationRoute.ts` (push data is already generic over `postId`)
- `onPostDeleted` / `onTripDeletedRemovePosts` (`postCleanupFunctions.ts`) — a deleted post takes its comments, likes, its own uploads in Storage (`posts/{authorUid}/…` only — the client can't delete Storage files, and download URLs stay public until the object is gone), the author's like/comment notifications for it, and other users' saved copies (`savedTrips` where `postId`, a collection-group query on a declared `fieldOverride`). A deleted trip deletes its **owner's** posts that share it (never another user's). Pure rules in `postCleanup.ts`. Both idempotent, so overlapping with `deleteAccount` is harmless
- **Private accounts** (`privacyFunctions.ts`, pure rules in `privacy.ts` / `utils/privacy.ts`) — `users/{uid}.settings.privacy == 'private'`. Non-followers see a locked profile (photo, name, @username, bio, counts) with **Request to follow**; `followRequests/{requester}_{target}` → `follow_request` notification → Accept/Decline in the list via the `respondToFollowRequest` callable (writes the follow + both counts once, Admin SDK; rules refuse a direct follow of a private account). `onUserPrivacyChanged`: going private flips the account's `public` trips **and posts** to `followers` with `publicWhenAccountPublic: true`; going public restores exactly those and approves every pending request. Rules refuse making a trip Public while private; pickers grey it out. Posts now carry `visibility` (`onPostCreatedVisibility` fills it for older apps; feed asks for `visibility == 'public'`). **Step 2 still to do:** the posts *read* rule is still "any signed-in user" because 1.0.1/1.0.2 feeds query without a visibility filter and would be refused — once most users are on 1.0.2+, tighten it to public / author / follower and switch `PostsGrid` to per-visibility queries
- **Sharing a trip** (`tripPreview.ts` pure, `tripPreviewFunction.ts`; client `utils/tripShare.ts`, `components/trip/ShareTripSheet`, `hooks/useShareTrip`) — the Share button on a trip (not private or `moderationHidden`: `canShareTrip`) sends it to people you can message, or shares `https://supernova-a2125.web.app/trip/{id}`. A trip message carries `trip: DmTripSnapshot` (rendered by `components/messages/TripMessageCard`) **and always a `text`** — the note, or `Shared a trip: {title} — {url}` — because 1.0.2 and earlier read only `text`; `trip.note` says which. The message rule allows exactly those keys. The link: Hosting rewrites `/trip/**` to the `tripPreview` function, which renders details only for a public trip by a public account that isn't hidden (`previewEligibility`) and a generic page otherwise, everything HTML-escaped, cached 5 min. **Trip covers are Places URLs carrying our Maps key — never publish one**: `coverLookup` sends them through Places' `skipHttpRedirect` for the key-less `photoUri`. Universal links: `ios.associatedDomains` in `app.json` + `hosting/.well-known/apple-app-site-association` (Hosting's `ignore` was narrowed so the dot-folder deploys); they work only in builds from 1.0.3, older apps open Safari's preview page
- **Place photos & reviews** (spec `docs/superpowers/specs/2026-10-09-place-reviews-design.md`; `placeReviews.ts` pure, `placeReviewFunctions.ts`) — `placeReviews/{placeId}_{uid}` (one per person per place; rating 1–5 or null, text ≤1000, ≤6 photos in Storage `place_photos/{uid}/{placeId}/`), written by the author with `setDoc(…, {merge: true})` so the server's `visited` / `moderationHidden` stay. `onPlaceReviewWritten` sets `visited` (a collection-group query on `activities.placeId`, declared field override, then trip membership) and recomputes `placeStats/{placeId}` (server-only). Report target type `review` (auto-hidden at 3). Shown on the place sheet by `components/places/PlaceReviewsSummary` — **one line only** (rating → the list, Add photos, Write a review): the sheet is a fixed, non-scrolling panel and photos plus a review card pushed it past the screen; photos live on the list screen, built from the moderation-filtered reviews (never `placeStats.latestPhotos`, which ignores blocks). Hidden inside `AddStopSheet` (`showReviews={false}`: a full-screen RN Modal would cover the pushed screens). Rules pin `updatedAt`/`createdAt` to `request.time` and only accept photo URLs from the author's own `place_photos/{uid}/` (only for a Google place id); from a trip stop the sheet drops "Plan a trip here" for **Add photos · Write a review**. Screens `app/place/review.tsx` (compose/edit) and `app/place/reviews.tsx` (all, visitors first, moderation-filtered). `deleteAccount` removes reviews and the photo folder
- `onReportCreated` / `onBlockCreated` (`moderationEvents.ts`) — push `MODERATOR_UIDS` on each report and set `moderationHidden: true` on a post/comment/trip at 3 distinct reports; remove follows both ways on a block. `isBlockedBetween()` also gates `createDmThread` and `inviteToTrip`. Pure decisions in `moderation.ts`. Runbook: `docs/moderation.md`
- **AI consent** (`aiConsent.ts`) — `generateTrip` and `parseTravelConfirmation` refuse with `failed-precondition` unless `users/{uid}.aiConsentVersion >= AI_CONSENT_VERSION` (App Store 5.1.2(i): permission before personal data goes to a third-party AI). Any new Gemini-backed callable must check it too. Client side: wrap the action in `useAiConsentGate().requireConsent(purpose, action)` and render its `consentSheet`; withdraw in Settings → Privacy. Bump the version in both `functions/src/aiConsent.ts` and `utils/aiConsent.ts` when what's shared changes
- **Ask Nova** — the in-app agent (specs `docs/superpowers/specs/2026-10-14-trip-agent-design.md`, phase 2 `2026-10-16-nova-phase2-design.md`; pure `agentTripContext.ts`, `agentTripOps.ts`, `agentWalletOps.ts`, `agentSurfaces.ts`, `agentModel.ts`, `agentPrompt.ts`; wiring `agentFunctions.ts`). Callable `agent` `{ surface, subjectId, message, requestId, capabilities }`: **one** Gemini call per message (`gemini-2.5-flash`, thinking 0, retried once on an unreadable answer) proposes operations; **the model decides what, code decides where**. Voice: warm local friend, ≤ 3 sentences; `polishReply` strips filler openers ("I can help with that", "I'm sorry") the model keeps despite the prompt. **The response schema is one `anyOf` variant per operation with its own required fields** — Gemini sends only required fields (with optional ones, 0/21 places came with a search query and reservations came without dates). Context gives each stop's distance from the previous one and the day's route km (the model judges nearness only from these), packing items `k1…`, and the caller's **own** trip bookings `b1…` (linked, or unlinked within the dates ±1 day; never codes — only "has code"). Capabilities: `trip.v1` (stops, route, dates), `trip.v2` (`editStop` incl. re-placing via `query`, `optimizeDay`, `swapDays`, `updateTrip`, packing), `wallet.v1` (`addReservation` — transit stored as `activity` + `transitMode`; linked only for paid accounts — `linkBooking` (Pro; free → paywall), `unlinkBooking`, `updateBooking` reservations only, boarding passes link/unlink only). **An app only receives operations it declared, so shipped apps survive new ones.** App side: every new place is grounded **before Apply** inside the day's city (`utils/agentGround.ts`: name match + ≤ 25 km; `hooks/useAgentGrounding.ts`), shown with its address or greyed "Couldn't find this near {city}"; placement by distance (`utils/routePlacement.ts`: least added km, hotels at the ends, meals in order, timed/booked stops fixed; a named `after` wins unless it backtracks > 2 km); apply through `useCreateTrip` / `useTripRoute` / `services/packing.ts` / wallet writes (`utils/agentApply.ts`, `utils/agentWallet.ts`, `hooks/useAgent.ts`), so rules decide as for manual edits. Undo covers stop, packing and trip-detail changes; route and wallet changes are confirmed instead. On open, `utils/tripCheck.ts` (no AI, free) greets by first name and offers ≤ 2 fixes: zig-zag day (≥ 1.4× and ≥ 3 km over the best order → local "Reorder day N"), stop > 25 km out, dinner before lunch, a timed stop during a flight/train. `components/agent/NovaAvatar.tsx`: the star in a gradient ring, breathing while Nova thinks. One monthly allowance (10 free / 300 Pro), ≤ 20/hour, one at a time, charged only on success; `requestId` makes retries free. Consent: `AI_CONSENT_MIN.agent` = 3 (wallet bookings). Measured 2026-10-17: ~$0.00077 and ~1.2 s per message (≈ $0.23 for a Pro month of 300). Threads `users/{uid}/agentThreads/{surface}_{id}/messages`; `onTripDeletedAgentThreads` cleans up. **Before changing the model, prompt or schema run `node scripts/agent-eval.mjs [--trip ID] [--verbose]`** (after `cd functions && npm run build`): valid proposals, change requests acted on, label leaks, apologies, places with a query, trip.v2 and wallet use, cost. A new surface adds a context builder + validator, `OP_CAPABILITY` entries, schema variants and an app adapter
- `types.ts` — shared TypeScript interfaces for Cloud Function request/response shapes

**Never call Gemini or any third-party secret API directly from client code.** All such calls go through Cloud Functions.

### Services

- `services/firebase.ts` — `auth`, `db`, `storage`, `functions` singletons
- `services/revenuecat.ts` — `configureRevenueCat(uid)`: sets log level, calls `Purchases.configure` with platform-specific keys; called in `_layout.tsx` after auth fires
- `services/gemini.ts` — `callGenerateTrip(request)`: calls the `generateTrip` Cloud Function via `httpsCallable`
- `services/oauth.ts` — `configureGoogleSignIn()`, `signInWithGoogle()`, `signOutGoogle()`, `isAppleAuthAvailable()`. The **only** file permitted to import a provider SDK. `signInWithGoogle` resolves `null` when the user dismisses the sheet — since v13 the SDK reports cancellation by resolving `{ type: 'cancelled' }`, not by throwing, so cancellation is a return-value check and never a `catch`. `revokeAppleSignIn()` revokes Apple tokens before account deletion (Apple requirement); it needs the Apple provider's OAuth code flow configuration (Services ID, Team ID, Key ID, private key) set in the Firebase console
- `services/session.ts` — `hydrateSession(firebaseUser): Promise<boolean>`. Everything that must happen once a profile document is known to exist (store hydration, `tier`, push token, RevenueCat), returning whether it exists. Called from **two** places: the auth listener and `complete-profile` right after it writes. Both are required — `onAuthStateChanged` does not fire on a Firestore write
- `services/push.ts` — `registerPushTokenIfGranted(uid)` (never prompts; called by `hydrateSession`), `maybePromptForPush(uid, tier, trigger)` (in-context asks: a Pro user saving a boarding pass, a DM sent, a trip invite sent) and `requestPushNow(uid)`. **The iOS sheet appears only from those two.** Since 2026-10-08 the product owner wants the ask at sign-up: `app/notification-intro.tsx` ("Know when it matters"), opened once per account by `hooks/usePushIntro` when it first reaches the tabs with permission `undetermined` (`utils/pushIntro.ts`). Its "Turn on" calls `requestPushNow`; "Not now" leaves the one-per-install iOS sheet unspent for the in-context asks. Settings → Notifications shows the state and asks, or opens iOS Settings once denied. Never throws
- `services/account.ts` — `deleteAccount(): 'deleted' | 'cancelled'`: revokes Apple tokens for Apple accounts (backing out of the Apple sheet cancels; any other revocation failure is logged and deletion proceeds), calls the callable (540s timeout), then signs out of Google, RevenueCat, and Firebase so the auth listener routes to welcome. The UI is in `app/settings/account.tsx`, which warns subscribers that deletion doesn't cancel Pro
- `services/tier.ts` — `reconcileServerTier(queryClient)`: calls `reconcileTier`, updates `useAuthStore.serverTier`, invalidates the quota queries. Dedupes concurrent callers and never throws. `useAuthStore` holds `tier` (live, from the SDK) and `serverTier` (what Firestore last said); a mismatch triggers this call
- `services/places/placeCache.ts` — shared cross-user cache of Google Places tier2 data in a **top-level `places/{placeId}`** collection. `enrichPlaceById()` reads it first and writes through on a miss, so **every** caller (globe sheet, AddStopSheet, trip activity sheet, cover resolver) gets it for free. The tier2 field mask sits in the costly Atmosphere SKU, and without this every user paid again for every place every session — cost scaled with engagement, which is backwards for a subscription. 30-day TTL (`CACHE_TTL_MS`): only rating and hours drift, and a short TTL buys staleness with real money. Never authoritative — a miss, a stale entry or a failed read just runs the normal Google path. **Importing anything from `googlePlaces.ts` now pulls in `@/services/firebase`**, so a Jest suite that touches it must mock that and AsyncStorage (see `__tests__/utils/placeQuery.test.ts`)
- **Offline trips and wallet** (spec `docs/superpowers/specs/2026-10-19-offline-trips-design.md`, 1.0.8+; view only) — `services/queryPersist.ts` keeps an **allow-listed** slice of the TanStack cache in AsyncStorage (`utils/offlineCache.ts` `shouldPersistQuery`: queries **with data** (a failed refresh keeps its last copy) whose key holds **this uid**; own trip lists incl. the profile tab's `['trips', uid, 'withJoined']`, `trip`/`tripBookings`/`packingItems` for the offline trip set — ≤ 40 trips, in progress → upcoming → no dates → past, `offlineTripSet` over `tripsForOffline(own, joined)` — boarding passes, reservations, shared bookings). Timestamps come back via `reviveTimestamps` (`firestore/timestamp/` marker). Buster `offline-v1:{uid}`, 30-day max age, and **persisted roots get `gcTime` = 30 days** (`keepOfflineQueriesAlive`; the default 5 min dropped saved trips from disk). Late throttled writes are refused unless their buster is the signed-in account's (`serializeIfCurrent`); a different uid signing in clears memory; no mutations are persisted; **wiped on sign-out/account deletion** (auth listener's signed-out branch: `stopPersistence({ wipe: true })` + `clearSessionSnapshots()`). `services/offline.ts`: NetInfo drives `onlineManager` (queries pause offline), `useIsOnline`, `requireOnline()` (writes refused offline — the web SDK would lose them on app close) and `onlineOnly(mutation)`. A cold start offline opens the tabs from `sessionSnapshot:{uid}` (`saveSessionSnapshot` after every hydrate; `canUseSnapshot` only when the read failed **and** `looksOffline` — no connection, captive/plane Wi-Fi, or Firestore `unavailable`) and re-hydrates on reconnect (cancelled on any auth change, only for the still-signed-in uid). Journal and budget are guarded too (not cached, so an offline save would overwrite them). `useOfflinePrefetch` (tabs layout) loads trip details while online when the saved copy is missing or > 12 h old. Screens with nothing saved (feed, explore, notifications, other profiles) show `OfflineEmptyState`; `OfflineBanner` is a small pill above the tab bar (a top strip hid every header's buttons). **A new persisted query key is a deliberate change in `utils/offlineCache.ts`** (wallet barcodes live in this cache)
- `services/profile.ts` — `buildUserProfile()` (pure, testable field shape) and `createUserProfile()` (adds `createdAt`, writes with `{ merge: true }`). Sole writer of the new-account `users/{uid}` shape

### Hooks (`hooks/`)

| Hook | Returns |
|---|---|
| `useTheme` | `{ colors, isDark, mode }` — resolves system theme |
| `useFeed(tab)` | Infinite-paginated feed posts (TanStack Query). **Not personalized** — `'forYou'` queries the `posts` collection globally by `createdAt desc`, with no follow filter, so every user sees every post. The `users/{uid}/feed` fan-out is still a TODO in `hooks/useFeed.ts`. `'following'` is a placeholder that returns only your own posts, and is currently unreachable: `app/(tabs)/index.tsx` hardcodes `useFeed('forYou')` |
| `usePost(id)` | Single post query by ID |
| `usePostLike(postId)` / `useCommentLike(postId, commentId)` | Both wrap one `useLikeToggle`. `{ liked, setLiked(next) → accepted }` — optimistic like toggle (transaction on `likes/{uid}_{postId}` + `likesCount`). Owned by `FeedCard` so the heart button and the **double tap on the media** (`doubleTapLike` in `utils/postActions.ts`: like with a heart burst, again to unlike with a broken heart) share one state; a toggle while one is saving is refused, and the burst only shows when accepted |
| `useOwnPostActions(onDeleted?)` | `{ openOwnPostActions(post, anchor) }` — the ⋯ menu on **your own** post (feed card and post screen): Edit post / Delete post, confirmation worded by `deletePostConfirm` (a trip post says the trip stays). Someone else's post keeps `useContentActions` (Report / Block). Deleting goes through `services/posts.ts` `deletePost()` |
| `useSearch(text)` | `{ users, trips, isSearching }` — Algolia v5, 350ms debounce |
| `useExplore` | `{ trips, tripsLoading, suggestions, suggestionsLoading }` |
| `useDestinations` | The catalog (`destinations/*`, one `getDocs`, `staleTime` 12 h) → `{ destinations, isLoading, isError }`. Also exports `useDestination(slug)` (from the same cached list, so a cold deep link loads it) and `useDestinationTrips(slug)` (public trips tagged with it, by saves, moderation-filtered, split into editorial picks and travelers' trips; uses the `(visibility, destinationKeys CONTAINS, savesCount DESC)` index) |
| `useHeatmap` | `aggregates/heatmap` → GeoJSON points (one read, `staleTime` 12 h); `null` when missing/empty, so the globe draws no heat layer |
| `usePublicProfile(uid)` | `{ profile, isLoading, isFollowing, isOwnProfile }` |
| `useUserProfile(uid)` | Raw user profile query by UID |
| `useFollow(uid)` | `{ follow, unfollow }` mutations |
| `useConnections(uid, kind)` | A profile's Followers or Following (`follows` where followee/follower, newest first, ≤ 300, sorted client-side to avoid a composite index), as `UserProfile`s minus blocked users. Shown by `app/connections/[uid].tsx`, opened by tapping either count on any profile |
| `useTripList(uid)` | TanStack Query result for user's trips (also exports `usePublicTrips`, and `useProfileTrips(uid, { isOwnProfile, viewerFollows })` for a profile's Trips tab). **Never query another user's trips by `authorUid` alone** — Firestore rules aren't filters, so one private trip makes the whole query fail and the tab comes back empty. `useProfileTrips` runs one query per visibility (`public`, plus `followers` when you follow them) on the `(authorUid, visibility, createdAt desc)` index |
| `useTrip(id)` | Single trip query with nested days/activities |
| `useTripRoutes(tripId, missing, canWrite)` | The trip map's cached route legs from `trips/{id}/routes/cache`; fetches missing ones from Mapbox Directions (`services/mapboxDirections`) **only when `canWrite`** — a viewer can't write the cache, so fetching for them would re-bill every open |
| `useCreateTrip` | Create/update/delete trip + day/activity mutations. `updateTrip()` invalidates `['trip', id]`, `['trips']`, and `['publicTrips']` (prefix match) so a silent backfill (e.g. `useTripCoverResolver`) shows up in every list view, not just the trip's own detail query |
| `useTripCoverResolver` | `{ resolveCover(trip, isOwner) }` — owner-only, silent, once-ever backfill of a trip's `coverImageUrl` from Google Places. For AI-generated trips (destination is a name only, no `placeId`) it grounds the destination first via `enrichPlaceByQuery`, same lazy-grounding call used for AI activity stops, then resolves the photo. Called from `trip/[id].tsx` (on open) and `profile.tsx` (across the whole trip list, sequentially, on mount) |
| `useAuthorProfiles(uids)` | Batched `users/{uid}` lookup (`documentId() in [...]`, chunked to 30) → `Record<uid, {name, avatarUrl}>`. Feeds `TripCard`'s `author` prop for lists spanning multiple authors (Saved tab, Explore, public profile) — profile's own Trips tab skips this and uses the already-loaded own profile directly |
| `useAiGenerateTrip` | AI generation mutation; on quota exceeded opens the hosted paywall via `useLimitPaywall`, then returns to the form |
| `useLimitPaywall(onReturn?)` | What a server-enforced limit does: hosted RevenueCat paywall → reconcile the server tier on purchase/restore/already-Pro, falling back to `/paywall` if the hosted paywall can't show |
| `useBoardingPasses` | `{ boardingPasses, isLoading, addPass, deletePass }` |
| `useReservations` | `{ reservations, isLoading, addReservation, deleteReservation }` |
| `useLoyaltyPrograms` | `{ loyaltyPrograms, isLoading, addProgram, deleteProgram }` |
| `usePurchases` | `{ purchasePro, restorePurchases, isLoading, error }` |
| `useTripBookings(tripId)` / `useMyTrips(enabled?)` / `useBookingTripLink(kind, id)` / `useBookingMatch()` | Wallet ↔ trips: your bookings on a trip (owner-only), your own + collaborator trips as `TripSummary`, manual link/unlink/"Not for a trip" (`utils/walletLink.ts` `linkPatch`), and match-after-save |
| (wallet) **By trip** segment | Pro (free → paywall); first segment and where Pro lands (`defaultSegment`). Each trip folds/opens (`isSectionOpen`: soonest upcoming open, rest folded; choices in `stores/useWalletSectionsStore`, per device). `utils/walletByTrip.ts` `walletByTrip(trips, passes, reservations, today)` groups by `tripId`: upcoming trips soonest first (in-progress counts; empty ones still show), bookings on no trip or a deleted/foreign trip under NOT ON A TRIP, past trips folded. Rendered by `components/wallet/WalletByTripList`. No server work — it reads the links `matchBooking` already wrote |
| `useAgent({ surface, trip, enabled })` | `{ messages, sending, quota, send, apply, applyLocal, dismiss, clear }` — Ask Nova on a trip (thread read with `getDocs`, newest 30); `applyLocal` runs the trip check's free fixes |
| `useNotificationRouting` | Nothing — mounted once in `app/_layout.tsx`. Routes a tapped notification (warm or cold-start) once navigation and auth have settled |

### Tier / Monetisation

The tier (`free | pro | business`) is fetched from Firestore `users/{uid}.tier` on every auth state change and stored in `useAuthStore`. RevenueCat (`react-native-purchases`) handles purchase flows — `usePurchases` wraps `Purchases.purchasePackage` and `Purchases.restorePurchases`. A `syncTier` Cloud Function (webhook) is expected to update `users/{uid}.tier` after a successful purchase; `useAuthStore.tier` is the authoritative runtime source.

Free tier: 1 AI-generated trip per week (enforced server-side via `usage_quotas`).

**Prices (2026-10-19, owner's call):** Pro **$4.99/month, $39.99/year, $149.99 lifetime** on both stores (was $2.99 / $23.99 / $99.99; Play from 2026-10-19, Apple scheduled for 2026-10-21 — Apple allows no same-day change), raised before any real marketing; existing subscribers keep their old price. No price is hard-coded in the app or the hosted paywall — change them in App Store Connect and Play Console only.

**Trials, offer codes, gifts (2026-10-06):**
- **1-week free trial** — an Apple introductory offer on Monthly and Yearly (App Store Connect, no end date). Apple decides eligibility; the app asks `checkTrialOrIntroductoryPriceEligibility` in `useOfferings`, and `PlanView.freeTrial` is non-null only when eligible. Apple 3.1.2 requires the terms next to the button: `trialTerms()` ("1 week free, then $39.99/year. Cancel anytime.", CTA "Try free for 1 week"; prices always come from the store, never hard-coded). The RevenueCat-hosted limit paywall has the same wording via an "Introductory offer" rule (edited in RevenueCat's builder; hosted paywalls update without an app release)
- **Offer codes** — never a home-made code field (App Store 3.1.1). "Redeem a code" on the paywall and in Settings opens Apple's sheet (`presentOfferCodeSheet`). Live: **SUPERNOVAFRIENDS** on Yearly — free for 1 year, **does not auto-renew**, new/existing/expired subscribers, 500 uses (Apple's minimum for a custom code), expires 2026-12-31. Link: `https://apps.apple.com/redeem?ctx=offercodes&id=6810490710&code=SUPERNOVAFRIENDS`
- **Gifting Pro** — `node scripts/gift-pro.mjs <username|uid:UID> [--days N | --lifetime] [--dry-run]` grants a RevenueCat promotional entitlement and sets `users/{uid}.tier` the way `reconcileTier` does. When it lapses, the client's tier mismatch triggers `reconcileTier`. Usernames can collide with leftover profiles that have no login — the script refuses unless exactly one account can sign in. Never gift the App Review demo account (the review notes say it is free)

### TypeScript Types (`types/`)

`types/index.ts` — all core domain types:

| Type/Interface | Description |
|---|---|
| `Tier` | `'free' \| 'pro' \| 'business'` |
| `ThemeMode` | `'dark' \| 'light' \| 'system'` |
| `UserProfile` | uid, displayName, username, avatarUrl, bio, location, follower/following/tripsCount, tier, createdAt |
| `Post` | travel post with authorUid, caption, mediaType, mediaUrl, placeName/placeId/lat/lng, likesCount, commentsCount, tags |
| `Comment` | authorUid, text, createdAt |
| `Trip` | title, destination (name/placeId/lat/lng/countryCode), visibility, collaborators[], isAiGenerated, status, tags, likesCount, savesCount |
| `TripWithDays` | `Trip` extended with `days: TripDay[]` |
| `TripDay` | dayNumber, date, title, notes, activities[] (loaded from subcollection client-side) |
| `TripActivity` | type (ActivityType), title, placeId, startTime/endTime (wall-clock strings, NOT Timestamps — **never preset**: AI itineraries are written without them since 2026-10-09, `order` is the plan; the stop shows `utils/stopTime` = your time, else the matched booking's `time` / train departure), durationMinutes, notes, bookingRef, cost, currency, mediaUrls, order |
| `ActivityType` | `'flight' \| 'hotel' \| 'restaurant' \| 'activity' \| 'transport' \| 'free'` |
| `TripStatus` | `'planning' \| 'active' \| 'completed'` |
| `TripVisibility` | `'public' \| 'followers' \| 'private'` |
| `BoardingPass` | airline, flightNumber, origin/destination (IATA codes), departureTime/arrivalTime (ISO 8601), seat, gate, barcode, status |
| `BoardingPassStatus` | `'upcoming' \| 'checked_in' \| 'boarded' \| 'completed' \| 'cancelled'` |
| `Reservation` | type (ReservationType), title, confirmationCode, checkIn/checkOut (ISO 8601 date), `time` ("HH:MM" as printed, restaurant/activity/show — parsed from confirmations, entered on the form) |
| `ReservationType` | `'hotel' \| 'airbnb' \| 'rental_car' \| 'restaurant' \| 'activity'` |
| `LoyaltyProgram` | programType, programName, memberNumber, balance, unit, tier, expiryDate, isManual |
| `LoyaltyUnit` | `'miles' \| 'points' \| 'nights' \| 'segments'` |
| `LoyaltyTier` | `'standard' \| 'silver' \| 'gold' \| 'platinum' \| 'diamond'` |
| `CreateTripInput` / `UpdateTripInput` | mutation input shapes. `UpdateTripInput.destination` (optional) exists specifically so `useTripCoverResolver` can persist a grounded placeId/lat/lng/countryCode back onto an AI trip whose destination started as a name only |

`types/ai.ts` — AI generation types:
- `TravelStyle`: `'adventure' | 'luxury' | 'budget' | 'family' | 'cultural'`
- `GenerateTripRequest`: destination, countryCode, startDate/endDate (ISO string | null), durationDays, travelStyle, mustSee[], preferences

### Design System

All design tokens live in `constants/`:
- `colors.ts` — exports `DarkColors` and `LightColors`; `useTheme()` resolves the correct set. Brand: purple `#a78bfa`, pink `#f472b6`, blue `#60a5fa`. Accent: amber `#fbbf24`, teal `#34d399`. `colors.text.inverse` = text colour for branded (purple) surfaces.
- `typography.ts` — `FontSize`, `FontWeight`, `FontFamily`, `LineHeight`, `LetterSpacing`
- `spacing.ts` — `Spacing` (4px base), `BorderRadius`, `Shadow` (`Shadow.sm / .md / .lg` — purple-tinted)
- `icons.ts` — Phosphor icon + semantic color maps; import from here instead of hard-coding icon/color pairs:
  - `ACTIVITY_ICONS: Record<ActivityType, { Icon, color }>` — blue flights, purple hotels, pink restaurants, teal activities, amber transport, grey free time
  - `RESERVATION_ICONS: Record<ReservationType, { Icon, color }>`
  - `LOYALTY_ICONS: Record<LoyaltyProgram['programType'], { Icon, color }>`
  - `VISIBILITY_ICONS: Record<TripVisibility, { Icon, color }>`
  - `PAYWALL_FEATURE_ICONS: Array<{ Icon, color, label, description }>` — the Pro features the paywall sells (only ones Pro actually unlocks)
  - `TAB_ICONS: Record<string, PhosphorIcon>` — tab bar icons (Create tab uses a gradient `+` circle, not an icon)
  - `PhosphorIcon` — re-exported `Icon` type from `phosphor-react-native`

UI primitives in `components/ui/`:
- `Button` — variants: `primary` (LinearGradient purple→pink), `secondary`, `ghost`, `danger`; sizes: `sm | md | lg`; props: `label`, `onPress`, `loading?`, `disabled?`
- `GlassCard` — `BlurView` frosted glass with configurable `intensity`
- `Avatar` — sizes: `xs | sm | md | lg | xl`; props: `uri?`, `name`, `size`
- `Badge` — pill/tag component
- `TypeIconBubble` — 44×24 icon bubble for activity/reservation type; uses `ACTIVITY_ICONS`/`RESERVATION_ICONS` maps
- `DismissKeyboardView` — a `View` whose empty space dismisses the keyboard on tap. For screens with no scrollable to drag (see Architecture Rule 14). Inner touchables are unaffected; it is `accessible={false}` so VoiceOver doesn't read it as one screen-sized button. When the container it replaces used `gap`, move the `gap` onto this wrapper or the spacing collapses

Feed components in `components/feed/`:
- `FeedCard` — travel post card (photo/video + author metadata, like/comment counts)
- `FeedActions` — like, comment, and save buttons row
- `VideoPlayer` — feed clips on `expo-video` (`expo-av` is gone): the cover (`thumbnailUrl`) shows until the first frame, plays only while its card is active, muted by `stores/useFeedSoundStore` (muted until the speaker is tapped, held while scrolling, not persisted), landscape (`aspect > 1.05`) shown whole over a blurred cover. Also used by the post screen
- **Video posts** (spec `docs/superpowers/specs/2026-10-10-video-posts-design.md`; rules in `utils/videoPost.ts`): Add to feed → `app/post/create-video.tsx` (iOS picker trims to 30 s) → `useCreatePost.createVideoPost`: `react-native-compressor` 1.19.x (720p, ~2.5 Mbps; 2.x needs Nitro) → cover via `expo-video-thumbnails` → both uploaded to `posts/{uid}/videos/` → **the post doc last**, so a failed upload never leaves a broken post. Doc: `mediaType 'video'`, `mediaUrl` = mp4 (older apps' feeds play it), `mediaUrls: [cover]` (older post screens show it), `thumbnailUrl`, `durationSec`, `aspect` — **the aspect comes from the cover frame, not the asset**, since iPhone portrait clips are often stored sideways with a rotation flag. Grids use `gridImageUrl` (an `Image` can't draw an mp4; 1.0.4 and older show a blank tile). Rules: Storage video ≤ 40 MB, posts `durationSec ≤ 31`. **`patches/react-native-compressor+1.19.4.patch` (patch-package, `postinstall`) strips the filming location** from compressed clips on iOS and Android — the library copies it on purpose and post URLs are public; re-make the patch when upgrading the compressor. Playback (`utils/videoPlayback.ts`): a clip plays only on the active card of a focused screen in a foreground app, with `audioMixingMode: 'auto'` so a muted clip never stops the person's music

Trip components in `components/trip/`:
- `TripCard` — trip preview card for grids and lists. `author?: {name, avatarUrl}` and `fallbackCoverUrl?` are both resolved by the caller and passed in — the card itself never fetches on render (a profile fetch or Places call inside a list-cell render would be a cost/perf footgun). Omit `author` to show no author row at all rather than a fake "Traveler" placeholder
- `DayTimeline` — day-by-day itinerary timeline visualization
- `ActivityItem` — individual activity row (uses `ACTIVITY_ICONS` for type icon + color)
- `AiPromptForm` — AI generation form: destination, dates, travel style (`TravelStyle`), must-see, free-text preferences
- `AiGeneratingAnimation` — loading animation during AI generation (always-dark, does not use `useTheme`): the brand star inside a progress ring (`react-native-svg`) that eases towards ~90% (`progressAt`) and fills + bursts when the trip is ready. `app/trip/ai-generating.tsx` tells the wait as a story (`utils/generatingStory.ts`: ten steps over ~90 s naming the city and styles — the old screen ran out after 9 s and sat on "Finalising" for minutes), rotates "while you wait" cards every 6 s (catalog top places, then app tips), drifts the catalog cover behind (no Places cost), and on success fills the ring, Success haptic, 900 ms, then the trip

Wallet components in `components/wallet/`:
- `BoardingPassCard` — always-dark physical boarding pass card (`#1a1035 → #0f0a2a` gradient)
- `BarcodeDisplay` — QR code via `react-native-qrcode-svg` on white background (scanner constraint)
- `ReservationCard` — list row with `TypeIconBubble` (44×24), title, confirmation code, check-in date
- `LoyaltyCard` — full-width card with `PointsBalance` and inline Phosphor type icon
- `PointsBalance` — formatted balance with `Intl.NumberFormat`, tier badge

Profile components in `components/profile/`:
- `EditProfileSheet` — RN `Modal` (`pageSheet`) for editing display name, bio, location
- `PostsGrid`, `TripsGrid`, `SavedGrid` — profile tab content, used by both the public profile (`app/user/[uid].tsx`) and (for Trips) the owner's own profile tab. `SavedGrid` renders real data only for your own profile (`users/{uid}/savedTrips` is owner-only per Firestore rules) — an honest "private" state otherwise. `TripsGrid` is a thin wrapper around `components/explore/TripGrid`

Search components in `components/search/`:
- `UserResult` — user search result item
- `TripResult` — trip search result item
- `PlaceResult` — Google Places search result item

Explore components in `components/explore/`:
- `UserSuggestion` — suggested user card
- `DestinationCard` — a catalog destination in the Explore grid: tall stored cover photo, eyebrow (`PORTUGAL · 4 TRIPS`), name. Never calls Places
- `FilterChips` — one-select chip row (Explore's region and vibe rows); selected = near-black fill
- `TripGrid` — grid layout for trip cards

Search adds `components/search/DestinationResult` — a catalog destination row in the globe's (always-dark) search sheet, listed above Google results via `matchDestinations`

Moderation (`components/moderation/`, `utils/moderation.ts`, `utils/contentFilter.ts`) — App Store 1.2 for user-generated content:
- `useContentActions()` — `{ openActions, reportSheet, unblock }`. `openActions({ target, ownerName, anchor })` shows Report / Block (native action sheet on iOS, anchored for iPad); render `reportSheet` once per screen. No-op on your own content
- `ReportSheet` — reason picker, then offers to block. Reporting hides the item for the reporter immediately
- **Every list or screen that shows someone else's content must filter it** with `useModeration()` + `filterVisible`/`isContentVisible` (blocked author, reported by you, or `moderationHidden`). Done in feed, post detail + comments, profiles, trips, Explore, Search (Algolia doesn't know about blocks), notifications, and DMs. A new surface that skips this shows blocked users' content
- `containsObjectionableText()` runs before captions, comments, messages, trip titles, profile fields, and usernames are saved. Slurs, sexual terms, self-harm incitement only — not everyday profanity. Check travel false positives (Niger, Scunthorpe, #foodporn) in its tests when adding terms
- State: `users/{uid}/blocked/{uid}`, `users/{uid}/hidden/{contentKey}`, loaded into `useModerationStore` by `hydrateSession`

Legal (`components/legal/`, `constants/legal.ts`):
- `LegalLinks` — "Terms of use · Privacy policy" as two 44pt tap targets opening in-app browser; takes `color` so pinned-dark screens can use it. On the paywall, welcome, and (as rows) Settings → About. App Store 3.1.2 needs these wherever a subscription is sold. Terms = `hosting/terms.html` (community guidelines + zero tolerance, incorporates Apple's standard EULA); privacy = `hosting/privacy.html`; both served from `supernova-a2125.web.app` via Firebase Hosting (`firebase deploy --only hosting`)

Other components:
- `components/SplashOverlay` — overlay shown during app initialization (before auth resolves)
- `components/paywall/PaywallFeatureList` — pro tier features list; driven by `PAYWALL_FEATURE_ICONS`

**iPad / large screens** (`utils/layout.ts`, `hooks/useLayout`, `components/layout/ReadingColumn`): `supportsTablet` is on, so App Review runs the app on iPad. `isLargeScreen` = `min(width, height) >= 550` (Split View / Slide Over stay phone). `useLayout()` gives `columns` (Explore grids 2/3/4), `galleryColumns` (profile posts 3/4/5), `cardListColumns` (profile trip lists 1/2/3), `feedWidth` (always the full window width — the feed card is full-bleed on every size; it used to cap large screens at a centred 9:16 column, which cropped 4:3 landscape stills *harder* than full bleed and left pure-black gutters, see `feedColumnWidth`), and `contentColumn` (700pt reading measure). Full-screen form/list routes get the column via navigator `screenLayout` + `usesReadingColumn()` — add a new full-screen route there, not inside the screen. Modal routes need nothing: iOS shows them as a ~700pt sheet on iPad. RN `<Modal>`s that aren't transparent sheets should use `presentationStyle={isLarge ? 'pageSheet' : undefined}`. Any width cap must be wider than an iPhone's content area so phones stay identical; tests pin the phone values.

**`NSLocationWhenInUseUsageDescription` must stay in `app.json`**, even though the app never requests location and no screen enables a user-location layer. `@rnmapbox/maps` links CoreLocation (its own `ios/install.md` says to add the key), so Apple's static analysis sees the API reference and rejects the upload with **ITMS-90683** without it. Removing it as "unused" is a mistake already made once — build 4 was delivered with that warning. It does **not** contradict the App Review note that the app never requests device location: a purpose string declares what the binary *could* ask for, not what it does.

**Platform handling**: iOS tab bar and translucent surfaces use `BlurView`; Android uses solid `rgba(10,10,26,0.95)`. Follow this pattern for any frosted-glass UI.

**List performance**: Use `@shopify/flash-list` (`FlashList`) instead of `FlatList` for all scrollable lists. `react-native-draggable-flatlist` is available for drag-to-reorder (e.g., trip activity ordering).

## UI/UX Design Philosophy

**Before writing ANY user-facing UI, read `.claude/skills/supernova-design/SKILL.md` and run its
pre-ship checklist.** That skill is the authority; this section is the summary. UI shipped without
running the checklist is not done.

### The direction: light editorial

**Dark is the default since 1.0.5** (the owner's call, 2026-10-11; `utils/themeDefault.ts`): new installs start dark, settings saved before 1.0.5 were switched to dark once, and a theme picked in Settings (`useThemeStore.chosen`) is never overridden. Light stays a full alternative — every screen must look right in both. The palettes, type and rules below are unchanged; what follows describes the light theme's intent, and the dark theme is the same design on dark tokens.

Supernova is a **light, warm, editorial travel app where photography is the hero.** Think a printed
travel magazine — generous whitespace, confident type, photos that breathe. Dark is reserved
exclusively for **immersive moments**: the Mapbox globe/trip map, the splash screen, and the
AI-generating screen. Those earn darkness; a settings list does not.

Rationale: dark-navy-with-a-purple-gradient is the default aesthetic of every AI-generated app. It's
forgiving — it hides bad spacing and weak type. Light is harder, which is why it reads as designed.
And travel photography needs whitespace the way a painting needs a gallery wall.

### Hard rules (violating any of these is a bug, not a preference)

1. **No emoji. Ever.** Phosphor icons only, from `constants/icons.ts` where a semantic map exists.
   Duotone for semantic/type icons; bold/regular for small utility icons (X, Plus, chevrons).
2. **No dashed borders on actions.** Dashed = dropzone semantics. It reads as a wireframe.
3. **One primary action per screen.** Everything else is secondary or a text link. Three
   identical-weight buttons means the screen has no hierarchy.
4. **Every empty state = icon + title + description + action.** "No activities yet" in grey is not
   an empty state. Name the space and invite: "Start your first day."
5. **Photos lead** on any place/trip/post screen.
6. **Motion on every state change** — house spring `tension: 65, friction: 11`.
7. **Haptics** — `Light` on nav/select, `Medium` on create/add/destructive.
8. **Touch targets ≥44pt; body contrast ≥4.5:1; icon buttons need `accessibilityLabel`.**

### Palette

**Light chrome (default — all app surfaces).** Warm neutrals, never clinical white:

| Token | Value | Use |
|---|---|---|
| Canvas | `#FBF9F5` | Page background |
| Surface | `#FFFFFF` | Cards, sheets |
| Sunken | `#F0EAE0` | Chips, inset areas |
| Hairline | `#E5DDD2` | Dividers (0.5px) |
| Text primary | `#1F1C19` | Headings, body |
| Text secondary | `#6B6157` | Supporting copy |
| Text muted | `#9A8F82` | Metadata, eyebrow labels |
| Text disabled | `#C4B8A8` | Empty-state icons |

**Primary action:** near-black `#1F1C19` with `#FBF9F5` text. Confident, not shouty. Do NOT make
every CTA a purple gradient — that's the AI-default tell.

**Brand accent — sparingly.** The star's violet→pink gradient is a *jewel against neutrals*, not
wallpaper. Reserve for: the star mark, active/selected states, and at most one hero CTA per flow
(e.g. "Generate with AI"). Purple `#7F77DD` · Pink `#D4537E`.

**Semantic:** keep `ACTIVITY_ICONS` (blue flights, purple hotels, pink restaurants, teal activities,
amber transport). On light, use the color for the icon and a ~10% tint for its bubble.

**Dark — immersive moments ONLY** (globe/trip map, splash, AI-generating): Void `#0B0A12` · Elevated
`#171422` · Hairline `#26232E` · Text `#F5F3F9` / `#9C95AD`. The light→dark transition is a
signature moment — fade/scale it, never hard-cut.

### Typography

| Role | Size | Weight | Notes |
|---|---|---|---|
| Screen title | 26–30 | 500–600 | Tight tracking (`-0.02em`) |
| Section head | 17 | 500 | |
| Body | 15 | 400 | `lineHeight: 1.5` |
| Eyebrow / meta | 11 | 500 | Uppercase, letterspaced `0.08em`, muted |
| Caption | 12–13 | 400 | Muted |

**The eyebrow label is the editorial signature** — small, tracked-out, muted, sitting above a big
title (`JUL 25 – 30 · 6 DAYS` above `Trip to Pacific Beach`). This single pattern does more for the
editorial feel than anything else. Sentence case everywhere; never Title Case buttons.

### Spacing & shape

Screen margins **≥20px** (generosity is the point). Card radius 16–20px; buttons/chips 12px or full
pill. Vertical rhythm 8/12/16/20/32. Hairlines `0.5px`. Align **optically**, not just
mathematically.

### Copy voice

Sentence case, contractions, verb-first. Buttons name the verb ("Find a place", not "Submit").
Empty states invite, never apologize. Errors say what happened and what to do. Skip
"successfully", "please", "simply", "just", and exclamation marks.

### Anti-patterns — the AI-generated tells

Dark navy + purple gradient on everything · decorative glassmorphism · gradient on every button ·
emoji as icons · dashed placeholder boxes shipped as real UI · three equal-weight buttons in a row ·
grey "No items yet" as an empty state · perfectly even spacing with no rhythm · cards with borders
AND shadows AND fills.

## Architecture Rules

These rules apply to ALL new code:

1. **No direct Gemini / secret API calls from client** — Cloud Function proxy only
2. **No `onSnapshot` in TanStack Query hooks** — use `getDocs`/`getDoc`. Exception: post comments
3. **All components use `const { colors } = useTheme()`** — never import `DarkColors`/`LightColors` directly, except in always-dark screens: the Mapbox globe/trip map (`app/(tabs)/search.tsx`, `components/trip/TripMapView`), the splash screen (`SplashOverlay`), the AI-generating screens (`AiGeneratingAnimation`, `app/trip/ai-generating.tsx`), `BoardingPassCard` (kept dark deliberately — a boarding pass is a physical-object skeuomorph, not app chrome), and the **auth reveal-transition screens** (`welcome`, `sign-in`, `sign-up`, `complete-profile`), which pin a dark overlay that fades out on first mount to continue the splash palette — all four have always done this; the rule previously omitted them
4. **`StyleSheet.create` is module-level** — it cannot call `useTheme()`. Dynamic/theme-dependent colors go in **inline styles only**, not inside `StyleSheet.create`
5. **`LinearGradient` colors prop** must be typed as `[string, string]`, not `string[]`
6. **`useCallback`** required for all event handlers passed as props to child components
7. **Import `auth`, `db`, `storage`, `functions` from `services/firebase`** — never call `getAuth()`/`getFirestore()` elsewhere
8. **Algolia Search-Only Key on client** — `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY` is read-only. Admin key stays in Cloud Functions only
9. **`@/` path alias** for all imports (maps to project root via `tsconfig.json`)
10. **Haptics**: `expo-haptics` for tap feedback — `Light` on tab press, `Medium` on follow/create actions
11. **Icon + color pairs**: always pull from `constants/icons.ts` maps (`ACTIVITY_ICONS`, `RESERVATION_ICONS`, etc.) — never hard-code icon components or hex colors for typed entities inline
12. **Lists**: use `FlashList` from `@shopify/flash-list` — not `FlatList` — for all scrollable content lists
13. **`TripActivity.startTime` / `endTime`** are wall-clock strings (`"14:30"`), not Firestore Timestamps — never coerce them to Date objects
14. **Every keyboard needs a way down.** Any scrollable that shares a screen with a `TextInput` sets `keyboardDismissMode="on-drag"` — `ScrollView`, `FlashList`, RNGH's `GestureScrollView`, and `NestableScrollContainer` (`react-native-draggable-flatlist`) all take it. Pair it with `keyboardShouldPersistTaps="handled"` where taps land on results: the two solve opposite halves of the problem, the first dismissing on drag and the second keeping the tap from being swallowed. A screen with **no** scrollable wraps its content in `DismissKeyboardView` instead, since there is nothing to drag. This is not optional — search results were rendering underneath a keyboard that could not be dismissed, and number-pad fields have no return key at all. **Forms also need the focused field above the keyboard:** a full-screen form's scroll view sets `automaticallyAdjustKeyboardInsets` (iOS) rather than sitting in a padding `KeyboardAvoidingView`, which shrank the screen but never scrolled to the field — people typed into Additional preferences blind. Bottom sheets keep `KeyboardAvoidingView`, since it lifts the sheet itself
15. **`router.dismissAll()`, not `navigate`, to finish a modal flow.** Eleven root routes are `presentation: 'modal'`, and route navigation does not unwind the modal stack — `navigate('/')` from two modals deep switches the tab *behind* the cards and leaves them on screen. Use `if (router.canDismiss()) router.dismissAll()` then navigate to the destination tab

### Auth components (`components/auth/`)

- `UsernameField` — username input with debounced (500ms) live availability check. Props `{ value, onChangeText, onValidityChange, onBlockingChange?, forUid? }`. **`onValidityChange` and `onBlockingChange` are different questions:** `valid` asks "proven available?" (pristine = false), `blocking` asks "actively wrong or pending?" (pristine = false). A submit button gating on `valid` is dead on a fresh form; gate on `blocking`. Pass `forUid` when the user already has a uid, or they'll be told their own username is taken
- `BirthdayField` — date picker plus the 13+ gate; renders its under-13 message inline at selection time. Props `{ value, onChange, onValidityChange }`
- `SocialAuthButtons` — divider plus the Google and Sign in with Apple buttons (Apple shown when `isAppleAuthAvailable()`, i.e. iOS); owns its error inline

### Utils

- `utils/age.ts` — `isUnder13(date)`. Tests pin the clock with fake timers; without that, `setFullYear` rolls Feb 29 and flips the birthday boundary
- `utils/tierSync.ts` — `shouldReconcileTier(clientTier, serverTier)` and `resolveLimitPaywallAction(outcome)`
- `utils/authRoute.ts` — `resolveAuthRoute({ isAuthenticated, hasProfile, onboardingComplete })`. The profile check precedes the onboarding check deliberately: no `users/{uid}` document means no app entry, whatever the onboarding flag says
- `utils/notificationRoute.ts` — `resolveNotificationRoute(data)`; a push tap uses `notificationTapRoute`, which falls back to `/notifications?highlight={notificationId}` (every push carries the in-app doc's id, `pushDataFor(notification, id)`) so a tap is never a dead end, and `NotificationArrivalBanner` repeats the push's title/body on the screen it opened. Push wording lives in `functions/src/pushCopy.ts`: the title says who did what, the body quotes it. The single table mapping a notification `type` + id to an href, shared by the push tap (`useNotificationRouting`) and the in-app list (`app/notifications.tsx`) so the two can't drift. Returns `null` for an unknown type or missing id — an older build must survive a notification type shipped after it. **Adding a notification type means adding it here and in `functions/src/pushData.ts`**, which are separate TypeScript projects and cannot share a module
- `utils/activityPlace.ts` — `canShowPlaceSheet(activity)` and `activityToPlace(activity)`. Tapping an itinerary stop opens `PlaceDetailSheet` (its third consumer, after the globe and AddStopSheet) instead of flying the map to a pin, which is what made a trip full of hand-picked places look like circles on a map. The seed is deliberately **tier1** — the sheet upgrades to tier2 on open, and claiming tier2 would leave the photo rail permanently empty. A Mapbox-grounded stop has coordinates but no Google `placeId`, so it gets `''` rather than null: that is the signal for "nothing to upgrade"
- `utils/tripRoutes.ts` — the trip map's geometry: `legMode` (walking < 2.5 km, driving, arc for flights/ferries/> 400 km), `legKey` (cache key from endpoints — a moved stop just misses), great-circle arcs that cross the antimeridian the short way, polyline6 decoding, `buildPath` (path + where each stop sits on it + missing legs), `markerStops`/`overviewDots`, `actualStopOrder`, `actualViewAvailable`. **Any new trip-map line goes through `buildPath`** so it uses the cache and never re-bills Directions
- `utils/flyover.ts` — the trip map's flyover as a pure reducer (play/pause/tick/jump/stop, day durations 6–18 s). The drawing head stops on every stop for `STOP_DWELL_MS` (2.5 s) — `tick` takes each day's `stopFractions` — while the camera flies in to it and the card shows it (`stopEyebrow`: `DAY 2 · SAT, NOV 25 · STOP 3 OF 6`)
- **Destination boxes** (`resolveCityBounds`, `services/places/mapboxSearch.ts`): with the destination's own lat/lng, the box is the city that point is in (Mapbox Geocoding v6 **reverse**, types place); a by-name box is kept only if it holds the point (`boundsHoldPoint`), else ±0.2° around the point. By name alone "Mission Beach" became Mission, Texas and a San Diego trip's stops were grounded in McAllen (2026-10-09; also Dollywood → Hollywood FL, Kennedy Space Center → Colorado)
- **Bookings become stops** (`functions/src/bookingStops.ts` pure, `bookingStopFunctions.ts`; run from the booking triggers, from `onTripWrittenRematch` when a trip's dates/cities/**visibility** change, and from `onTripDayCreatedBookingStops` when a day is added): a booking shared with a trip its owner is on gets a stop on the day it falls on — doc id `booking_{kind}_{id}`, `fromBooking: {kind, id, ownerUid, auto: true}`, `titleSource: 'user'`. **A stop is readable by everyone who can see the trip**, so (decided 2026-10-09, `bookingStopAllowed`) restaurants/tours/shows become stops on every trip but flights, trains and hotels only on **private** trips, and a stop never carries the confirmation code or the booking's address. A stop already planned for the place gets `fromBooking.auto: false` instead (left alone). Its stop is found by `fromBooking.id`, wherever it is, and follows the booking's date; a stop moved by hand becomes `auto: false` (stays put); a stop a member deletes leaves `trips/{id}/dismissedBookingStops/{kind}_{id}` so it isn't recreated (cleared when the booking leaves the trip). The trip's first day is `trip.startDay` (calendar string, written by the app since 1.0.4; trusted only within a day of `startDate`), else `tripCalendarDay(startDate)`. DayTimeline matches a booking to its stop by `fromBooking` first
- **Stops typed by hand** get `searchQuery` = title + their day's city (`manualSearchQuery`; not free time/transport/flights), so the background pass puts them on the map like AI stops
- **Reordering stops** is its own full-screen sheet (`components/trip/ReorderStopsSheet`, opened by long-pressing a stop): a top-level `DraggableFlatList` plus up/down arrows. Drag-in-place (a `NestableDraggableFlatList` per day inside the trip page's scroll, in an iOS page sheet) lifted the stop to the top and wouldn't move it
- **Travel styles** are nine (`STYLE_RULES`): adventure, luxury, budget, family, cultural, party, relax, foodie, romantic. Not stored on trips, so older apps are unaffected; deploy `generateTrip` before shipping a client that sends a new one
- `utils/destinations.ts` / `utils/heatmap.ts` — the discovery UI's rules: parse a catalog doc, region/vibe filter, eyebrow, accent-insensitive search match, editorial/community split, top place → tier1 place; flattened heat points → GeoJSON, destination pins, and the pin-tap hit test. The globe's pins are the **catalog** (`destination-pin`/`destination-label` layers; a tap opens `/destination/[slug]` before any POI or nearby lookup), with a `HeatmapLayer` beneath that fades out between zoom 7 and 10
- **Map look** (`utils/mapLook.ts`): **one style always** — Standard with every 3D detail (`show3dLandmarks`, `show3dFacades`, `show3dTrees`, buildings, landmark icons) plus raster-DEM terrain 1.4×, config memoized (not re-sent per flyover tick). **Satellite is a raster under Standard, never a styleURL swap** (placement rules in the satellite bullet below; build 31: swapping to Standard Satellite left the map blank; it has no 3D anyway). A flyover plays at `lightPreset: 'day'`. **Legs stay wide** (`zoomForLeg`: walk 15, drive ≤ 14): at 15.5–16 the moving camera outran the tiles and only the route line drew. The close-up (`arrivalCamera`, 15.5 / pitch 60, then a slow circle) happens only where the camera pauses, at stops
- `utils/flyoverCamera.ts` — the flyover's follow camera: `aheadBearing` (face where the route is going), `limitTurn` (≤ 25° a second), `legZoom` (lift between stops, capped at 1.5, back down into the next) and `legPitch` (58° at street level, flattening to 45° by zoom 11 — at 58° pulled back, a portrait screen was half sky). It aims where the drawing head will be when the 1 s `linearTo` glide ends, and the reducer's `dt` is capped at 100 ms (a busy frame used to skip whole stops). Each day opens with `DAY_INTRO_MS` (4 s): the day's route framed at 40°, then the fly-in to stop 1. Close-ups (`arrivalCamera`, zoom 15.5) happen only at stops — on a moving leg that close, tiles can't keep up and only the route line draws. The trip map always uses the `day` light preset
- **Satellite on the trip map is a `RasterSource` (`mapbox://mapbox.satellite`) under Standard, never a styleURL swap** (swapping to Standard Satellite left the map blank, and `basemap` is persisted, so every trip stayed blank). The `RasterLayer` goes `belowLayerID: 'trip-routes-casing'` with `rasterEmissiveStrength: 1`, and the JSX must come **after** the routes `ShapeSource` — pointing `belowLayerID` at a layer not yet added made the style reload in a loop (blank map on a fresh mount)
- **Grounding (`searchPlaceInBounds`) takes 5 results, picks the one named like the place (`pickBestFeature`), and asks again by the name alone when the answer shares no word of it (`nameOnlyRetry`).** Boxed to San Diego with a city-centre proximity, "Belmont Park, San Diego" came back as the airport *alone* — the city words outranked the place's — so re-ranking alone couldn't fix it
- **Trip map load health** (`utils/mapLoadHealth.ts`, `services/mapDiagnostics.ts`): build 32 on real phones sometimes kept only coarse tiles and no satellite imagery for minutes, then recovered — failed downloads waiting out Mapbox's retry back-off, invisible because the map ignored `onMapLoadingError`. Now each map records up to 5 distinct failures (source + message) in **`mapDiagnostics`** (create-only, own uid, read with the Admin SDK; removed by `deleteAccount`) with app version/build, iOS version and `Device.modelId`, and shows "The map didn't fully load · Retry" after 15 s without loading or after 3 failures; Retry remounts the `MapView` (`key`) and re-fits the trip. **Read the diagnostics before guessing at a map bug.** The trip map also calls `setAccessToken` itself. Settings → About shows "1.0.4 (33)" (`expo-application`)
- **Mapbox Standard custom layers need `…EmissiveStrength: 1`.** Without it the dusk/night light presets shade our own lines and circles near-black — the trip map showed no routes or pins at all after dark. The globe's destination pins have it too. The trip map draws its overview stop dots as `MarkerView`s: its `CircleLayer` drew nothing on the simulator despite reporting rendered features — recheck on a device before relying on circle layers there
- `constants/routePalettes.ts` + `stores/useMapStyleStore` — the traveler's route colour palette (per device); every colour is tested ≥ 4.5:1 against the dark map
- **Multi-city route** (`utils/tripRoute.ts`, `hooks/useTripRoute.ts`, `components/trip/RouteEditorSheet.tsx` / `CitySection.tsx`; spec `docs/superpowers/specs/2026-10-09-city-route-design.md`) — each city has `Destination.nights`; city i arrives on start + Σ nights before it; N nights = N + 1 days, the departure day in the last city. **Days stay documents**: every route change (`planRoute` → one `saveRoute` batch) rewrites each day's `dayNumber` + `destinationIndex`, creates/deletes days (with their stops — confirmed first via `dropsWithStops`), and sets the trip's end date, so code and older apps that read `destinationIndex` keep working. Trips without nights derive them (`routeNights`: saved → from days → even split of the dates). The trip page groups a multi-city itinerary into folding `CitySection`s (All, or one city via its pill) with Getting here / Staying from `utils/cityBookings.ts`, a ⋯ menu (change nights, move, remove — days deleted or moved to the neighbour), and "Add a day in {city}" (= nights + 1). Edit trip's end-date change is absorbed by the last city (`absorbEndDateChange`). Single-city trips are unchanged
- `utils/dateRange.ts` — the trip calendar's rules (`selectDay`, `isDaySelectable`, `tripDayCount`, `formatRangeLabel`), all on calendar components so a daylight-saving change can't shift a count. The one date control is `components/ui/DateRangeField` → `DateRangeSheet`, used by the wizard, the AI form (required, max 21 days — `utils/aiTripLength.ts`, enforced by `generateTrip` too; it was 14 until 2026-10-05) and `EditTripSheet`
- `utils/venueTitle.ts` — renames a grounded hotel/restaurant/bar stop after the business it resolved to ("Dinner: Seafood by the Bay" → "Dinner at The Fish Market"), only when `GroundedPlace.isVenue` (Mapbox `feature_type: 'poi'`, or Google `types` with `establishment` and not `political`). Grounding also stores `TripActivity.placeName`, which the place sheet and Booking.com hand-off use instead of the title
- `utils/hotelStay.ts` — a hotel stop's own check-in/check-out for Booking.com (first to last day that hotel appears), not the whole trip's dates
- **Train / bus / ferry tickets** — shown as reservation type `transit` but **stored as `type: 'activity'` + `transitMode`**; `reservationKind()` (`utils/bookingDays.ts`) reads it back. Apps before 1.0.3 look up `RESERVATION_ICONS[type]` and **crash on any type they don't know** — a stored `'transit'` crashed the wallet on 1.0.2/build 19 (2026-10-08). The importers (`bookingsFromParse`, `forOlderApps` on the paste-import result) never emit `'transit'`. **Never store a new enum value that shipped apps will look up in a map** — add a field next to an old value instead. Times are kept as printed (`departureLocalTime` "09:19"), never converted
- `utils/bookingDays.ts` — which trip day a booking lands on (flight by its printed `localDate`, else the device-local day as `BoardingPassCard` shows it; hotels as check in / staying / check out), its row text, and `bookingMatchesStop` (same kind + every distinctive word of the booking's name in the stop's, so a different hotel in the same city never takes its details). Unmatched bookings render as a block above the day's stops, not interleaved, so the drag-to-reorder list holds only stops
- `utils/pushPrompt.ts` — `shouldPromptForPush({ trigger, tier, permission, alreadyAsked })`. Returns false for a free user adding a boarding pass, because `checkFlightStatus` never polls a free user's flight at all: asking would promise a notification they can't receive

**Testing note:** there is no React Native component-testing library in this project. Every test in `__tests__/` is a pure-function test. Push logic out of components into `utils/` or `services/` to make it testable rather than adding a renderer.
