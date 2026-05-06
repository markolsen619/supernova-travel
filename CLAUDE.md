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

## Environment

Copy `.env.local.example` to `.env.local` and fill in all keys. Client vars are prefixed `EXPO_PUBLIC_` so Expo exposes them to the bundle. Cloud Function vars are set via `firebase functions:config:set` or Firebase environment secrets — never `EXPO_PUBLIC_`.

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_FIREBASE_*` | client | Firebase project config |
| `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` | client | Places autocomplete (New API) |
| `EXPO_PUBLIC_REVENUECAT_IOS_KEY` | client | RevenueCat iOS SDK |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | client | RevenueCat Android SDK |
| `EXPO_PUBLIC_ALGOLIA_APP_ID` | client | Algolia search app ID |
| `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY` | client | Algolia **Search-Only** key (never Admin) |
| `ALGOLIA_APP_ID` | Cloud Function | Algolia sync (Admin key context) |
| `ALGOLIA_ADMIN_KEY` | Cloud Function | Algolia index write access |
| `AVIATIONSTACK_API_KEY` | Cloud Function | Flight status polling |
| `GEMINI_API_KEY` | Cloud Function | AI trip generation (never expose to client) |

## Architecture

### Routing (Expo Router v6)

File-based routing under `app/`:
- `(auth)/` — unauthenticated stack: welcome, sign-in, sign-up, forgot-password
- `(tabs)/` — main tab bar: feed (index), explore, create, search, profile
- `(wallet)/` — travel wallet stack: boarding-passes, reservations, loyalty programs (linked from profile, not a tab)
- `trip/[id]` — trip detail (modal)
- `trip/new` — manual trip builder (modal, multi-step wizard)
- `trip/ai-generate` — AI generation form (modal)
- `trip/ai-generating` — generation loading screen (modal, routes to `trip/[id]` on completion)
- `post/[id]` — post detail (modal)
- `user/[uid]` — full-screen public profile (push)
- `settings` — settings modal (theme toggle, account, sign out)
- `paywall` — RevenueCat paywall modal

**Auth routing is centralised in `app/_layout.tsx`** via a single `onAuthStateChanged` listener. On sign-in it calls `configureRevenueCat(uid)`, registers the Expo push token, fetches the user's `tier`, then `router.replace('/(tabs)')`. On sign-out: `router.replace('/(auth)/welcome')`. There is no route guard middleware.

Path alias `@/` maps to the project root (see `tsconfig.json`).

### State Management

Three Zustand stores in `stores/`:
- `useAuthStore` — Firebase `User | null`, `tier: 'free' | 'pro' | 'business'`, initialization flag
- `useUserStore` — cached `UserProfile` (displayName, avatarUrl, bio, location, follower counts)
- `useThemeStore` — `mode: 'dark' | 'light' | 'system'`, persisted via AsyncStorage; `useTheme()` hook resolves `'system'` via `useColorScheme`

TanStack React Query (staleTime 2 min, 2 retries) wraps all Firestore reads. **No `onSnapshot` listeners in hooks** — use `getDocs`/`getDoc` only. Exception: post comments screen uses `onSnapshot` directly in a `useEffect`.

### Firebase

`services/firebase.ts` exports `auth`, `db`, `storage`, `functions` as named singletons. Import these directly — never call `getAuth()` / `getFirestore()` elsewhere.

Firestore collections:
- `users/{uid}` — profile + `tier` + `expoPushTokens[]`; subcollections: `feed/`, `notifications/`, `savedTrips/`
- `posts/{postId}` — travel posts; subcollection `comments/`
- `trips/{tripId}` — itineraries; subcollections: `days/{dayId}`, `days/{dayId}/activities/{activityId}`
- `follows/{docId}` — follow graph
- `boarding_passes/{passId}` — owner-only (`isOwner(resource.data.ownerUid)`)
- `reservations/{reservationId}` — owner-only
- `loyalty_programs/{programId}` — owner-only
- `usage_quotas/{uid}` — server-side Admin SDK only
- `reports/{reportId}` — create-only from client

**The `feed/` and `notifications/` subcollections are write-only from Cloud Functions.** `usage_quotas` is entirely server-side.

### Cloud Functions (`functions/src/`)

All functions use Firebase Functions v2.

- `generateTrip` — HTTPS callable; receives `GenerateTripRequest`, calls Gemini 1.5 Flash, writes `trips` + `days` + `activities` subcollections, enforces weekly quota via `usage_quotas`
- `checkFlightStatus` — Cloud Scheduler every 30 min; queries upcoming boarding passes, calls AviationStack HTTP API, updates Firestore status, sends Expo push notifications
- `syncTripToAlgolia` — `onDocumentWritten('trips/{tripId}')`; upserts/deletes public trips in Algolia `trips` index
- `syncUserToAlgolia` — `onDocumentWritten('users/{uid}')`; upserts/deletes users in Algolia `users` index

**Never call Gemini or any third-party secret API directly from client code.** All such calls go through Cloud Functions.

### Services

- `services/firebase.ts` — `auth`, `db`, `storage`, `functions` singletons
- `services/revenuecat.ts` — `configureRevenueCat(uid)`: sets log level, calls `Purchases.configure`; called in `_layout.tsx` after auth fires
- `services/gemini.ts` — `callGenerateTrip(request)`: calls the `generateTrip` Cloud Function via `httpsCallable`

### Hooks (`hooks/`)

| Hook | Returns |
|---|---|
| `useTheme` | `{ colors, isDark }` — resolves system theme |
| `useSearch(text)` | `{ users, trips, isSearching }` — Algolia v5, 350ms debounce |
| `useExplore` | `{ trips, tripsLoading, suggestions, suggestionsLoading }` |
| `usePublicProfile(uid)` | `{ profile, isLoading, isFollowing, isOwnProfile }` |
| `useFollow(uid)` | `{ follow, unfollow }` mutations |
| `useTripList(uid)` | TanStack Query result for user's trips |
| `useTrip(id)` | Single trip query |
| `useCreateTrip` | Create trip mutation |
| `useAiGenerateTrip` | AI generation mutation; redirects to `/paywall` on quota exceeded |
| `useBoardingPasses` | `{ boardingPasses, isLoading, addPass, deletePass }` |
| `useReservations` | `{ reservations, isLoading, addReservation, deleteReservation }` |
| `useLoyaltyPrograms` | `{ loyaltyPrograms, isLoading, addProgram, deleteProgram }` |
| `usePurchases` | `{ purchasePro, restorePurchases, isLoading, error }` |

### Tier / Monetisation

The tier (`free | pro | business`) is fetched from Firestore `users/{uid}.tier` on every auth state change and stored in `useAuthStore`. RevenueCat (`react-native-purchases`) handles purchase flows — `usePurchases` wraps `Purchases.purchasePackage` and `Purchases.restorePurchases`. A `syncTier` Cloud Function (webhook) is expected to update `users/{uid}.tier` after a successful purchase; `useAuthStore.tier` is the authoritative runtime source.

### Design System

All design tokens live in `constants/`:
- `colors.ts` — exports `DarkColors` and `LightColors`; `useTheme()` resolves the correct set. Brand: purple `#a78bfa`, pink `#f472b6`, blue `#60a5fa`. Accent: amber `#fbbf24`, teal `#34d399`. `colors.text.inverse` = text colour for branded (purple) surfaces.
- `constants/typography.ts` — `FontSize`, `FontWeight`, `FontFamily`, `LineHeight`, `LetterSpacing`
- `constants/spacing.ts` — `Spacing` (4px base), `BorderRadius`, `Shadow` (`Shadow.sm / .md / .lg` — purple-tinted)

