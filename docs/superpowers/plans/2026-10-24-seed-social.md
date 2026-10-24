# Seeding the Social Side Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The feed never runs dry (trip cards mixed in and continuing past the last post) and new users are offered travelers to follow (onboarding step + feed page).

**Architecture:** Pure rules in `utils/feedMix.ts` (`feedTripPool`, `mixFeed`) and `utils/travelerSuggestions.ts` (`rankSuggestions`); data hooks `hooks/useFeedTrips.ts`, `hooks/useTravelerSuggestions.ts`; UI `components/feed/FeedTripCard.tsx`, `components/feed/TravelerSuggestionsPage.tsx`, onboarding slide `components/onboarding/OnboardingFollowSlide.tsx`; wiring in `app/(tabs)/index.tsx` and `app/(auth)/onboarding.tsx`. Client only — no Cloud Functions, rules or indexes change.

**Tech Stack:** Expo Router, TanStack Query, Firestore web SDK, FlashList, Jest.

**Spec:** `docs/superpowers/specs/2026-10-24-seed-social-design.md`

## Global Constraints

- No new content, AI or paid API; the trip pool is one `trips` query: `visibility == 'public'`, `orderBy('createdAt','desc')`, `limit(100)`, `staleTime` 10 min.
- A trip card every **3** posts; suggestions page at index **2** while following < **3**; up to **6** suggestions.
- Suggestion eligibility = `pickCommunityFaces` rules + not blocked + not followed; ranked by most recent post, then followers.
- Everything someone else made is moderation-filtered (`filterVisible`); never your own trips; trips need a cover.
- Copy: "Travelers to follow", "Follow a few travelers to fill your feed with their trips.", "Supernova pick", "Open trip", "Continue", eyebrow `YOUR PEOPLE`. Sentence case, no "!".
- Design rules (supernova-design skill): photo leads, one primary action, Phosphor icons only, `useTheme()` colours (feed pages are full-bleed dark media like `FeedCard`), haptics Light on open/follow handled by existing button.

## Review Focus

1. The feed's `activeIndex` / video playback: `isActive` must still mean "this post is on screen" when non-post pages sit between posts (a video must not play behind a trip card).
2. Pagination: `onEndReached` must still fetch the next page of posts while trip cards are interleaved, and stop asking once posts are exhausted (trip cards then fill the rest).
3. A user who follows 3 people mid-session: the suggestions page may stay until the next load — acceptable, but it must never duplicate.
4. Moderation: a blocked author's trip or a `moderationHidden` trip never appears as a card or in suggestions.
5. Onboarding with zero eligible suggestions: the slide count, dots and "last slide" logic stay correct (6 slides).

---

### Task 1: Mixing the feed (pure)

**Files:** Create `utils/feedMix.ts`; Test `__tests__/utils/feedMix.test.ts`

**Interfaces — Produces:**
`type FeedTrip = { id: string; authorUid: string; title: string; coverImageUrl: string | null; destinationName: string; days: number | null; isEditorial: boolean; savesCount: number; createdAtMs: number; moderationHidden?: boolean }`;
`type FeedItem = { kind: 'post'; post: P } | { kind: 'trip'; trip: FeedTrip } | { kind: 'suggestions' }` (generic over the post type `P extends { id: string; tripId?: string | null }`);
`feedTripPool(trips: FeedTrip[], selfUid: string | null): FeedTrip[]`;
`mixFeed<P>(posts: P[], trips: FeedTrip[], opts: { postsExhausted: boolean; showSuggestions: boolean; every?: number }): FeedItem<P>[]`;
`tripEyebrow(trip: FeedTrip): string`.

- [ ] **Step 1: Tests**

