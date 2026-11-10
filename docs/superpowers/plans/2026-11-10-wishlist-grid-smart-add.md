# Wish list grid, smart add, server covers: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make saved TikTok posts easy to find on the profile (a photo grid with city chips), add a saved place to the right day of a trip in one tap (smart add with Change day and Undo), and get covers from the server.

**Architecture:**
- **Pure rules** live in `utils/wishlist.ts` (grid), `utils/smartAdd.ts` (placement and banner), and `functions/src/wishCovers.ts` (cover cache).
- **One new callable,** `wishCovers`, reads TikTok's embed page server-side (proven to work from GCP) and caches the link in the existing server-only `socialPosts/{id}`.
- **The app** gets a `useWishCovers` hook, a `WishlistGrid` replacing `WishlistList`, a `useSmartAdd` hook, and a `SmartAddBanner` component on the trip page.

**Tech Stack:** Expo Router 6 / React Native, TanStack Query, Firebase JS SDK, Firebase Functions v2 (Node 22), Jest (pure-function tests only).

**Spec:** `docs/superpowers/specs/2026-11-10-wishlist-grid-smart-add-design.md`

## Global Constraints

- **Privacy and scope:** the wish list stays private, TikTok-only, and owner-only. No Google Places calls. No images are stored in `users/{uid}/wishlist`, and the firestore rules are unchanged.
- **Placement:** smart add scores days with `bestInsertion` / `insertionCostKm` from `utils/routePlacement.ts`. Timed stops (`startTime`) and booked stops (`fromBooking`) are `fixed`.
- **Order values:** the midpoint between neighbours, or last + 1000, using `orderAt` from `utils/agentApply.ts` (export it). One write, and no other stop is renumbered.
- **Covers:**
  - `wishCovers({ videoIds })` takes at most 30 ids, digits only (`/^\d{8,25}$/`), and only ids present in the caller's own `users/{uid}/wishlist`.
  - A cached cover is reused when `expiresMs − now > 1 h`.
  - Expiry comes from the link's `x-expires` (seconds × 1000). If that's missing or unreadable, now + 24 h. It is capped at now + 14 days.
  - The cover is merged as its own field `cover: { url, expiresMs }` and never touches the cached places. The doc is never created by `wishCovers`.
- **Writes:** writes use `requireOnline()`. Offline copy: "Connect to add this".
- **Banner:**
  - Copy: `Added to Day 6 · Budapest, after Fisherman's Bastion`. With no stop before it: `Added as the first stop of Day 6 · Budapest`. Single-city trips leave out ` · {city}`.
  - Actions: **Change day** · **Undo**. It stays 6 s or until tapped, uses the house spring (`tension 65, friction 11`), and the page scrolls to the new stop.
- **UI rules:**
  - No emoji.
  - Phosphor icons.
  - `const { colors } = useTheme()`, with theme colors inline only.
  - Touch targets ≥ 44 pt with `accessibilityLabel`.
  - Haptics: `Light` on select, `Medium` on add.
  - Sentence case.
  - Every handler passed as a prop is wrapped in `useCallback`.
- **Lists:** `FlashList`, never `FlatList`.
- **Tests:** pure functions only (no component renderer). Run with `npx jest <path>`. The whole suite is `npx jest`, and the functions typecheck is `(cd functions && npx tsc --noEmit)`.
- **Ruling against the spec:** when smart add starts from the saved-post screen, the app opens `/trip/{id}?wishVideo={videoId}&wishPlace={placeId}` and the trip page performs the add, because only the trip page has the days loaded. This replaces the spec's `wishAdded`/`wishDay` params. Task 7 updates the spec line.

## Review Focus