UI primitives in `components/ui/`:
- `Button` — variants: `primary` (LinearGradient purple→pink), `secondary`, `ghost`, `danger`; sizes: `sm | md | lg`; props: `label`, `onPress`, `loading?`, `disabled?`
- `GlassCard` — `BlurView` frosted glass with configurable `intensity`
- `Avatar` — sizes: `xs | sm | md | lg | xl`; props: `uri?`, `name`, `size`
- `Badge`

Wallet components in `components/wallet/`:
- `BoardingPassCard` — always-dark physical boarding pass card (`#1a1035 → #0f0a2a` gradient)
- `BarcodeDisplay` — QR code via `react-native-qrcode-svg` on white background (scanner constraint)
- `ReservationCard` — list row with type emoji, title, confirmation code, check-in date
- `LoyaltyCard` — full-width card with `PointsBalance` and program type emoji
- `PointsBalance` — formatted balance with `Intl.NumberFormat`, tier badge

Profile components in `components/profile/`:
- `EditProfileSheet` — RN `Modal` (`pageSheet`) for editing display name, bio, location
- `PostsGrid`, `TripsGrid`, `SavedGrid` — profile tab content (Posts/Saved are placeholders)

Search/Explore components in `components/search/` and `components/explore/`.

Paywall component: `components/paywall/PaywallFeatureList`.

**Platform handling**: iOS tab bar and translucent surfaces use `BlurView`; Android uses solid `rgba(10,10,26,0.95)`. Follow this pattern for any frosted-glass UI.

## Architecture Rules

These rules apply to ALL new code:

1. **No direct Gemini / secret API calls from client** — Cloud Function proxy only
2. **No `onSnapshot` in TanStack Query hooks** — use `getDocs`/`getDoc`. Exception: post comments
3. **All components use `const { colors } = useTheme()`** — never import `DarkColors`/`LightColors` directly, except in always-dark screens (`BoardingPassCard`, `AiGeneratingAnimation`, AI generation screens)
4. **`StyleSheet.create` is module-level** — it cannot call `useTheme()`. Dynamic/theme-dependent colors go in **inline styles only**, not inside `StyleSheet.create`
5. **`LinearGradient` colors prop** must be typed as `[string, string]`, not `string[]`
6. **`useCallback`** required for all event handlers passed as props to child components
7. **Import `auth`, `db`, `storage`, `functions` from `services/firebase`** — never call `getAuth()`/`getFirestore()` elsewhere
8. **Algolia Search-Only Key on client** — `EXPO_PUBLIC_ALGOLIA_SEARCH_KEY` is read-only. Admin key stays in Cloud Functions only
9. **`@/` path alias** for all imports (maps to project root via `tsconfig.json`)
10. **Haptics**: `expo-haptics` for tap feedback — `Light` on tab press, `Medium` on follow/create actions