```ts
// __tests__/utils/feedMix.test.ts
import { feedTripPool, mixFeed, tripEyebrow, type FeedTrip } from '@/utils/feedMix';

const trip = (id: string, over: Partial<FeedTrip> = {}): FeedTrip => ({
  id, authorUid: 'a', title: `Trip ${id}`, coverImageUrl: 'https://x/c.jpg', destinationName: 'Lisbon', days: 5,
  isEditorial: false, savesCount: 0, createdAtMs: 0, ...over,
});
const post = (id: string, tripId: string | null = null) => ({ id, tripId });
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind[0]).join('');

describe('feedTripPool', () => {
  it('travelers\' trips newest first, then editorial picks by saves', () => {
    const pool = feedTripPool([
      trip('e1', { isEditorial: true, savesCount: 2 }), trip('t1', { createdAtMs: 1 }),
      trip('e2', { isEditorial: true, savesCount: 9 }), trip('t2', { createdAtMs: 5 }),
    ], 'me');
    expect(pool.map((t) => t.id)).toEqual(['t2', 't1', 'e2', 'e1']);
  });
  it('needs a cover and is never your own', () => {
    expect(feedTripPool([trip('a', { coverImageUrl: null }), trip('b', { authorUid: 'me' }), trip('c')], 'me').map((t) => t.id)).toEqual(['c']);
  });
});

describe('mixFeed', () => {
  const trips = [trip('t1'), trip('t2'), trip('t3')];
  it('a trip card after every 3 posts', () => {
    const items = mixFeed([post('p1'), post('p2'), post('p3'), post('p4'), post('p5'), post('p6'), post('p7')], trips, { postsExhausted: false, showSuggestions: false });
    expect(kinds(items)).toBe('ppptppptp');
  });
  it('once posts run out, trip cards continue', () => {
    expect(kinds(mixFeed([post('p1'), post('p2')], trips, { postsExhausted: true, showSuggestions: false }))).toBe('ppttt');
  });
  it('while more posts may come, trips are not dumped at the end', () => {
    expect(kinds(mixFeed([post('p1'), post('p2')], trips, { postsExhausted: false, showSuggestions: false }))).toBe('pp');
  });
  it('suggestions at index 2 when asked for', () => {
    expect(kinds(mixFeed([post('p1'), post('p2'), post('p3'), post('p4')], trips, { postsExhausted: true, showSuggestions: true }))).toBe('ppsptptt');
  });
  it('suggestions still appear with fewer than two other items', () => {
    expect(kinds(mixFeed([], [], { postsExhausted: true, showSuggestions: true }))).toBe('s');
  });
  it('a trip already shown as a post is not repeated', () => {
    const items = mixFeed([post('p1', 't1'), post('p2'), post('p3')], trips, { postsExhausted: true, showSuggestions: false });
    expect(items.filter((i) => i.kind === 'trip').map((i) => (i as { trip: FeedTrip }).trip.id)).toEqual(['t2', 't3']);
  });
  it('no trips: posts unchanged', () => {
    expect(kinds(mixFeed([post('p1'), post('p2'), post('p3'), post('p4')], [], { postsExhausted: true, showSuggestions: false }))).toBe('pppp');
  });
});

describe('tripEyebrow', () => {
  it('place and length', () => {
    expect(tripEyebrow(trip('a'))).toBe('LISBON · 5 DAYS');
    expect(tripEyebrow(trip('a', { days: 1 }))).toBe('LISBON · 1 DAY');
    expect(tripEyebrow(trip('a', { days: null }))).toBe('LISBON');
  });
});
```

(Posts p1–p4 with t1 after p3, then t2, t3 once posts are exhausted: `ppptptt`; the suggestions page goes in at index 2: `ppsptptt`.)

- [ ] **Step 2: Run** `npx jest __tests__/utils/feedMix.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement** `utils/feedMix.ts`:

```ts
/**
 * The feed never runs dry (spec 2026-10-24-seed-social-design.md): a trip card after every 3 posts, trip cards
 * continuing once the posts run out, and a "Travelers to follow" page at index 2 for people who follow few.
 */
export type FeedTrip = {
  id: string; authorUid: string; title: string; coverImageUrl: string | null; destinationName: string; days: number | null;
  isEditorial: boolean; savesCount: number; createdAtMs: number; moderationHidden?: boolean;
};
export type FeedItem<P> = { kind: 'post'; post: P } | { kind: 'trip'; trip: FeedTrip } | { kind: 'suggestions' };

export const TRIP_EVERY = 3;
export const SUGGESTIONS_AT = 2;

/** Travelers' trips newest first, then Supernova picks by saves; a cover is required and your own trips never show. */
export function feedTripPool(trips: FeedTrip[], selfUid: string | null): FeedTrip[] {
  const ok = trips.filter((t) => !!t.coverImageUrl && t.authorUid !== selfUid);
  const travelers = ok.filter((t) => !t.isEditorial).sort((a, b) => b.createdAtMs - a.createdAtMs);
  const picks = ok.filter((t) => t.isEditorial).sort((a, b) => b.savesCount - a.savesCount);
  return [...travelers, ...picks];
}