1. **Undated trips** (no `startDay`/`startDate`) must keep every day as a candidate. A past-day filter that treats "no date" as "past" would make smart add do nothing. Pinned by a test in Task 5.
2. **Older trips whose days have `destinationIndex: null`** must still find the city's days, so `smartPlacement` takes the resolved `dayCities` array (from `resolveDayDestinationIndices`), not the raw field. Pinned by a test in Task 5.
3. **A day with located stops vs. an empty day:** an empty day must not win just because adding to it costs 0 km. It scores as unusable unless every candidate day is empty. Pinned by a test in Task 5.
4. **`wishCovers` called with junk** (more than 30 ids, non-digit strings, duplicates, ids not in the caller's wish list) must drop them, never fetch them. Pinned by a test in Task 2.
5. **A cached cover whose `x-expires` is already in the past, or within the hour,** must be refetched, not served. Pinned by a test in Task 2.

---

### Task 1: Grid rules (city chips, filter, eyebrow)

**Files:**
- Modify: `utils/wishlist.ts` (append after `wishByCity`)
- Test: `__tests__/utils/wishlist.test.ts` (append)

**Interfaces:**
- Consumes: `WishSave`, `WishPlace` from `utils/wishlist.ts`.
- Produces:
  - `wishCityChips(saves: WishSave[]): { city: string; count: number }[]`
  - `savesInCity(saves: WishSave[], city: string | null): WishSave[]`
  - `wishCardEyebrow(save: WishSave): string`

- [ ] **Step 1: Write the failing test.** Append to `__tests__/utils/wishlist.test.ts`:

```ts
import { savesInCity, wishCardEyebrow, wishCityChips } from '@/utils/wishlist';
describe('wish list grid rules (spec 2026-11-10 §1)', () => {
  const mk = (id: string, city: string | null, places: { city: string | null; addedTo?: boolean }[], savedAtMs = 0) => ({
    videoId: id, platform: 'tiktok' as const, postUrl: '', author: 'A', authorHandle: 'a', caption: '', city, country: null, cityLat: null, cityLng: null, savedAtMs,
    places: places.map((p, i) => ({ id: `p${i}`, name: `P${i}`, kind: 'sight' as const, city: p.city, countryCode: null, lat: null, lng: null, ...(p.addedTo ? { addedTo: { tripId: 't', dayId: 'd', activityId: 'x' } } : {}) })),
  });
  const saves = [
    mk('1', 'Budapest', [{ city: 'Budapest' }]),
    mk('2', 'Lisbon', [{ city: 'Lisbon' }, { city: 'Sintra' }]),
    mk('3', 'Lisbon', [{ city: 'Lisbon' }]),
    mk('4', null, []),
  ];
  it('counts each post once per city it touches, most saved first, then by name', () => {
    expect(wishCityChips(saves)).toEqual([{ city: 'Lisbon', count: 2 }, { city: 'Budapest', count: 1 }, { city: 'Sintra', count: 1 }]);
  });
  it('filters to posts touching the city; null is everything', () => {
    expect(savesInCity(saves, 'Sintra').map((s) => s.videoId)).toEqual(['2']);
    expect(savesInCity(saves, null)).toHaveLength(4);
  });
  it('builds the card eyebrow', () => {
    expect(wishCardEyebrow(saves[0])).toBe('BUDAPEST · 1 PLACE');
    expect(wishCardEyebrow(saves[1])).toBe('LISBON · 2 PLACES');
    expect(wishCardEyebrow(saves[3])).toBe('TIKTOK');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**
  - Run: `npx jest __tests__/utils/wishlist.test.ts`
  - Expected: FAIL, `wishCityChips is not a function` (or a TS import error).

- [ ] **Step 3: Write the implementation.** Append to `utils/wishlist.ts`:

```ts
/** The cities a post touches: its own city and its places' cities, each once. */
function postCities(save: WishSave): string[] {
  return [...new Set([save.city, ...save.places.map((p) => p.city)].filter((c): c is string => !!c && !!c.trim()))];
}

/** The grid's city chips (spec 2026-11-10 §1): each post counted once per city it touches, most saved first, then A–Z. */
export function wishCityChips(saves: WishSave[]): { city: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const s of saves) for (const c of postCities(s)) counts.set(c, (counts.get(c) ?? 0) + 1);
  return [...counts].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

/** Posts that touch `city`; `null` = All. */
export const savesInCity = (saves: WishSave[], city: string | null) => (city ? saves.filter((s) => postCities(s).includes(city)) : saves);

/** `BUDAPEST · 1 PLACE` above a grid card; `TIKTOK` when the post has no city. */
export function wishCardEyebrow(save: WishSave): string {
  const city = save.city ?? save.places.find((p) => p.city)?.city ?? null;
  if (!city) return 'TIKTOK';
  const n = save.places.length;
  return `${city.toUpperCase()} · ${n} ${n === 1 ? 'PLACE' : 'PLACES'}`;
}
```

- [ ] **Step 4: Run the test to verify it passes.**
  - Run: `npx jest __tests__/utils/wishlist.test.ts`
  - Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit.**

```bash
git add utils/wishlist.ts __tests__/utils/wishlist.test.ts
git commit -m "feat(wishlist): grid rules — city chips, city filter, card eyebrow"
```

---

### Task 2: Cover cache rules (server, pure)

**Files:**
- Create: `functions/src/wishCovers.ts`
- Test: `__tests__/functions/wishCovers.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cleanVideoIds(input: unknown): string[]`: unique, digits-only ids, at most 30.
  - `coverExpiry(url: string, nowMs: number): number`
  - `coverStillGood(cover: unknown, nowMs: number): cover is { url: string; expiresMs: number }`
  - `COVER_MIN_LEFT_MS = 3_600_000`

- [ ] **Step 1: Write the failing test.** Create `__tests__/functions/wishCovers.test.ts`:

```ts
import { cleanVideoIds, coverExpiry, coverStillGood } from '../../functions/src/wishCovers';

const NOW = Date.parse('2026-11-10T12:00:00Z');

describe('cleanVideoIds (review focus 4: junk is dropped, never fetched)', () => {
  it('keeps unique digit ids, at most 30', () => {
    const many = Array.from({ length: 40 }, (_, i) => String(7000000000000000000n + BigInt(i)));
    expect(cleanVideoIds(many)).toHaveLength(30);
    expect(cleanVideoIds(['7705372432684551446', '7705372432684551446', 'abc', '12', 42, null, '../x'])).toEqual(['7705372432684551446']);
    expect(cleanVideoIds('7705372432684551446')).toEqual([]);
  });
});

describe('coverExpiry', () => {
  it('reads x-expires in seconds', () => {
    const exp = Math.floor(NOW / 1000) + 3 * 86400;
    expect(coverExpiry(`https://p16.tiktokcdn-us.com/c.jpeg?x-expires=${exp}&x-signature=a`, NOW)).toBe(exp * 1000);
  });
  it('falls back to a day when missing or garbage', () => {
    expect(coverExpiry('https://p16.tiktokcdn-us.com/c.jpeg', NOW)).toBe(NOW + 86_400_000);
    expect(coverExpiry('https://p16.tiktokcdn-us.com/c.jpeg?x-expires=soon', NOW)).toBe(NOW + 86_400_000);
    expect(coverExpiry('not a url', NOW)).toBe(NOW + 86_400_000);
  });
  it('caps at 14 days', () => {
    expect(coverExpiry(`https://p16.tiktokcdn-us.com/c.jpeg?x-expires=${Math.floor(NOW / 1000) + 90 * 86400}`, NOW)).toBe(NOW + 14 * 86_400_000);
  });
});

describe('coverStillGood (review focus 5: expired or nearly expired links are refetched)', () => {
  it('serves a link with more than an hour left', () => {
    expect(coverStillGood({ url: 'https://x/c.jpg', expiresMs: NOW + 2 * 3_600_000 }, NOW)).toBe(true);
  });
  it('refetches within the hour, after expiry, or when malformed', () => {
    expect(coverStillGood({ url: 'https://x/c.jpg', expiresMs: NOW + 30 * 60_000 }, NOW)).toBe(false);
    expect(coverStillGood({ url: 'https://x/c.jpg', expiresMs: NOW - 1 }, NOW)).toBe(false);
    expect(coverStillGood({ url: 'http://x/c.jpg', expiresMs: NOW + 9e9 }, NOW)).toBe(false);
    expect(coverStillGood(null, NOW)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**
  - Run: `npx jest __tests__/functions/wishCovers.test.ts`
  - Expected: FAIL, `Cannot find module '../../functions/src/wishCovers'`.

- [ ] **Step 3: Write the implementation.** Create `functions/src/wishCovers.ts`:

```ts
/**
 * Wish-list covers from the server (spec 2026-11-10 §3): TikTok answers the phone's fetches without the post, but our
 * servers read its embed page fine. Pure; wishCoverFunctions.ts calls out. Covers are links with TikTok's own expiry,
 * cached as their own field — no image is ever stored.
 */
const DAY_MS = 86_400_000;
export const COVER_MIN_LEFT_MS = 3_600_000;

/** Unique digits-only TikTok ids, at most 30 per call. */
export function cleanVideoIds(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((v): v is string => typeof v === 'string' && /^\d{8,25}$/.test(v)))].slice(0, 30);
}

/** When a TikTok CDN link stops working: its `x-expires` (seconds), else a day; never more than 14 days. */
export function coverExpiry(url: string, nowMs: number): number {
  let exp = NaN;
  try { exp = Number(new URL(url).searchParams.get('x-expires')) * 1000; } catch { /* not a URL */ }
  const at = Number.isFinite(exp) && exp > 0 ? exp : nowMs + DAY_MS;
  return Math.min(at, nowMs + 14 * DAY_MS);
}

/** A cached cover worth serving: an https link with more than an hour left. */
export function coverStillGood(cover: unknown, nowMs: number): cover is { url: string; expiresMs: number } {
  const c = cover as { url?: unknown; expiresMs?: unknown } | null;
  return !!c && typeof c.url === 'string' && c.url.startsWith('https://') && typeof c.expiresMs === 'number' && c.expiresMs - nowMs > COVER_MIN_LEFT_MS;
}
```

- [ ] **Step 4: Run the test to verify it passes.**
  - Run: `npx jest __tests__/functions/wishCovers.test.ts`
  - Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add functions/src/wishCovers.ts __tests__/functions/wishCovers.test.ts
git commit -m "feat(wishlist): cover cache rules — id cleaning, x-expires, freshness"
```

---

### Task 3: The `wishCovers` callable and the app's covers hook

**Files:**
- Create: `functions/src/wishCoverFunctions.ts`
- Modify: `functions/src/socialPostFunctions.ts`: export the existing private `embedMeta(videoId)` helper.
- Modify: `functions/src/index.ts`: add the export after `readSocialPost` (line 48).
- Create: `hooks/useWishCovers.ts`
- Modify: `services/socialPost.ts`: remove `tiktokCover`, the `covers` map, and `readEmbed`'s use there (keep `readEmbed` for `readPostOnDevice`).
- Modify: `app/wishlist/[id].tsx`: use `useWishCovers([id])` instead of `tiktokCover`.

**Interfaces:**
- Consumes: `cleanVideoIds`, `coverExpiry`, `coverStillGood` (Task 2); `parseEmbedPage` (existing, `functions/src/socialPost.ts`).
- Produces:
  - Callable `wishCovers({ videoIds: string[] }) → { covers: Record<string, string | null> }`.
  - Hook `useWishCovers(videoIds: string[]): Record<string, string | null>` (an empty object while loading).

- [ ] **Step 1: Export the embed helper.** In `functions/src/socialPostFunctions.ts`, change `async function embedMeta(videoId: string) {` to `export async function embedMeta(videoId: string) {`.

- [ ] **Step 2: Write the callable.** Create `functions/src/wishCoverFunctions.ts`:

```ts
/**
 * `wishCovers` — current cover links for the caller's own saved TikTok posts (spec 2026-11-10 §3). Reads TikTok's public
 * embed page server-side (the phone's fetch gets no post) and keeps the link in socialPosts/{id}.cover until TikTok's own
 * x-expires. Only ids in the caller's wish list, so this can't fetch arbitrary TikTok content.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { cleanVideoIds, coverExpiry, coverStillGood } from './wishCovers';
import { embedMeta } from './socialPostFunctions';

const db = () => admin.firestore();

export const wishCovers = onCall({ region: 'us-central1', timeoutSeconds: 30 }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const asked = cleanVideoIds((req.data ?? {}).videoIds);
  if (!asked.length) return { covers: {} };

  const owned = await db().getAll(...asked.map((id) => db().doc(`users/${uid}/wishlist/${id}`)));
  const ids = owned.filter((d) => d.exists).map((d) => d.id);
  const now = Date.now();

  const results = await Promise.allSettled(ids.map(async (id): Promise<[string, string | null]> => {
    const ref = db().doc(`socialPosts/${id}`);
    const snap = await ref.get();
    const cached = snap.get('cover');
    if (coverStillGood(cached, now)) return [id, cached.url];
    const url = (await embedMeta(id))?.coverUrl ?? null;
    // Its own field, merged into an existing cache entry only: never creates the doc, never touches its places.
    if (url && snap.exists) await ref.update({ cover: { url, expiresMs: coverExpiry(url, now) } }).catch(() => {});
    return [id, url];
  }));

  const covers: Record<string, string | null> = {};
  for (const r of results) if (r.status === 'fulfilled') covers[r.value[0]] = r.value[1];
  const missing = ids.filter((id) => !covers[id]).length;
  if (missing) console.warn('wishCovers', { asked: asked.length, owned: ids.length, missing });
  return { covers };
});
```

- [ ] **Step 3: Export it.** In `functions/src/index.ts`, after `export { readSocialPost } from './socialPostFunctions';` add:

```ts
export { wishCovers } from './wishCoverFunctions';
```

- [ ] **Step 4: Typecheck the functions.**
  - Run: `(cd functions && npx tsc --noEmit)`
  - Expected: no output (exit 0).

- [ ] **Step 5: Write the hook.** Create `hooks/useWishCovers.ts`:

```ts
/**
 * Covers for saved TikTok posts, from the server (spec 2026-11-10 §3): one call per screen for every post it shows,
 * remembered for an hour. Never persisted offline (not in utils/offlineCache's allow-list). Null = no cover; the card
 * shows its quiet image mark.
 */
import { useQuery } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';

export function useWishCovers(videoIds: string[]): Record<string, string | null> {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const ids = [...new Set(videoIds)].sort().slice(0, 30);
  const { data } = useQuery({
    queryKey: ['wishCovers', uid, ids.join(',')],
    enabled: !!uid && ids.length > 0,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data: res } = await httpsCallable<{ videoIds: string[] }, { covers: Record<string, string | null> }>(functions, 'wishCovers')({ videoIds: ids });
      return res.covers ?? {};
    },
  });
  return data ?? {};
}
```

- [ ] **Step 6: Use it on the saved-post screen.** In `app/wishlist/[id].tsx`:
  1. Replace `import { tiktokCover } from '@/services/socialPost';` with `import { useWishCovers } from '@/hooks/useWishCovers';`.
  2. Delete the `const [cover, setCover] = useState<string | null>(null);` line and the `useEffect` that calls `tiktokCover`.
  3. Add, after `const save = …`:

```ts
  const cover = useWishCovers(save ? [save.videoId] : [])[save?.videoId ?? ''] ?? null;
```

  4. Remove `useEffect` from the `react` import if it's now unused.

- [ ] **Step 7: Remove the phone-side cover lookup.** In `services/socialPost.ts`, delete the `covers` map and the whole `tiktokCover` function, with their doc comment. Leave `readEmbed`, which `readPostOnDevice` still uses. Then confirm nothing else imports `tiktokCover`:
  - Run: `grep -rn "tiktokCover" app components hooks services utils`
  - Expected: no output.

- [ ] **Step 8: Typecheck the app and run the suite.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:"`
  - Expected: no TS errors; `Tests: N passed, N total`.

- [ ] **Step 9: Commit.**

```bash
git add functions/src/wishCoverFunctions.ts functions/src/socialPostFunctions.ts functions/src/index.ts hooks/useWishCovers.ts services/socialPost.ts "app/wishlist/[id].tsx"
git commit -m "feat(wishlist): covers from the server (wishCovers callable + useWishCovers), phone lookup removed"
```

---

### Task 4: Profile wish list grid

**Files:**
- Create: `components/wishlist/WishCard.tsx`
- Create: `components/wishlist/WishlistGrid.tsx`
- Modify: `app/(tabs)/profile.tsx:55,412`: import and render `WishlistGrid` instead of `WishlistList`.
- Delete: `components/wishlist/WishlistList.tsx`. First run `grep -rn "WishlistList" app components`: only `profile.tsx` should use it.

**Interfaces:**
- Consumes: `wishCityChips`, `savesInCity`, `wishCardEyebrow` (Task 1); `useWishCovers` (Task 3); `FilterChips` (`components/explore/FilterChips`, generic `items: {id: T; label: string}[]`, `selected: T`, `onSelect(id: T)`, `label`); `useLayout().columns`; `tiktokUrlFromShare`; `EmptyState`.
- Produces: `WishlistGrid({ header }: { header: ReactElement })`, with the same props as `WishlistList`.

- [ ] **Step 1: Check FilterChips' item shape.**
  - Run: `sed -n 1,43p components/explore/FilterChips.tsx`
  - Expected: a `FilterChipsProps<T>` with `items`, `selected`, `onSelect`, `label`. If the item key isn't `{ id, label }`, adapt the `chips` mapping in Step 3 to it.

- [ ] **Step 2: Write the card.** Create `components/wishlist/WishCard.tsx`:

```tsx
/**
 * One saved post in the profile's wish list grid (spec 2026-11-10 §1): the cover (from the server; a quiet mark while
 * it loads or if there's none), the city eyebrow, the creator, and "On a trip" once any of its places is on one.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { ImageSquare } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { wishCardEyebrow, type WishSave } from '@/utils/wishlist';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export const WishCard = memo(function WishCard({ save, cover, onPress }: { save: WishSave; cover: string | null; onPress: (save: WishSave) => void }) {
  const { colors } = useTheme();
  const onTrip = save.places.some((p) => p.addedTo);
  const handle = save.authorHandle || save.author;
  return (
    <Pressable onPress={() => onPress(save)} style={styles.card} accessibilityRole="button"
      accessibilityLabel={`${wishCardEyebrow(save).toLowerCase()}, from @${handle}${onTrip ? ', on a trip' : ''}. Open`}>
      <View style={[styles.cover, { backgroundColor: colors.background.sunken }]}>
        {cover
          ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" recyclingKey={save.videoId} />
          : <ImageSquare size={26} weight="duotone" color={colors.text.disabled} />}
        {onTrip ? (
          <View style={[styles.tag, { backgroundColor: colors.background.primary }]}>
            <Text style={[styles.tagText, { color: colors.text.primary }]}>On a trip</Text>
          </View>
        ) : null}
      </View>
      <Text style={[styles.eyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>{wishCardEyebrow(save)}</Text>
      <Text style={[styles.handle, { color: colors.text.primary }]} numberOfLines={1}>{`@${handle}`}</Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: { flex: 1, marginHorizontal: 6, marginBottom: Spacing['5'] },
  cover: { width: '100%', aspectRatio: 4 / 5, borderRadius: BorderRadius.lg, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tag: { position: 'absolute', left: Spacing['2'], bottom: Spacing['2'], paddingHorizontal: Spacing['2'], paddingVertical: 3, borderRadius: 999 },
  tagText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginTop: Spacing['2'] },
  handle: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, marginTop: 2 },
});
```

  If `Spacing['1.5']` doesn't exist (check `constants/spacing.ts`), use the literal `6`.

- [ ] **Step 3: Write the grid.** Create `components/wishlist/WishlistGrid.tsx`:

```tsx
/**
 * Profile → Trips → Wish list (spec 2026-11-10 §1): your saved TikTok posts as a photo grid, newest first, filtered by
 * city chips (each post counted once per city it touches); Paste a link on top; an inviting empty state. Private — only
 * ever on your own profile. Covers come from the server in one call (useWishCovers).
 */
import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { Alert, StyleSheet, TextInput, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Heart, LinkSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { useWishlist } from '@/hooks/useWishlist';
import { useWishCovers } from '@/hooks/useWishCovers';
import { EmptyState } from '@/components/ui/EmptyState';
import { FilterChips } from '@/components/explore/FilterChips';
import { WishCard } from '@/components/wishlist/WishCard';
import { savesInCity, tiktokUrlFromShare, wishCityChips, type WishSave } from '@/utils/wishlist';
import { FontSize } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

const ALL = '__all__';

export function WishlistGrid({ header }: { header: ReactElement }) {
  const { colors } = useTheme();
  const { columns } = useLayout();
  const { saves } = useWishlist();
  const [link, setLink] = useState('');
  const [city, setCity] = useState<string>(ALL);

  const newest = useMemo(() => [...saves].sort((a, b) => b.savedAtMs - a.savedAtMs), [saves]);
  const chips = useMemo(() => [{ id: ALL, label: 'All' }, ...wishCityChips(saves).map((c) => ({ id: c.city, label: `${c.city} (${c.count})` }))], [saves]);
  const shown = useMemo(() => savesInCity(newest, city === ALL ? null : city), [newest, city]);
  const covers = useWishCovers(shown.map((s) => s.videoId));

  const paste = useCallback(() => {
    const url = tiktokUrlFromShare(link);
    if (!url) { Alert.alert('Paste a TikTok link', 'Copy the link from TikTok (Share → Copy link), then paste it here.'); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLink('');
    router.push({ pathname: '/wishlist/save' as never, params: { url } });
  }, [link]);

  const open = useCallback((save: WishSave) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/wishlist/[id]' as never, params: { id: save.videoId } });
  }, []);

  const pasteField = (
    <View style={[styles.paste, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <LinkSimple size={18} color={colors.text.tertiary} />
      <TextInput value={link} onChangeText={setLink} onSubmitEditing={paste} placeholder="Paste a TikTok link" placeholderTextColor={colors.text.tertiary}
        autoCapitalize="none" autoCorrect={false} returnKeyType="go" style={[styles.input, { color: colors.text.primary }]} accessibilityLabel="Paste a TikTok link" />
    </View>
  );

  return (
    <FlashList
      key={`wish-${columns}`}
      data={shown}
      numColumns={columns}
      keyExtractor={(s) => s.videoId}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingHorizontal: Spacing['5'] - 6, paddingBottom: 100 }}
      ListHeaderComponent={
        <View>
          {header}
          {saves.length ? (
            <View style={styles.headPad}>
              {pasteField}
              {chips.length > 2 ? <View style={styles.chips}><FilterChips items={chips} selected={city} onSelect={setCity} label="Filter by city" /></View> : null}
            </View>
          ) : null}
        </View>
      }
      ListEmptyComponent={
        <View style={styles.headPad}>
          <EmptyState icon={Heart} title="Save places from TikTok" description="Share a video to Supernova and its places land here."
            actionLabel="Paste a link" onAction={paste} actionHaptic="light" />
          {pasteField}
        </View>
      }
      renderItem={({ item }) => <WishCard save={item} cover={covers[item.videoId] ?? null} onPress={open} />}
    />
  );
}

const styles = StyleSheet.create({
  headPad: { paddingHorizontal: 6 },
  chips: { marginTop: Spacing['3'], marginBottom: Spacing['2'] },
  paste: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 48, paddingHorizontal: Spacing['3'], borderRadius: BorderRadius.md, borderWidth: StyleSheet.hairlineWidth, marginTop: Spacing['3'], marginBottom: Spacing['3'] },
  input: { flex: 1, fontSize: FontSize.base, paddingVertical: Spacing['2'] },
});
```

  Chips show only when there are at least two cities: `chips.length > 2` counts the "All" chip.

- [ ] **Step 4: Swap it in on the profile.** In `app/(tabs)/profile.tsx`, replace `import { WishlistList } from '@/components/wishlist/WishlistList';` with `import { WishlistGrid } from '@/components/wishlist/WishlistGrid';`, and `<WishlistList header={headerComponent} />` with `<WishlistGrid header={headerComponent} />`. Then delete the old list:
  - Run: `grep -rn "WishlistList\|wishlistByCity" app components hooks services | grep -v WishlistList.tsx`
  - Expected: no output (only `profile.tsx` used it, and that's now changed). Then `git rm components/wishlist/WishlistList.tsx`. Leave `wishlistByCity` in utils if its tests still use it.

- [ ] **Step 5: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: no TS errors; tests pass; `0 errors`.

- [ ] **Step 6: Commit.**

```bash
git add components/wishlist/WishCard.tsx components/wishlist/WishlistGrid.tsx "app/(tabs)/profile.tsx"
git commit -m "feat(wishlist): profile wish list as a photo grid with city chips"
```

---

### Task 5: Smart placement and banner rules (pure)

**Files:**
- Modify: `utils/agentApply.ts:239`: `function orderAt` becomes `export function orderAt`.
- Create: `utils/smartAdd.ts`
- Test: `__tests__/utils/smartAdd.test.ts`

**Interfaces:**
- Consumes:
  - `bestInsertion(stops: PlaceStop[], add: PlaceStop): number` and `insertionCostKm(stops, add, index): number`, both from `utils/routePlacement`;
  - `PlaceStop`;
  - `orderAt(list: {order:number}[], idx: number): number` and `tripStart(trip: TripWithDays): string | null`, both from `utils/agentApply`.
- Produces:
  - `type SmartPlacement = { dayId: string; dayNumber: number; cityIndex: number; order: number; afterTitle: string | null }`
  - `smartPlacement(trip: TripWithDays, dayCities: number[], cityIndex: number, place: { lat: number | null; lng: number | null; title: string }, today: string): SmartPlacement | null`, where `dayCities[i]` is the city of `trip.days[i]`.
  - `placementInDay(day: TripDay, place: { lat: number | null; lng: number | null; title: string }): { order: number; afterTitle: string | null }`
  - `smartAddBanner(r: { dayNumber: number; city: string; afterTitle: string | null; multiCity: boolean }): string`

- [ ] **Step 1: Write the failing test.** Create `__tests__/utils/smartAdd.test.ts`:

```ts
import { placementInDay, smartAddBanner, smartPlacement } from '@/utils/smartAdd';

const act = (id: string, title: string, lat: number | null, lng: number | null, order: number, extra: Record<string, unknown> = {}) =>
  ({ id, title, type: 'activity', lat, lng, order, startTime: null, ...extra });
const day = (id: string, dayNumber: number, destinationIndex: number | null, activities: ReturnType<typeof act>[]) =>
  ({ id, dayNumber, destinationIndex, date: null, title: '', notes: '', activities });
// Budapest: Castle District ~47.50,19.03; Pest centre ~47.497,19.054; Christmas market (Vörösmarty) ~47.4965,19.0510
const trip = (days: ReturnType<typeof day>[], startDay: string | null = '2026-11-18') =>
  ({ id: 't', title: 'T', startDay, startDate: null, days, destination: { name: 'Prague' }, additionalDestinations: [{ name: 'Budapest' }] }) as never;
const market = { lat: 47.4965, lng: 19.051, title: 'Budapest Christmas markets' };

describe('smartPlacement (spec 2026-11-10 §2)', () => {
  it('picks the city day where the place adds the least distance, at its best spot', () => {
    const t = trip([
      day('p1', 1, 0, [act('a', 'Old Town', 50.087, 14.421, 1000)]),
      day('b1', 5, 1, [act('c', 'Buda Castle', 47.496, 19.04, 1000), act('d', 'Fisherman\'s Bastion', 47.502, 19.035, 2000)]),
      day('b2', 6, 1, [act('e', 'Parliament', 47.507, 19.046, 1000), act('f', 'Vörösmarty Square', 47.4966, 19.0508, 2000)]),
    ]);
    const r = smartPlacement(t, [0, 1, 1], 1, market, '2026-11-10');
    expect(r).toMatchObject({ dayId: 'b2', dayNumber: 6, cityIndex: 1, afterTitle: 'Vörösmarty Square' });
    expect(r!.order).toBeGreaterThan(2000);
  });
  it('lands between two stops with a midpoint order (one write, no renumbering)', () => {
    const t = trip([day('b1', 5, 1, [act('a', 'North', 47.51, 19.05, 1000), act('b', 'South', 47.48, 19.05, 2000)])]);
    const r = smartPlacement(t, [1], 1, market, '2026-11-10')!;
    expect(r.afterTitle).toBe('North');
    expect(r.order).toBe(1500);
  });
  it('keeps timed and booked stops fixed', () => {
    const t = trip([day('b1', 5, 1, [act('a', 'Lunch', 47.4966, 19.0508, 1000, { startTime: '12:00' }), act('b', 'Far', 47.53, 19.08, 2000)])]);
    expect(smartPlacement(t, [1], 1, market, '2026-11-10')).not.toBeNull();
  });
  it('does not let an empty day win over a day with stops nearby (review focus 3)', () => {
    const t = trip([day('b1', 5, 1, []), day('b2', 6, 1, [act('a', 'Vörösmarty Square', 47.4966, 19.0508, 1000)])]);
    expect(smartPlacement(t, [1, 1], 1, market, '2026-11-10')!.dayId).toBe('b2');
  });
  it('when every city day is empty, picks the first day that is not the departure day', () => {
    const t = trip([day('b1', 5, 1, []), day('b2', 6, 1, []), day('b3', 7, 1, []), day('v1', 8, 2, [])]);
    expect(smartPlacement(t, [1, 1, 1, 2], 1, market, '2026-11-10')!.dayId).toBe('b1');
    const lastCity = trip([day('v1', 7, 2, []), day('v2', 8, 2, [])]);
    expect(smartPlacement(lastCity, [2, 2], 2, market, '2026-11-10')!.dayId).toBe('v1');
  });
  it('a single-day city uses that day', () => {
    const t = trip([day('b1', 5, 1, []), day('v1', 6, 2, [])]);
    expect(smartPlacement(t, [1, 2], 1, market, '2026-11-10')!.dayId).toBe('b1');
  });
  it('drops days already past on a trip under way', () => {
    const t = trip([day('b1', 1, 1, [act('a', 'Here', 47.4966, 19.0508, 1000)]), day('b2', 2, 1, [act('b', 'There', 47.51, 19.06, 1000)])], '2026-11-18');
    expect(smartPlacement(t, [1, 1], 1, market, '2026-11-19')!.dayId).toBe('b2');
    expect(smartPlacement(t, [1, 1], 1, market, '2026-11-25')).toBeNull();
  });
  it('keeps every day on an undated trip (review focus 1)', () => {
    const t = trip([day('b1', 1, 1, [act('a', 'Here', 47.4966, 19.0508, 1000)])], null);
    expect(smartPlacement(t, [1], 1, market, '2030-01-01')!.dayId).toBe('b1');
  });
  it('finds city days from the resolved dayCities, not the raw destinationIndex (review focus 2)', () => {
    const t = trip([day('d1', 1, null, [act('a', 'Here', 47.4966, 19.0508, 1000)])]);
    expect(smartPlacement(t, [0], 0, market, '2026-11-10')!.dayId).toBe('d1');
  });
  it('null when the city has no days, or the place has no position', () => {
    const t = trip([day('p1', 1, 0, [])]);
    expect(smartPlacement(t, [0], 1, market, '2026-11-10')).toBeNull();
    expect(smartPlacement(t, [0], 0, { lat: null, lng: null, title: 'x' }, '2026-11-10')).toBeNull();
  });
});

describe('placementInDay (Change day)', () => {
  it('puts the place at the best spot of the chosen day', () => {
    const d = day('b1', 5, 1, [act('a', 'North', 47.51, 19.05, 1000), act('b', 'South', 47.48, 19.05, 2000)]);
    expect(placementInDay(d as never, market)).toEqual({ order: 1500, afterTitle: 'North' });
    expect(placementInDay(day('e', 1, 1, []) as never, market)).toEqual({ order: 1000, afterTitle: null });
  });
});

describe('smartAddBanner', () => {
  it('names the day, city and the stop before it', () => {
    expect(smartAddBanner({ dayNumber: 6, city: 'Budapest', afterTitle: "Fisherman's Bastion", multiCity: true })).toBe("Added to Day 6 · Budapest, after Fisherman's Bastion");
    expect(smartAddBanner({ dayNumber: 6, city: 'Budapest', afterTitle: null, multiCity: true })).toBe('Added as the first stop of Day 6 · Budapest');
    expect(smartAddBanner({ dayNumber: 2, city: 'Lisbon', afterTitle: 'Alfama', multiCity: false })).toBe('Added to Day 2, after Alfama');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**
  - Run: `npx jest __tests__/utils/smartAdd.test.ts`
  - Expected: FAIL, `Cannot find module '@/utils/smartAdd'`.

- [ ] **Step 3: Export `orderAt`.** In `utils/agentApply.ts`, change `function orderAt(list: { order: number }[], idx: number): number {` to `export function orderAt(list: { order: number }[], idx: number): number {`.

- [ ] **Step 4: Write the implementation.** Create `utils/smartAdd.ts`:

```ts
/**
 * Smart add (spec 2026-11-10 §2): a saved place goes to the day of its city where it adds the least travel, at its best
 * spot, with one write (a midpoint order). Pure. The same placement Nova uses (utils/routePlacement), so the trip check
 * never asks to move it later.
 */
import { bestInsertion, insertionCostKm, type PlaceStop } from '@/utils/routePlacement';
import { orderAt, tripStart } from '@/utils/agentApply';
import type { TripActivity, TripDay, TripWithDays } from '@/types';

export type SmartPlacement = { dayId: string; dayNumber: number; cityIndex: number; order: number; afterTitle: string | null };
type NewPlace = { lat: number | null; lng: number | null; title: string };

const DAY_MS = 86_400_000;
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const asStop = (a: TripActivity): PlaceStop =>
  ({ id: a.id, lat: a.lat ?? null, lng: a.lng ?? null, type: a.type, title: a.title, startTime: a.startTime ?? null, fixed: !!a.startTime || !!a.fromBooking });
const sorted = (day: TripDay) => [...day.activities].sort((a, b) => a.order - b.order);
const located = (day: TripDay) => day.activities.some((a) => a.lat != null && a.lng != null);

/** Where the place goes inside one chosen day (Change day, and smart add's final step). */
export function placementInDay(day: TripDay, place: NewPlace): { order: number; afterTitle: string | null } {
  const list = sorted(day);
  const add: PlaceStop = { id: '__new__', lat: place.lat, lng: place.lng, type: 'activity', title: place.title, startTime: null };
  const idx = list.length ? bestInsertion(list.map(asStop), add) : 0;
  return { order: orderAt(list, idx), afterTitle: idx > 0 ? list[idx - 1].title : null };
}

/**
 * The day and spot for a saved place in city `cityIndex` of this trip, or null (no position, no days in that city, or
 * every one already past) — the caller then shows the day list. `dayCities[i]` is the city of `trip.days[i]`
 * (resolveDayDestinationIndices — older trips' days have no destinationIndex).
 */
export function smartPlacement(trip: TripWithDays, dayCities: number[], cityIndex: number, place: NewPlace, today: string): SmartPlacement | null {
  if (place.lat == null || place.lng == null) return null;
  const start = tripStart(trip);
  const cityDays = trip.days
    .map((d, i) => ({ d, city: dayCities[i] }))
    .filter((x) => x.city === cityIndex)
    .map((x) => x.d)
    .filter((d) => !start || addDays(start, d.dayNumber - 1) >= today)
    .sort((a, b) => a.dayNumber - b.dayNumber);
  if (!cityDays.length) return null;

  const add: PlaceStop = { id: '__new__', lat: place.lat, lng: place.lng, type: 'activity', title: place.title, startTime: null };
  let chosen: TripDay;
  if (cityDays.some(located)) {
    // An empty day would cost 0 km and always win; only days with a placed stop compete (review focus 3).
    const scored = cityDays.filter(located).map((d) => {
      const stops = sorted(d).map(asStop);
      return { d, km: insertionCostKm(stops, add, bestInsertion(stops, add)), n: d.activities.length };
    });
    scored.sort((a, b) => a.km - b.km || a.n - b.n || a.d.dayNumber - b.d.dayNumber);
    chosen = scored[0].d;
  } else {
    // All empty: the first day that isn't the city's departure day (its last day, when a later city or the trip's end follows).
    const lastTripDay = Math.max(...trip.days.map((d) => d.dayNumber));
    const laterCity = dayCities.some((c) => c > cityIndex);
    const departure = cityDays[cityDays.length - 1];
    const isDeparture = (d: TripDay) => cityDays.length > 1 && d.id === departure.id && (laterCity || d.dayNumber === lastTripDay);
    chosen = cityDays.find((d) => !isDeparture(d)) ?? cityDays[0];
  }
  const spot = placementInDay(chosen, place);
  return { dayId: chosen.id, dayNumber: chosen.dayNumber, cityIndex, ...spot };
}

/** The banner after a smart add. */
export function smartAddBanner(r: { dayNumber: number; city: string; afterTitle: string | null; multiCity: boolean }): string {
  const where = r.multiCity ? ` · ${r.city}` : '';
  return r.afterTitle ? `Added to Day ${r.dayNumber}${where}, after ${r.afterTitle}` : `Added as the first stop of Day ${r.dayNumber}${where}`;
}
```

- [ ] **Step 5: Run the test to verify it passes.**
  - Run: `npx jest __tests__/utils/smartAdd.test.ts`
  - Expected: PASS (12 tests). If "picks the city day…" fails on `afterTitle`, check `bestInsertion`'s index semantics: it returns the insertion index into `stops`, so the stop before is `list[idx-1]`. Fix the code, not the test.

- [ ] **Step 6: Run the agentApply tests too** (orderAt is now exported).
  - Run: `npx jest __tests__/utils/agentApply.test.ts`
  - Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add utils/smartAdd.ts utils/agentApply.ts __tests__/utils/smartAdd.test.ts
git commit -m "feat(wishlist): smart placement — the city day with the least added travel, one-write order, banner copy"
```

---

### Task 6: Smart add on the trip page (hook, banner, entry points)

**Files:**
- Modify: `hooks/useWishlist.ts`: add `clearAdded(videoId, placeId)`.
- Create: `hooks/useSmartAdd.ts`
- Create: `components/wishlist/SmartAddBanner.tsx`
- Modify: `components/wishlist/TripWishlistSheet.tsx`: rows call `onAdd(match)` instead of opening `AddWishToTripSheet` internally.
- Modify: `app/trip/[id].tsx`:
  - the city cards and the chip sheet go through `useSmartAdd`;
  - the banner renders above the tab bar area;
  - the page scrolls to the new stop;
  - it reads the `wishVideo` / `wishPlace` params.

**Interfaces:**
- Consumes: `smartPlacement`, `placementInDay`, `smartAddBanner` (Task 5); `wishActivity`, `wishByCity` (existing); `useCreateTrip().addActivity(tripId, dayId, activity, order)` / `deleteActivity(tripId, dayId, activityId)`; `useWishlist().markAdded`, `requireOnline` (`services/offline`); `DayPickerSheet` (`visible, days, onSelect, onClose, colors`).
- Produces:
  - `useWishlist().clearAdded(videoId: string, placeId: string): Promise<void>`
  - `useSmartAdd({ trip, dayCities, destinationNames }) → { add(m): Promise<'added' | 'fallback' | 'offline'>, banner: SmartBannerState | null, changeDay(dayId): Promise<void>, undo(): Promise<void>, dismiss(): void, hold(): void, fallback: Match | null, clearFallback(): void }`
  - `type SmartBannerState = { text: string; activityId: string; dayId: string; match: Match }`
  - `SmartAddBanner({ text, onChangeDay, onUndo, onDismiss })`

- [ ] **Step 1: Add `clearAdded`.** In `hooks/useWishlist.ts`, after `markAdded`:

```ts
  // Undo of a smart add (spec 2026-11-10 §2): the place goes back to waiting. The key is dropped, never set to undefined
  // (Firestore refuses undefined).
  const clearAdded = useCallback((videoId: string, placeId: string) =>
    setPlaces(videoId, (ps) => ps.map((p) => { if (p.id !== placeId) return p; const { addedTo: _a, ...rest } = p; return rest; })), [setPlaces]);
```

  and return it: `return { saves, isLoading, save, remove, removePlace, markAdded, clearAdded };`.

- [ ] **Step 2: Write the hook.** Create `hooks/useSmartAdd.ts`:

```ts
/**
 * Smart add on a trip (spec 2026-11-10 §2): place a saved place on the best day of its city, then a banner with Change
 * day and Undo. Falls back to the day list when it can't place (no position, no days in that city).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { useWishlist } from '@/hooks/useWishlist';
import { requireOnline } from '@/services/offline';
import { toCalendarDate } from '@/utils/calendarDate';
import { placementInDay, smartAddBanner, smartPlacement } from '@/utils/smartAdd';
import { toTripForMatch, wishActivity, wishByCity, type WishPlace, type WishSave } from '@/utils/wishlist';
import type { TripWithDays } from '@/types';

export type Match = { save: WishSave; place: WishPlace };
export type SmartBannerState = { text: string; activityId: string; dayId: string; match: Match };

const BANNER_MS = 6000;

export function useSmartAdd({ trip, dayCities, destinationNames }: { trip: TripWithDays | null | undefined; dayCities: number[]; destinationNames: string[] }) {
  const { addActivity, deleteActivity } = useCreateTrip();
  const { markAdded, clearAdded } = useWishlist();
  const [banner, setBanner] = useState<SmartBannerState | null>(null);
  const [fallback, setFallback] = useState<Match | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = useCallback(() => { if (timer.current) clearTimeout(timer.current); setBanner(null); }, []);
  // Keep the banner (and what Change day needs) while the day list is open: the 6 s timer would clear it under the picker.
  const hold = useCallback(() => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = useCallback((b: SmartBannerState) => {
    if (timer.current) clearTimeout(timer.current);
    setBanner(b);
    timer.current = setTimeout(() => setBanner(null), BANNER_MS);
  }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const cityOf = useCallback((m: Match) => {
    if (!trip) return -1;
    const by = wishByCity(toTripForMatch(trip), [{ ...m, place: { ...m.place, addedTo: undefined } }]);
    return by.findIndex((list) => list.length > 0);
  }, [trip]);

  const write = useCallback(async (m: Match, dayId: string, order: number) => {
    const activityId = await addActivity(trip!.id, dayId, { ...wishActivity(m.place, m.save), createdAt: Timestamp.now() } as never, order);
    await markAdded(m.save.videoId, m.place.id, { tripId: trip!.id, dayId, activityId });
    return activityId;
  }, [trip, addActivity, markAdded]);

  const add = useCallback(async (m: Match): Promise<'added' | 'fallback' | 'offline'> => {
    if (!trip || busy.current) return 'fallback';
    if (!requireOnline()) { Alert.alert('Connect to add this'); return 'offline'; }
    const ci = cityOf(m);
    const spot = ci >= 0 ? smartPlacement(trip, dayCities, ci, { lat: m.place.lat, lng: m.place.lng, title: m.place.name }, toCalendarDate(new Date())) : null;
    if (!spot) { setFallback(m); return 'fallback'; }
    busy.current = true;
    try {
      const activityId = await write(m, spot.dayId, spot.order);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      show({ text: smartAddBanner({ dayNumber: spot.dayNumber, city: destinationNames[ci] ?? '', afterTitle: spot.afterTitle, multiCity: destinationNames.length > 1 }), activityId, dayId: spot.dayId, match: m });
      return 'added';
    } catch {
      Alert.alert("Couldn't add it", 'Check your connection and try again.');
      return 'fallback';
    } finally {
      busy.current = false;
    }
  }, [trip, dayCities, destinationNames, cityOf, write, show]);

  const undo = useCallback(async () => {
    if (!trip || !banner || !requireOnline()) return;
    const b = banner;
    dismiss();
    await deleteActivity(trip.id, b.dayId, b.activityId).catch(() => {});
    await clearAdded(b.match.save.videoId, b.match.place.id);
  }, [trip, banner, dismiss, deleteActivity, clearAdded]);

  const changeDay = useCallback(async (dayId: string) => {
    if (!trip || !banner || !requireOnline() || dayId === banner.dayId) { dismiss(); return; }
    const b = banner;
    const day = trip.days.find((d) => d.id === dayId);
    if (!day) return;
    dismiss();
    await deleteActivity(trip.id, b.dayId, b.activityId).catch(() => {});
    const spot = placementInDay({ ...day, activities: day.activities.filter((a) => a.id !== b.activityId) }, { lat: b.match.place.lat, lng: b.match.place.lng, title: b.match.place.name });
    const activityId = await write(b.match, dayId, spot.order);
    const ci = dayCities[trip.days.findIndex((d) => d.id === dayId)] ?? 0;
    show({ text: smartAddBanner({ dayNumber: day.dayNumber, city: destinationNames[ci] ?? '', afterTitle: spot.afterTitle, multiCity: destinationNames.length > 1 }), activityId, dayId, match: b.match });
  }, [trip, banner, dismiss, deleteActivity, write, dayCities, destinationNames, show]);

  const clearFallback = useCallback(() => setFallback(null), []);
  return { add, banner, changeDay, undo, dismiss, hold, fallback, clearFallback };
}
```

  Check `addActivity`'s activity type: it's `Omit<TripActivity, 'id' | 'order'>`. Match the existing call in `AddWishToTripSheet.tsx`, which passes `{ ...wishActivity(...), createdAt: Timestamp.now() }`. If that compiles there without a cast, drop the `as never`.

- [ ] **Step 3: Write the banner.** Create `components/wishlist/SmartAddBanner.tsx`:

```tsx
/**
 * The banner after a smart add (spec 2026-11-10 §2): what was added where, Change day and Undo. Springs in; the hook
 * hides it after 6 s.
 */
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { CheckCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Shadow, Spacing } from '@/constants/spacing';

export function SmartAddBanner({ text, onChangeDay, onUndo, onDismiss, bottom }: {
  text: string; onChangeDay: () => void; onUndo: () => void; onDismiss: () => void; bottom: number;
}) {
  const { colors } = useTheme();
  const change = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChangeDay(); }, [onChangeDay]);
  const undo = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onUndo(); }, [onUndo]);
  return (
    <Animated.View entering={FadeInDown.springify().damping(11).stiffness(65)} exiting={FadeOutDown} style={[styles.wrap, { bottom }]}>
      <Pressable onPress={onDismiss} style={[styles.card, Shadow.md, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
        accessibilityRole="alert" accessibilityLabel={text}>
        <View style={styles.row}>
          <CheckCircle size={18} weight="duotone" color={colors.brand.purple} />
          <Text style={[styles.text, { color: colors.text.primary }]} numberOfLines={2}>{text}</Text>
        </View>
        <View style={styles.actions}>
          <Pressable onPress={change} style={styles.action} accessibilityRole="button" accessibilityLabel="Change day">
            <Text style={[styles.actionText, { color: colors.text.secondary }]}>Change day</Text>
          </Pressable>
          <Pressable onPress={undo} style={styles.action} accessibilityRole="button" accessibilityLabel="Undo">
            <Text style={[styles.actionText, { color: colors.text.primary }]}>Undo</Text>
          </Pressable>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing['4'], right: Spacing['4'] },
  card: { borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: Spacing['4'], paddingTop: Spacing['3'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  text: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium, lineHeight: 19 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: Spacing['4'] },
  action: { minHeight: 44, justifyContent: 'center' },
  actionText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
});
```

  If `Shadow` isn't exported from `@/constants/spacing`, check where `Shadow.md` comes from (`grep -rn "export const Shadow" constants`) and import it from there.

- [ ] **Step 4: Make the chip sheet delegate.** In `components/wishlist/TripWishlistSheet.tsx`:
  - Replace the props with `{ visible: boolean; tripId: string; matches: …; onClose: () => void; onAdd: (m: { save: WishSave; place: WishPlace }) => void }`.
  - Remove the internal `adding` state and the `<AddWishToTripSheet …/>`.
  - Make `add` call `onClose(); onAdd(m);` after the Light haptic.
  - Change the `<Modal visible={visible && !adding}` to `visible={visible}`.
  - Remove the now-unused imports (`useState`, `AddWishToTripSheet`).

- [ ] **Step 5: Wire the trip page.** In `app/trip/[id].tsx`:
  1. Imports: `import { useSmartAdd, type Match } from '@/hooks/useSmartAdd';` and `import { SmartAddBanner } from '@/components/wishlist/SmartAddBanner';`. `DayPickerSheet` should already be imported via `TripMapView`; if not, add `import { DayPickerSheet } from '@/components/trip/DayPickerSheet';`.
  2. Params: change `const { id, video } = useLocalSearchParams<{ id: string; video?: string }>();` to `const { id, video, wishVideo, wishPlace } = useLocalSearchParams<{ id: string; video?: string; wishVideo?: string; wishPlace?: string }>();`.
  3. After `dayDestinationIndices` (line ~681) add:

```ts
  const smart = useSmartAdd({ trip, dayCities: dayDestinationIndices, destinationNames });
  const [changingDay, setChangingDay] = useState(false);
  const smartAdd = useCallback((m: Match) => { smart.add(m); }, [smart]);
  // Opened from a saved post with one fitting trip (spec 2026-11-10 §2): add it once the trip has loaded.
  const wishParamDone = useRef(false);
  useEffect(() => {
    if (wishParamDone.current || !trip || !wishVideo || !wishPlace) return;
    const save = wishSaves.find((s) => s.videoId === wishVideo);
    const place = save?.places.find((p) => p.id === wishPlace);
    if (!save || !place) return;
    wishParamDone.current = true;
    if (place.addedTo?.tripId === trip.id) return;
    smart.add({ save, place });
  }, [trip, wishVideo, wishPlace, wishSaves, smart]);
```

  4. Scroll to the new stop when the banner shows. Find the existing stop-scroll helper near line 1060 (`scrollRef.current?.scrollTo({ y: … })`, which scrolls to a measured y). If there's a per-activity layout map, reuse it with `smart.banner.activityId`. Otherwise scroll to the day: keep the existing `onLayout` y for days if present. If neither exists, record `dayY.current[day.id] = e.nativeEvent.layout.y` in `renderDay`'s wrapper `onLayout` and add:

```ts
  useEffect(() => {
    const y = smart.banner ? dayY.current[smart.banner.dayId] : undefined;
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing['4']), animated: true });
  }, [smart.banner]);
```

  5. City cards: change both `<CityWishlistCard … onAdd={setWishAdding} …/>` to `onAdd={smartAdd}`.
  6. Chip sheet: `<TripWishlistSheet … onAdd={smartAdd} />`.
  7. Fallback: change `<AddWishToTripSheet target={wishAdding} tripId={trip.id} onClose={() => setWishAdding(null)} />` to `<AddWishToTripSheet target={smart.fallback} tripId={trip.id} onClose={smart.clearFallback} />`, and delete the `wishAdding` state.
  8. Banner and day change. Define the handlers next to `smartAdd` (rule 6: props get `useCallback`):

```ts
  const openChangeDay = useCallback(() => { smart.hold(); setChangingDay(true); }, [smart]);
  const closeChangeDay = useCallback(() => { setChangingDay(false); smart.dismiss(); }, [smart]);
  const pickChangeDay = useCallback((dayId: string) => { setChangingDay(false); smart.changeDay(dayId); }, [smart]);
```

  and render them beside the other sheets at the end of the screen:

```tsx
      {smart.banner ? (
        <SmartAddBanner text={smart.banner.text} bottom={insets.bottom + Spacing['4']}
          onChangeDay={openChangeDay} onUndo={smart.undo} onDismiss={smart.dismiss} />
      ) : null}
      <DayPickerSheet visible={changingDay} days={trip.days} colors={colors} onSelect={pickChangeDay} onClose={closeChangeDay} />
```

  `hold()` stops the banner's timer while the list is open, so `changeDay` still has the banner to work from. Closing the list without choosing dismisses the banner.

  If `insets` isn't already in scope in this screen, use the existing `useSafeAreaInsets()` result there, or add one.

- [ ] **Step 6: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: no TS errors; all tests pass; `0 errors`.

- [ ] **Step 7: Commit.**

```bash
git add hooks/useWishlist.ts hooks/useSmartAdd.ts components/wishlist/SmartAddBanner.tsx components/wishlist/TripWishlistSheet.tsx "app/trip/[id].tsx"
git commit -m "feat(wishlist): smart add on the trip page — best day, banner with Change day and Undo"
```

---

### Task 7: Smart add from the saved-post screen, plus docs

**Files:**
- Modify: `utils/wishlist.ts`: add `tripsFitting`.
- Test: `__tests__/utils/wishlist.test.ts` (append)
- Modify: `components/wishlist/AddWishToTripSheet.tsx`: optional `onTripChosen`.
- Modify: `app/wishlist/[id].tsx`: **Add to a trip** goes through `tripsFitting`.
- Modify: `CLAUDE.md` (Social wish list bullet), and `docs/superpowers/specs/2026-11-10-wishlist-grid-smart-add-design.md` (the params line).

**Interfaces:**
- Consumes: `TripForMatch`, `fitsTrip`, `toTripForMatch`, `useOwnAndJoinedTrips`; the trip page's `wishVideo` / `wishPlace` params (Task 6).
- Produces: `tripsFitting(place: Pick<WishPlace,'lat'|'lng'>, trips: TripForMatch[], today: string, maxKm = 50): TripForMatch[]`, the upcoming or current trips with a city within `maxKm`, nearest first.

- [ ] **Step 1: Write the failing test.** Append to `__tests__/utils/wishlist.test.ts`:

```ts
import { tripsFitting } from '@/utils/wishlist';
describe('tripsFitting (saved-post screen: one fitting trip → smart add straight there)', () => {
  const t = (id: string, lat: number, lng: number, end: string | null = '2026-12-05') => ({ id, title: id, start: '2026-11-18', end, cities: [{ name: id, lat, lng }] });
  const market = { lat: 47.4965, lng: 19.051 };
  it('lists upcoming trips near the place, nearest first; ended and far trips are out', () => {
    const trips = [t('far', 40.4, -3.7), t('vienna-ish', 47.8, 19.2), t('budapest', 47.4979, 19.0402), t('old', 47.5, 19.05, '2025-01-01')];
    expect(tripsFitting(market, trips, '2026-11-10').map((x) => x.id)).toEqual(['budapest', 'vienna-ish']);
  });
  it('is empty for a place with no position', () => {
    expect(tripsFitting({ lat: null, lng: null }, [t('budapest', 47.4979, 19.0402)], '2026-11-10')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**
  - Run: `npx jest __tests__/utils/wishlist.test.ts`
  - Expected: FAIL, `tripsFitting is not a function`.

- [ ] **Step 3: Implement.** In `utils/wishlist.ts`, after `fitsTrip`:

```ts
/** Every upcoming or current trip with a city within `maxKm` of the place, nearest first (saved-post screen). */
export function tripsFitting(place: Pick<WishPlace, 'lat' | 'lng'>, trips: TripForMatch[], today: string, maxKm = 50): TripForMatch[] {
  return trips
    .filter((t) => active(t, today))
    .map((t) => ({ t, d: nearestKm(place, t) }))
    .filter((x): x is { t: TripForMatch; d: number } => x.d != null && x.d <= maxKm)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.t);
}
```

- [ ] **Step 4: Run it to verify it passes.**
  - Run: `npx jest __tests__/utils/wishlist.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Let the trip picker hand off.** In `components/wishlist/AddWishToTripSheet.tsx`:
  - Add the prop `onTripChosen?: (tripId: string) => void` to the props type.
  - In `pickTrip`, after the haptic: `if (onTripChosen) { onTripChosen(id); return; }`, then the existing `setChosen(id)`.
  - Add `onTripChosen` to `pickTrip`'s dependency list.

- [ ] **Step 6: Route the saved-post screen through smart add.** In `app/wishlist/[id].tsx`:
  1. Imports: `useAuthStore` from `@/stores/useAuthStore`, `useOwnAndJoinedTrips` from `@/hooks/useTripList`, `toCalendarDate` from `@/utils/calendarDate`, and `toTripForMatch, tripsFitting` from `@/utils/wishlist`.
  2. In the component:

```ts
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: trips = [] } = useOwnAndJoinedTrips(uid);
  const openSmartAdd = useCallback((p: WishPlace, tripId: string) => {
    setAdding(null);
    router.push({ pathname: '/trip/[id]' as never, params: { id: tripId, wishVideo: save!.videoId, wishPlace: p.id } });
  }, [save]);
  const addToTrip = useCallback((p: WishPlace) => {
    const fitting = tripsFitting(p, trips.map((t) => toTripForMatch(t)), toCalendarDate(new Date()));
    if (fitting.length === 1) openSmartAdd(p, fitting[0].id);
    else setAdding(p);
  }, [trips, openSmartAdd]);
```

  3. In `placeActions`, change `{ text: 'Add to a trip', onPress: () => setAdding(p) }` to `{ text: 'Add to a trip', onPress: () => addToTrip(p) }`, and add `addToTrip` to its deps.
  4. On the sheet: `<AddWishToTripSheet target={adding ? { save, place: adding } : null} onTripChosen={(id) => adding && openSmartAdd(adding, id)} onClose={() => setAdding(null)} />`. Wrap that handler in a `useCallback` named `chooseTrip`.

- [ ] **Step 7: Update the docs.**
  - **Spec:** in `docs/superpowers/specs/2026-11-10-wishlist-grid-smart-add-design.md`, replace `Params: \`wishAdded={activityId}\`, \`wishDay={dayId}\`.` with `Params: \`wishVideo={videoId}\`, \`wishPlace={placeId}\`; the trip page performs the add once its days are loaded (only it has them).`
  - **CLAUDE.md:** in the **Social wish list** bullet, after "and the same places inside **each city's part of the itinerary** (…)", add: "Profile → Trips → **Wish list** is a photo grid with city chips (`WishlistGrid`, `WishCard`; rules `wishCityChips`/`savesInCity`/`wishCardEyebrow`). **Smart add** (spec `2026-11-10-wishlist-grid-smart-add-design.md`; `utils/smartAdd.ts`, `hooks/useSmartAdd.ts`, `SmartAddBanner`): a saved place goes to its city's day with the least added km (`smartPlacement`, routePlacement's `bestInsertion`, fixed timed/booked stops, past days skipped, all-empty → first non-departure day), one midpoint-order write, banner with Change day/Undo; from the saved-post screen one fitting trip (`tripsFitting`) opens `/trip/{id}?wishVideo&wishPlace`. **Covers** come from callable `wishCovers` (`functions/src/wishCovers.ts` + `wishCoverFunctions.ts`: own saves only, ≤ 30, cached as `socialPosts/{id}.cover` until TikTok's `x-expires`, never creates the doc) via `hooks/useWishCovers`; the phone never looks covers up itself (TikTok gives the phone no post)."

- [ ] **Step 8: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && (cd functions && npx tsc --noEmit) && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: no TS errors in either project; all tests pass; `0 errors`.

- [ ] **Step 9: Commit.**

```bash
git add utils/wishlist.ts __tests__/utils/wishlist.test.ts components/wishlist/AddWishToTripSheet.tsx "app/wishlist/[id].tsx" CLAUDE.md docs/superpowers/specs/2026-11-10-wishlist-grid-smart-add-design.md
git commit -m "feat(wishlist): smart add from the saved-post screen; docs"
```

---

## After the tasks

- **Final review:** a fresh reviewer over `git merge-base main HEAD..HEAD`, with this plan's Review Focus.
- **Deploy (owner's OK):** `wishCovers` only. `readSocialPost` is unchanged apart from the exported helper, so redeploying it is optional but harmless.
- **Builds (owner's OK):** iOS and Android. The trip page, grid and saved-post screen are app changes.
