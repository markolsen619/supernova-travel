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
│   └── onboarding.tsx             # 5 slides after sign-up; sets users/{uid}.hasSeenOnboarding
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

### State Management

Three Zustand stores in `stores/`:
- `useAuthStore` — Firebase `User | null`, `tier: 'free' | 'pro' | 'business'`, initialization flag
- `useUserStore` — cached `UserProfile` (displayName, avatarUrl, bio, location, follower counts)
- `useThemeStore` — `mode: 'dark' | 'light' | 'system'`, persisted via AsyncStorage; `useTheme()` hook resolves `'system'` via `useColorScheme`

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

**The `feed/` and `notifications/` subcollections are write-only from Cloud Functions.** `usage_quotas` is entirely server-side.

**Firestore security rules** (`firestore.rules`): public trips/posts are readable by all; boarding passes, reservations, and loyalty programs are owner-only; `usage_quotas` has no client access at all; `reports` is create-only from the client.

### Cloud Functions (`functions/src/`)

All functions use Firebase Functions v2.

- `generateTrip` (`generateTrip.ts`) — HTTPS callable; receives `GenerateTripRequest`, calls Gemini 1.5 Flash, writes `trips` + `days` + `activities` subcollections, enforces weekly quota via `usage_quotas`
- `checkFlightStatus` (`checkFlightStatus.ts`) — Cloud Scheduler every 30 min; queries upcoming boarding passes, calls AviationStack HTTP API, updates Firestore status, then `notifyUser` (in-app row + push). **Live flight status is Pro-only end to end** — a free user's pass is never polled, so its status never changes. Cost decisions are pure and live in `flightPolling.ts` (no firebase-admin, unit-tested): `filterPassesForPaidOwners()` drops free owners **before** anything is spent (one `db.getAll` for the distinct owners — a Firestore read is orders of magnitude cheaper than an API call); `groupPassesByFlight()` makes one call per flight rather than per passenger, normalising the hand-typed flight number first; `shouldPollFlight()` thins the 30-min schedule by distance from departure (every run under 3h, hourly to 12h, every 4h beyond), derived from the clock so back-off costs no extra write. **Any new AviationStack call must go through these** — the previous version polled everyone at full cost and merely suppressed the push afterwards
- `notify.ts` / `pushData.ts` — `notifyUser(uid, payload)` writes the in-app notification doc and sends the push. The push's `data` (what the client taps through on) is derived from the notification doc by `pushDataFor()`, a whitelist of `type` + one id — never a spread of the doc, which holds display fields and would eat Expo's 4KiB payload cap. `pushData.ts` imports no firebase-admin so it stays unit-testable
- `syncTripToAlgolia` / `syncUserToAlgolia` (`syncAlgolia.ts`) — `onDocumentWritten` triggers; upserts/deletes public trips in the Algolia `trips` index and users in the `users` index
- `syncTier` (`syncTier.ts`) — RevenueCat webhook; the normal writer of `users/{uid}.tier`, ordered by `tierEventTimestampMs`
- `reconcileTier` (`reconcileTier.ts`) — HTTPS callable; re-reads the tier from RevenueCat's REST API when a webhook is late or lost. Throttled per user (30s). Pure logic lives in `tierEvents.ts`
- `deleteAccount` (`deleteAccount.ts`) — HTTPS callable; App Store 5.1.1(v) in-app account deletion. Removes the caller's traces in others' data (likes + counts, comments, actor notifications, follows + counts, collaborator slots, invites, DMs), then their own content, Storage folders, RevenueCat customer, and finally the Auth user — last, so a failure leaves them signed in to retry. Idempotent. Pure decisions in `accountDeletion.ts`. Its collection-group queries rely on `fieldOverrides` in `firestore.indexes.json`. **Adding a new per-user collection, subcollection, or Storage folder means adding it here too** — `cancellation_feedback` is *anonymised* rather than deleted (the uid is nulled), since the aggregate "why people leave" is the point of collecting it; `places/{placeId}` is deliberately untouched, being a shared cache keyed by place, not by user
- `tagTripDestinations` / `aggregateDiscovery` (`discoveryFunctions.ts`) — the first tags every public non-editorial trip with the catalog destinations its destinations fall in (`destinationKeys`; cleared when it stops being public; `sameKeys` stops its own write re-triggering it). The second runs daily (04:00 UTC): per-destination `topPlaces` (sights and restaurants only, ranked by how many itineraries include them) and the heat map (world baseline from catalog popularity + community stops). Pure rules in `discovery.ts`. `runAggregation()` is exported for the seed script
- **Editorial seed** — `scripts/seed-destinations.mjs` (Admin SDK; key at `~/.config/supernova/service-account.json`, Gemini key from `functions/.env`, Mapbox/Google from `.env.local`). Flags: `--dry-run`, `--only a,b,c`, `--limit N`, `--reground` (re-place stops of existing editorial trips, no AI cost). Idempotent: counts existing editorial trips per destination before generating. Writes trips through `tripDocuments()` (`functions/src/tripDocs.ts`) — the same writer `generateTrip` uses, so seeded trips are ordinary AI trips plus `isEditorial: true` and `destinationKeys`. Grounding accepts a geocoder answer only if it is a business whose own words are mostly the stop's (`plausibleMatch` in `seedSupport.ts`) — a stop left unplaced beats one pinned to the wrong venue. It publishes as the **"Supernova" editorial account** (`editorial@galaxielabs.space`, `users/{uid}.isEditorial: true`) — its profile photo is the star (`profile_photos/{uid}/avatar.png`, the app icon at 512px; set 2026-10-01) — never run `deleteAccount` against it. 30 of the catalog's 60 destinations are seeded (2026-09-30); seed more with `--only`
- **Comments** (`postEvents.ts` `onCommentCreated`, `commentEvents.ts`) — replies carry `replyTo: { commentId, rootId, authorUid, authorName }` (one level of threading; `utils/commentThreads.ts` groups them, and a reply whose root is gone shows at the top level). A new comment notifies the person replied to (`comment_reply`) and the post author (`post_comment`), never twice and never yourself (`commentNotificationTargets`). Comment likes live at `comments/{id}/likes/{uid}` with a `likesCount` that rules let anyone move by exactly one; `onCommentLikeCreated` sends `comment_like`. A comment may be deleted by its author **or the post's author**; `onCommentDeleted` removes its likes and every notification carrying its `commentId`. Notification types are mapped in `utils/notificationRoute.ts` (push data is already generic over `postId`)
- `onPostDeleted` / `onTripDeletedRemovePosts` (`postCleanupFunctions.ts`) — a deleted post takes its comments, likes, its own uploads in Storage (`posts/{authorUid}/…` only — the client can't delete Storage files, and download URLs stay public until the object is gone), the author's like/comment notifications for it, and other users' saved copies (`savedTrips` where `postId`, a collection-group query on a declared `fieldOverride`). A deleted trip deletes its **owner's** posts that share it (never another user's). Pure rules in `postCleanup.ts`. Both idempotent, so overlapping with `deleteAccount` is harmless
- **Private accounts** (`privacyFunctions.ts`, pure rules in `privacy.ts` / `utils/privacy.ts`) — `users/{uid}.settings.privacy == 'private'`. Non-followers see a locked profile (photo, name, @username, bio, counts) with **Request to follow**; `followRequests/{requester}_{target}` → `follow_request` notification → Accept/Decline in the list via the `respondToFollowRequest` callable (writes the follow + both counts once, Admin SDK; rules refuse a direct follow of a private account). `onUserPrivacyChanged`: going private flips the account's `public` trips **and posts** to `followers` with `publicWhenAccountPublic: true`; going public restores exactly those and approves every pending request. Rules refuse making a trip Public while private; pickers grey it out. Posts now carry `visibility` (`onPostCreatedVisibility` fills it for older apps; feed asks for `visibility == 'public'`). **Step 2 still to do:** the posts *read* rule is still "any signed-in user" because 1.0.1/1.0.2 feeds query without a visibility filter and would be refused — once most users are on 1.0.2+, tighten it to public / author / follower and switch `PostsGrid` to per-visibility queries
- **Sharing a trip** (`tripPreview.ts` pure, `tripPreviewFunction.ts`; client `utils/tripShare.ts`, `components/trip/ShareTripSheet`, `hooks/useShareTrip`) — the Share button on a trip (not private or `moderationHidden`: `canShareTrip`) sends it to people you can message, or shares `https://supernova-a2125.web.app/trip/{id}`. A trip message carries `trip: DmTripSnapshot` (rendered by `components/messages/TripMessageCard`) **and always a `text`** — the note, or `Shared a trip: {title} — {url}` — because 1.0.2 and earlier read only `text`; `trip.note` says which. The message rule allows exactly those keys. The link: Hosting rewrites `/trip/**` to the `tripPreview` function, which renders details only for a public trip by a public account that isn't hidden (`previewEligibility`) and a generic page otherwise, everything HTML-escaped, cached 5 min. **Trip covers are Places URLs carrying our Maps key — never publish one**: `coverLookup` sends them through Places' `skipHttpRedirect` for the key-less `photoUri`. Universal links: `ios.associatedDomains` in `app.json` + `hosting/.well-known/apple-app-site-association` (Hosting's `ignore` was narrowed so the dot-folder deploys); they work only in builds from 1.0.3, older apps open Safari's preview page
- `onReportCreated` / `onBlockCreated` (`moderationEvents.ts`) — push `MODERATOR_UIDS` on each report and set `moderationHidden: true` on a post/comment/trip at 3 distinct reports; remove follows both ways on a block. `isBlockedBetween()` also gates `createDmThread` and `inviteToTrip`. Pure decisions in `moderation.ts`. Runbook: `docs/moderation.md`
- **AI consent** (`aiConsent.ts`) — `generateTrip` and `parseTravelConfirmation` refuse with `failed-precondition` unless `users/{uid}.aiConsentVersion >= AI_CONSENT_VERSION` (App Store 5.1.2(i): permission before personal data goes to a third-party AI). Any new Gemini-backed callable must check it too. Client side: wrap the action in `useAiConsentGate().requireConsent(purpose, action)` and render its `consentSheet`; withdraw in Settings → Privacy. Bump the version in both `functions/src/aiConsent.ts` and `utils/aiConsent.ts` when what's shared changes
- `types.ts` — shared TypeScript interfaces for Cloud Function request/response shapes

**Never call Gemini or any third-party secret API directly from client code.** All such calls go through Cloud Functions.

### Services

- `services/firebase.ts` — `auth`, `db`, `storage`, `functions` singletons
- `services/revenuecat.ts` — `configureRevenueCat(uid)`: sets log level, calls `Purchases.configure` with platform-specific keys; called in `_layout.tsx` after auth fires
- `services/gemini.ts` — `callGenerateTrip(request)`: calls the `generateTrip` Cloud Function via `httpsCallable`
- `services/oauth.ts` — `configureGoogleSignIn()`, `signInWithGoogle()`, `signOutGoogle()`, `isAppleAuthAvailable()`. The **only** file permitted to import a provider SDK. `signInWithGoogle` resolves `null` when the user dismisses the sheet — since v13 the SDK reports cancellation by resolving `{ type: 'cancelled' }`, not by throwing, so cancellation is a return-value check and never a `catch`. `revokeAppleSignIn()` revokes Apple tokens before account deletion (Apple requirement); it needs the Apple provider's OAuth code flow configuration (Services ID, Team ID, Key ID, private key) set in the Firebase console
- `services/session.ts` — `hydrateSession(firebaseUser): Promise<boolean>`. Everything that must happen once a profile document is known to exist (store hydration, `tier`, push token, RevenueCat), returning whether it exists. Called from **two** places: the auth listener and `complete-profile` right after it writes. Both are required — `onAuthStateChanged` does not fire on a Firestore write
- `services/push.ts` — `registerPushTokenIfGranted(uid)` (never prompts; called by `hydrateSession` so an existing grantee's new device still gets pushes) and `maybePromptForPush(uid, tier, trigger)`. **Do not ask for notification permission anywhere else.** iOS allows one system sheet per install, so the ask fires at a moment that explains itself — a Pro user saving a boarding pass, a DM sent, a trip invite sent — never cold during onboarding. Never throws; a failed prompt must not break the action the user actually performed
- `services/account.ts` — `deleteAccount(): 'deleted' | 'cancelled'`: revokes Apple tokens for Apple accounts (backing out of the Apple sheet cancels; any other revocation failure is logged and deletion proceeds), calls the callable (540s timeout), then signs out of Google, RevenueCat, and Firebase so the auth listener routes to welcome. The UI is in `app/settings/account.tsx`, which warns subscribers that deletion doesn't cancel Pro
- `services/tier.ts` — `reconcileServerTier(queryClient)`: calls `reconcileTier`, updates `useAuthStore.serverTier`, invalidates the quota queries. Dedupes concurrent callers and never throws. `useAuthStore` holds `tier` (live, from the SDK) and `serverTier` (what Firestore last said); a mismatch triggers this call
- `services/places/placeCache.ts` — shared cross-user cache of Google Places tier2 data in a **top-level `places/{placeId}`** collection. `enrichPlaceById()` reads it first and writes through on a miss, so **every** caller (globe sheet, AddStopSheet, trip activity sheet, cover resolver) gets it for free. The tier2 field mask sits in the costly Atmosphere SKU, and without this every user paid again for every place every session — cost scaled with engagement, which is backwards for a subscription. 30-day TTL (`CACHE_TTL_MS`): only rating and hours drift, and a short TTL buys staleness with real money. Never authoritative — a miss, a stale entry or a failed read just runs the normal Google path. **Importing anything from `googlePlaces.ts` now pulls in `@/services/firebase`**, so a Jest suite that touches it must mock that and AsyncStorage (see `__tests__/utils/placeQuery.test.ts`)
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
| `useNotificationRouting` | Nothing — mounted once in `app/_layout.tsx`. Routes a tapped notification (warm or cold-start) once navigation and auth have settled |

### Tier / Monetisation

The tier (`free | pro | business`) is fetched from Firestore `users/{uid}.tier` on every auth state change and stored in `useAuthStore`. RevenueCat (`react-native-purchases`) handles purchase flows — `usePurchases` wraps `Purchases.purchasePackage` and `Purchases.restorePurchases`. A `syncTier` Cloud Function (webhook) is expected to update `users/{uid}.tier` after a successful purchase; `useAuthStore.tier` is the authoritative runtime source.

Free tier: 1 AI-generated trip per week (enforced server-side via `usage_quotas`).

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
| `TripActivity` | type (ActivityType), title, placeId, startTime/endTime (wall-clock strings, NOT Timestamps), durationMinutes, notes, bookingRef, cost, currency, mediaUrls, order |
| `ActivityType` | `'flight' \| 'hotel' \| 'restaurant' \| 'activity' \| 'transport' \| 'free'` |
| `TripStatus` | `'planning' \| 'active' \| 'completed'` |
| `TripVisibility` | `'public' \| 'followers' \| 'private'` |
| `BoardingPass` | airline, flightNumber, origin/destination (IATA codes), departureTime/arrivalTime (ISO 8601), seat, gate, barcode, status |
| `BoardingPassStatus` | `'upcoming' \| 'checked_in' \| 'boarded' \| 'completed' \| 'cancelled'` |
| `Reservation` | type (ReservationType), title, confirmationCode, checkIn/checkOut (ISO 8601 date) |
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
- `VideoPlayer` — video playback; uses `expo-av`

Trip components in `components/trip/`:
- `TripCard` — trip preview card for grids and lists. `author?: {name, avatarUrl}` and `fallbackCoverUrl?` are both resolved by the caller and passed in — the card itself never fetches on render (a profile fetch or Places call inside a list-cell render would be a cost/perf footgun). Omit `author` to show no author row at all rather than a fake "Traveler" placeholder
- `DayTimeline` — day-by-day itinerary timeline visualization
- `ActivityItem` — individual activity row (uses `ACTIVITY_ICONS` for type icon + color)
- `AiPromptForm` — AI generation form: destination, dates, travel style (`TravelStyle`), must-see, free-text preferences
- `AiGeneratingAnimation` — loading animation during AI generation (always-dark, does not use `useTheme`)

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
- `utils/notificationRoute.ts` — `resolveNotificationRoute(data)`. The single table mapping a notification `type` + id to an href, shared by the push tap (`useNotificationRouting`) and the in-app list (`app/notifications.tsx`) so the two can't drift. Returns `null` for an unknown type or missing id — an older build must survive a notification type shipped after it. **Adding a notification type means adding it here and in `functions/src/pushData.ts`**, which are separate TypeScript projects and cannot share a module
- `utils/activityPlace.ts` — `canShowPlaceSheet(activity)` and `activityToPlace(activity)`. Tapping an itinerary stop opens `PlaceDetailSheet` (its third consumer, after the globe and AddStopSheet) instead of flying the map to a pin, which is what made a trip full of hand-picked places look like circles on a map. The seed is deliberately **tier1** — the sheet upgrades to tier2 on open, and claiming tier2 would leave the photo rail permanently empty. A Mapbox-grounded stop has coordinates but no Google `placeId`, so it gets `''` rather than null: that is the signal for "nothing to upgrade"
- `utils/tripRoutes.ts` — the trip map's geometry: `legMode` (walking < 2.5 km, driving, arc for flights/ferries/> 400 km), `legKey` (cache key from endpoints — a moved stop just misses), great-circle arcs that cross the antimeridian the short way, polyline6 decoding, `buildPath` (path + where each stop sits on it + missing legs), `markerStops`/`overviewDots`, `actualStopOrder`, `actualViewAvailable`. **Any new trip-map line goes through `buildPath`** so it uses the cache and never re-bills Directions
- `utils/flyover.ts` — the trip map's flyover as a pure reducer (play/pause/tick/jump/stop, day durations 6–18 s). The drawing head stops on every stop for `STOP_DWELL_MS` (2.5 s) — `tick` takes each day's `stopFractions` — while the camera flies in to it and the card shows it (`stopEyebrow`: `DAY 2 · SAT, NOV 25 · STOP 3 OF 6`)
- `utils/destinations.ts` / `utils/heatmap.ts` — the discovery UI's rules: parse a catalog doc, region/vibe filter, eyebrow, accent-insensitive search match, editorial/community split, top place → tier1 place; flattened heat points → GeoJSON, destination pins, and the pin-tap hit test. The globe's pins are the **catalog** (`destination-pin`/`destination-label` layers; a tap opens `/destination/[slug]` before any POI or nearby lookup), with a `HeatmapLayer` beneath that fades out between zoom 7 and 10
- **Mapbox Standard custom layers need `…EmissiveStrength: 1`.** Without it the dusk/night light presets shade our own lines and circles near-black — the trip map showed no routes or pins at all after dark. The globe's destination pins have it too. The trip map draws its overview stop dots as `MarkerView`s: its `CircleLayer` drew nothing on the simulator despite reporting rendered features — recheck on a device before relying on circle layers there
- `constants/routePalettes.ts` + `stores/useMapStyleStore` — the traveler's route colour palette (per device); every colour is tested ≥ 4.5:1 against the dark map
- `utils/dateRange.ts` — the trip calendar's rules (`selectDay`, `isDaySelectable`, `tripDayCount`, `formatRangeLabel`), all on calendar components so a daylight-saving change can't shift a count. The one date control is `components/ui/DateRangeField` → `DateRangeSheet`, used by the wizard, the AI form (required, max 14 days) and `EditTripSheet`
- `utils/venueTitle.ts` — renames a grounded hotel/restaurant/bar stop after the business it resolved to ("Dinner: Seafood by the Bay" → "Dinner at The Fish Market"), only when `GroundedPlace.isVenue` (Mapbox `feature_type: 'poi'`, or Google `types` with `establishment` and not `political`). Grounding also stores `TripActivity.placeName`, which the place sheet and Booking.com hand-off use instead of the title
- `utils/hotelStay.ts` — a hotel stop's own check-in/check-out for Booking.com (first to last day that hotel appears), not the whole trip's dates
- `utils/pushPrompt.ts` — `shouldPromptForPush({ trigger, tier, permission, alreadyAsked })`. Returns false for a free user adding a boarding pass, because `checkFlightStatus` never polls a free user's flight at all: asking would promise a notification they can't receive

**Testing note:** there is no React Native component-testing library in this project. Every test in `__tests__/` is a pure-function test. Push logic out of components into `utils/` or `services/` to make it testable rather than adding a renderer.