export function mixFeed<P extends { id: string; tripId?: string | null }>(
  posts: P[], trips: FeedTrip[], opts: { postsExhausted: boolean; showSuggestions: boolean; every?: number },
): FeedItem<P>[] {
  const every = opts.every ?? TRIP_EVERY;
  const inPosts = new Set(posts.map((p) => p.tripId).filter(Boolean));
  const queue = trips.filter((t) => !inPosts.has(t.id));
  const out: FeedItem<P>[] = [];
  posts.forEach((post, i) => {
    out.push({ kind: 'post', post });
    if ((i + 1) % every === 0 && queue.length) out.push({ kind: 'trip', trip: queue.shift()! });
  });
  if (opts.postsExhausted) for (const trip of queue) out.push({ kind: 'trip', trip });
  if (opts.showSuggestions) out.splice(Math.min(SUGGESTIONS_AT, out.length), 0, { kind: 'suggestions' });
  return out;
}

/** `LISBON · 5 DAYS` above a trip card's title. */
export function tripEyebrow(trip: FeedTrip): string {
  const place = trip.destinationName.toUpperCase();
  if (!trip.days) return place;
  return `${place} · ${trip.days} ${trip.days === 1 ? 'DAY' : 'DAYS'}`;
}
```

- [ ] **Step 4: Run** — Expected: PASS. **Step 5: Commit** `feat(feed): mix trip cards into the feed`.

### Task 2: Who to suggest (pure)

**Files:** Create `utils/travelerSuggestions.ts`; Test `__tests__/utils/travelerSuggestions.test.ts`

**Interfaces — Produces:** `type SuggestionCandidate = FaceCandidate & { followersCount: number; lastPostMs: number | null }`; `rankSuggestions<T extends SuggestionCandidate>(pool: T[], opts: { selfUid: string | null; following: Set<string>; blocked: Set<string>; max?: number }): T[]`; `SUGGESTION_MAX = 6`; `FOLLOW_TARGET = 3`; `shouldSuggest(followingCount: number, suggestions: number): boolean`.

- [ ] **Step 1: Tests**

```ts
// __tests__/utils/travelerSuggestions.test.ts
import { rankSuggestions, shouldSuggest, SUGGESTION_MAX } from '@/utils/travelerSuggestions';
import { DEMO_REVIEW_UID } from '@/utils/onboardingShowcase';

const c = (uid: string, over: Record<string, unknown> = {}) => ({ uid, name: uid, avatarUrl: 'https://x/a.jpg', followersCount: 0, lastPostMs: null as number | null, ...over });
const opts = { selfUid: 'me', following: new Set<string>(), blocked: new Set<string>() };

describe('rankSuggestions', () => {
  it('people who posted most recently first, then the most followed', () => {
    const r = rankSuggestions([c('quiet', { followersCount: 50 }), c('old', { lastPostMs: 1 }), c('new', { lastPostMs: 9 }), c('popular', { followersCount: 90 })], opts);
    expect(r.map((x) => x.uid)).toEqual(['new', 'old', 'popular', 'quiet']);
  });
  it('never yourself, private, editorial, hidden, the review account, blocked, already followed, or without a photo', () => {
    const pool = [c('me'), c('p', { isPrivate: true }), c('e', { isEditorial: true }), c('h', { moderationHidden: true }), c(DEMO_REVIEW_UID),
      c('b'), c('f'), c('nophoto', { avatarUrl: null }), c('ok')];
    expect(rankSuggestions(pool, { ...opts, blocked: new Set(['b']), following: new Set(['f']) }).map((x) => x.uid)).toEqual(['ok']);
  });
  it('each person once, at most six', () => {
    const pool = [...Array.from({ length: 10 }, (_, i) => c(`u${i}`, { followersCount: i })), c('u9')];
    const r = rankSuggestions(pool, opts);
    expect(r).toHaveLength(SUGGESTION_MAX);
    expect(new Set(r.map((x) => x.uid)).size).toBe(SUGGESTION_MAX);
  });
});

describe('shouldSuggest', () => {
  it('while following fewer than three, and only with someone to suggest', () => {
    expect(shouldSuggest(0, 4)).toBe(true);
    expect(shouldSuggest(2, 1)).toBe(true);
    expect(shouldSuggest(3, 4)).toBe(false);
    expect(shouldSuggest(0, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run** — FAIL (module not found). **Step 3: Implement** `utils/travelerSuggestions.ts`:

```ts
/** Travelers to follow (spec 2026-10-24-seed-social-design.md §2): the onboarding faces' rules, ranked by activity. */
import { DEMO_REVIEW_UID, type FaceCandidate } from '@/utils/onboardingShowcase';

export const SUGGESTION_MAX = 6;
export const FOLLOW_TARGET = 3;
export type SuggestionCandidate = FaceCandidate & { followersCount: number; lastPostMs: number | null };

export function rankSuggestions<T extends SuggestionCandidate>(
  pool: T[], opts: { selfUid: string | null; following: Set<string>; blocked: Set<string>; max?: number },
): T[] {
  const seen = new Set<string>();
  const ok = pool.filter((p) => {
    if (seen.has(p.uid)) return false;
    seen.add(p.uid);
    return !!p.avatarUrl && !p.isPrivate && !p.isEditorial && !p.moderationHidden && p.uid !== opts.selfUid
      && p.uid !== DEMO_REVIEW_UID && !opts.blocked.has(p.uid) && !opts.following.has(p.uid);
  });
  ok.sort((a, b) => (b.lastPostMs ?? -1) - (a.lastPostMs ?? -1) || b.followersCount - a.followersCount);
  return ok.slice(0, opts.max ?? SUGGESTION_MAX);
}

export function shouldSuggest(followingCount: number, suggestions: number): boolean {
  return followingCount < FOLLOW_TARGET && suggestions > 0;
}
```

- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(social): who to suggest`.

### Task 3: Data hooks

**Files:** Create `hooks/useFeedTrips.ts`, `hooks/useTravelerSuggestions.ts`

**Interfaces — Consumes:** Task 1/2 types. **Produces:** `useFeedTrips(): FeedTrip[]` (pooled, moderation-filtered); `useTravelerSuggestions(): { suggestions: TravelerSuggestion[]; followingCount: number; isLoading: boolean }` where `TravelerSuggestion = SuggestionCandidate & { username: string; tripsCount: number; profile: UserProfile }`.

- [ ] **Step 1: `hooks/useFeedTrips.ts`** — one `getDocs(query(collection(db,'trips'), where('visibility','==','public'), orderBy('createdAt','desc'), limit(100)))` under `queryKey ['feedTrips']`, `staleTime` 10 min; map each doc to `FeedTrip` (`destinationName` = `destination.name`, `days` = `tripDayCount(start, end)` when both dates exist else `null`, `isEditorial` = `!!isEditorial`, `savesCount` ?? 0, `createdAtMs` = `createdAt.toMillis()` ?? 0, `moderationHidden`); then `filterVisible(…, moderation, (t) => ({ authorUid: t.authorUid, key: contentKey({ type: 'trip', id: t.id }), moderationHidden: t.moderationHidden }))` and `feedTripPool(…, uid)` in a `useMemo`. Uses the same index as `usePublicTrips` (verify `(visibility, createdAt desc)` exists in `firestore.indexes.json`; if not, add it in this task).

- [ ] **Step 2: `hooks/useTravelerSuggestions.ts`** — query key `['travelerSuggestions', uid]`, `staleTime` 10 min:
  - newest 30 public posts (`posts` where `visibility == 'public'`, `orderBy('createdAt','desc')`, `limit(30)`) → `lastPostMs` per author (first seen = newest);
  - `fetchUserSuggestions()`-style query: users by `followersCount desc`, `limit(30)`;
  - profiles of post authors not in that list via `documentId() in` chunks of 30;
  - the people you follow: `follows` where `followerUid == uid`, `limit(300)` (read the existing field names from `hooks/useConnections.ts`);
  - build candidates `{ uid, name, avatarUrl, isPrivate: settings.privacy === 'private', isEditorial, moderationHidden, followersCount, lastPostMs, username, tripsCount, profile }` and return `{ suggestions: rankSuggestions(candidates, { selfUid: uid, following, blocked: moderation.blockedUids }), followingCount: following.size }`.
  Build the `UserProfile` the way `fetchUserSuggestions` in `hooks/useExplore.ts` does (copy that mapping into a shared `toUserProfile(id, data)` exported from `hooks/useExplore.ts` and use it in both).

- [ ] **Step 3:** `npx tsc --noEmit -p . && npx eslint hooks/useFeedTrips.ts hooks/useTravelerSuggestions.ts hooks/useExplore.ts` — clean. **Step 4: Commit** `feat(social): feed trips and traveler suggestions data`.

### Task 4: The two feed pages

**Files:** Create `components/feed/FeedTripCard.tsx`, `components/feed/TravelerSuggestionsPage.tsx`

- [ ] **Step 1: `FeedTripCard({ trip, author, width, height })`** — full-bleed like `FeedCard`: `FeedPhoto` cover (`components/feed/FeedPhoto`), the same bottom gradient as `FeedCard`, then bottom-left: eyebrow (`tripEyebrow`, 11/500, tracked, `rgba(255,255,255,0.75)`), title (26/600, white, 2 lines), author row (Avatar `xs` + name; for `isEditorial` the brand star image `assets/images/SupernovaStar.png` 20×20 + "Supernova") and, for editorial trips, a small pill **"Supernova pick"** (11/600 uppercase-free, `rgba(255,255,255,0.16)` fill); primary button **"Open trip"** (`components/ui/Button` primary, `haptic="light"`) → `router.push(\`/trip/${trip.id}\`)`; the whole photo also opens the trip (`accessibilityRole="button"`, label `Open trip ${title}`). `author` is `{ name, avatarUrl }` from `useAuthorProfiles`.

- [ ] **Step 2: `TravelerSuggestionsPage({ suggestions, width, height })`** — full-screen dark page (`colors.background.primary`, safe-area top padding like the feed header space): eyebrow `YOUR PEOPLE`, title "Travelers to follow", one line "Follow a few travelers to fill your feed with their trips.", then the list using the existing `components/explore/UserSuggestion` row for each (it already handles Follow / Following / Request / Requested); no other action.

- [ ] **Step 3:** tsc + eslint clean. **Step 4: Commit** `feat(feed): trip cards and the travelers-to-follow page`.

### Task 5: Wire the feed

**Files:** Modify `app/(tabs)/index.tsx`

- [ ] **Step 1:** Build items: `const feedTrips = useFeedTrips(); const { suggestions, followingCount } = useTravelerSuggestions(); const items = useMemo(() => mixFeed(posts, feedTrips, { postsExhausted: !hasNextPage, showSuggestions: shouldSuggest(followingCount, suggestions.length) }), [...])`. Author profiles for trips: include `feedTrips` authors in `authorUids`.
- [ ] **Step 2:** FlashList `data={items}`, `keyExtractor` `post:${id}` / `trip:${id}` / `suggestions`, `getItemType={(i) => i.kind}`, `renderItem` switch: post → `FeedCard` exactly as now with `isActive={screenFocused && index === activeIndex}`; trip → `FeedTripCard`; suggestions → `TravelerSuggestionsPage`. `isActive` stays index-based, so a video only plays when its own page is the visible one (Review Focus 1). Change the ref type to `FlashListRef<FeedItem<Post>>`.
- [ ] **Step 3:** The empty state shows only when `items.length === 0` (no posts **and** no trips **and** no suggestions).
- [ ] **Step 4:** `onEndReached` unchanged (`handleEndReached` fetches the next posts page while `hasNextPage`); trips appear at the end only when `!hasNextPage` (Review Focus 2).
- [ ] **Step 5:** `npx tsc --noEmit -p . && npx eslint "app/(tabs)/index.tsx" && npx jest` — clean, all pass. **Step 6: Commit** `feat(feed): trip cards and suggestions in the feed`.

### Task 6: Onboarding step

**Files:** Create `components/onboarding/OnboardingFollowSlide.tsx`; Modify `app/(auth)/onboarding.tsx`

- [ ] **Step 1: Slide** — same frame as the other slides (`SlideTextBlock` for eyebrow `YOUR PEOPLE` / title "Travelers to follow" / body "Follow a few travelers to fill your feed with their trips."), the `UserSuggestion` rows below (up to 6).
- [ ] **Step 2: Wire** — `const { suggestions } = useTravelerSuggestions()`; `const slideCount = 6 + (suggestions.length > 0 ? 1 : 0)`; replace `SLIDE_COUNT` / `SLIDE_INDEXES` uses with `slideCount` / `Array.from({ length: slideCount }, (_, i) => i)`; `renderSlide` `case 6` → `OnboardingFollowSlide`; the last slide's button reads **"Continue"** (whatever it read before stays for the Pro slide when it is last). Dots use `slideCount` (Review Focus 5).
- [ ] **Step 3:** tsc + eslint clean, `npx jest` passes. **Step 4: Commit** `feat(onboarding): travelers to follow as the last step`.

### Task 7: Docs

- [ ] **Step 1:** CLAUDE.md — the `useFeed` row: append "The feed screen mixes in trip cards and a Travelers-to-follow page (`utils/feedMix.ts`, `useFeedTrips`, `useTravelerSuggestions`, spec 2026-10-24-seed-social-design.md)"; the onboarding paragraph: "a 7th step, Travelers to follow, when anyone is eligible (`rankSuggestions`)".
- [ ] **Step 2:** Commit `docs: seeding the social side`.
