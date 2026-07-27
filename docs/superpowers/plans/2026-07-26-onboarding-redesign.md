# Onboarding Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dark, purple-gradient, icon-bubble onboarding swiper (`app/(auth)/onboarding.tsx`) with a light-editorial, photo-led flow driven by real Firestore content, per `docs/superpowers/specs/2026-07-26-onboarding-redesign-design.md`.

**Architecture:** One new data hook (`useOnboardingContent`) fetches all slide content in parallel on mount, reusing existing queries (`usePublicTrips`, a newly-exported `fetchUserSuggestions`). Five slide types render via four new presentational components (two slides share one parametrized component), composed by a rewritten `onboarding.tsx` screen shell that owns the `FlatList` pager, dot indicator, and CTA controls.

**Tech Stack:** React Native (Expo Router), TanStack Query, Firebase Firestore, `react-native`'s built-in `Animated` API (house spring `constants/motion.ts`), Jest for the one unit-testable piece of pure logic.

## Global Constraints

- All components use `const { colors } = useTheme()` — `onboarding.tsx` and every new component under `components/onboarding/` must NOT import `DarkColors`/`LightColors` directly (CLAUDE.md Architecture Rule 3 — onboarding is no longer in the always-dark exception list).
- Dynamic/theme-dependent colors go in inline styles only, never inside `StyleSheet.create` (Architecture Rule 4).
- `LinearGradient` `colors` prop must be typed `[string, string]`, not `string[]` (Architecture Rule 5).
- `useCallback` required for event handlers passed as props to child components (Architecture Rule 6).
- Import `auth`/`db`/`storage`/`functions` from `services/firebase` — never `getAuth()`/`getFirestore()` elsewhere (Architecture Rule 7 — relevant to the data hook).
- `@/` path alias for all imports (Architecture Rule 9).
- Haptics: `Light` on nav/select, `Medium` on create/add/destructive (Architecture Rule 10 / design skill).
- Touch targets ≥44pt (design skill accessibility floor).
- No emoji; Phosphor icons only where icons appear (design skill hard rule — not heavily relevant here since this redesign is photo-led, not icon-led).
- The house spring is `{ tension: 65, friction: 11 }`, exported as `SPRING` from `constants/motion.ts` — the only spring config allowed; continuous/looping motion (Ken Burns, avatar-grid drift) uses `Animated.timing`, not `SPRING`, since those are looping drifts, not settle-to-rest transitions.
- Motion must skip to the resting frame when `AccessibilityInfo.isReduceMotionEnabled()` is true (spec's Motion System / Accessibility decision).

---

## Task 1: Export `fetchUserSuggestions` from `useExplore.ts`

**Files:**
- Modify: `hooks/useExplore.ts:8`

**Interfaces:**
- Produces: `export async function fetchUserSuggestions(): Promise<UserProfile[]>` — used by Task 2's `useOnboardingContent`.

- [ ] **Step 1: Change the function to a named export**

In `hooks/useExplore.ts`, change line 8 from:

```ts
async function fetchUserSuggestions(): Promise<UserProfile[]> {
```

to:

```ts
export async function fetchUserSuggestions(): Promise<UserProfile[]> {
```

No other change in this file — `useExplore()`'s own call site (`fetchUserSuggestions` inside its `useQuery`) is unaffected by adding `export`.

- [ ] **Step 2: Typecheck**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx tsc --noEmit`
Expected: no new errors (the file's existing behavior is unchanged; this only widens visibility).

- [ ] **Step 3: Commit**

```bash
git add hooks/useExplore.ts
git commit -m "refactor: export fetchUserSuggestions for reuse in onboarding"
```

---

## Task 2: `useOnboardingContent` hook + pure cover-selection logic (TDD)

**Files:**
- Create: `hooks/useOnboardingContent.ts`
- Test: `__tests__/hooks/useOnboardingContent.test.ts`

**Interfaces:**
- Consumes: `usePublicTrips(count?: number)` from `hooks/useTripList.ts` (existing, returns `UseQueryResult<Trip[]>`); `fetchUserSuggestions` from `hooks/useExplore.ts` (Task 1); `useAuthStore` from `stores/useAuthStore.ts` (existing).
- Produces:
  - `export function selectOnboardingCovers(trips: Trip[]): { exploreCoverUrl: string | null; aiCoverUrl: string | null }` — pure, used by the hook and directly by the test.
  - `export interface OnboardingAvatar { uid: string; avatarUrl: string | null; name: string }` — used by Task 8 (`OnboardingCommunitySlide`).
  - `export interface OnboardingContent { exploreCoverUrl: string | null; aiCoverUrl: string | null; communityAvatars: OnboardingAvatar[]; isLoading: boolean }`
  - `export function useOnboardingContent(): OnboardingContent` — used by Task 10 (`onboarding.tsx`).

- [ ] **Step 1: Write the failing test for `selectOnboardingCovers`**

Create `__tests__/hooks/useOnboardingContent.test.ts`:

```ts
import { Timestamp } from 'firebase/firestore';
import { Trip } from '@/types';
import { selectOnboardingCovers } from '@/hooks/useOnboardingContent';

function makeTrip(overrides: Partial<Trip>): Trip {
  const now = Timestamp.fromDate(new Date());
  return {
    id: 'trip-1',
    authorUid: 'author-1',
    title: 'Sample Trip',
    description: '',
    coverImageUrl: null,
    destination: { name: 'Paris', placeId: null, lat: null, lng: null, countryCode: null },
    additionalDestinations: [],
    startDate: null,
    endDate: null,
    visibility: 'public',
    collaborators: [],
    isAiGenerated: false,
    status: 'planning',
    tags: [],
    likesCount: 0,
    savesCount: 0,
    createdAt: now,
    updatedAt: now,
    budgetAmount: null,
    budgetCurrency: null,
    ...overrides,
  };
}

describe('selectOnboardingCovers', () => {
  it('picks the first trip with a cover photo for exploreCoverUrl', () => {
    const trips = [
      makeTrip({ id: 'a', coverImageUrl: null }),
      makeTrip({ id: 'b', coverImageUrl: 'https://example.com/b.jpg' }),
      makeTrip({ id: 'c', coverImageUrl: 'https://example.com/c.jpg' }),
    ];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBe('https://example.com/b.jpg');
  });

  it('picks the first AI-generated trip with a cover photo for aiCoverUrl', () => {
    const trips = [
      makeTrip({ id: 'a', coverImageUrl: 'https://example.com/a.jpg', isAiGenerated: false }),
      makeTrip({ id: 'b', coverImageUrl: 'https://example.com/b.jpg', isAiGenerated: true }),
    ];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBe('https://example.com/a.jpg');
    expect(result.aiCoverUrl).toBe('https://example.com/b.jpg');
  });

  it('never returns the same trip for both slides, even if the top pick is AI-generated', () => {
    const trips = [
      makeTrip({ id: 'a', coverImageUrl: 'https://example.com/a.jpg', isAiGenerated: true }),
      makeTrip({ id: 'b', coverImageUrl: 'https://example.com/b.jpg', isAiGenerated: true }),
    ];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBe('https://example.com/a.jpg');
    expect(result.aiCoverUrl).toBe('https://example.com/b.jpg');
  });

  it('returns null for either slide when no trips qualify', () => {
    const trips = [makeTrip({ id: 'a', coverImageUrl: null })];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBeNull();
    expect(result.aiCoverUrl).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx jest __tests__/hooks/useOnboardingContent.test.ts`
Expected: FAIL — `Cannot find module '@/hooks/useOnboardingContent'` (file doesn't exist yet).

- [ ] **Step 3: Create `hooks/useOnboardingContent.ts`**

```ts
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserProfile, Trip } from '@/types';
import { usePublicTrips } from '@/hooks/useTripList';
import { fetchUserSuggestions } from '@/hooks/useExplore';
import { useAuthStore } from '@/stores/useAuthStore';

export interface OnboardingAvatar {
  uid: string;
  avatarUrl: string | null;
  name: string;
}

export interface OnboardingContent {
  exploreCoverUrl: string | null;
  aiCoverUrl: string | null;
  communityAvatars: OnboardingAvatar[];
  isLoading: boolean;
}

/** Picks slide 1's and slide 2's hero photos from the same public-trips
 * result set, ensuring they never land on the same trip. Pure — no
 * Firestore — exported so it's directly unit-testable. */
export function selectOnboardingCovers(trips: Trip[]): {
  exploreCoverUrl: string | null;
  aiCoverUrl: string | null;
} {
  const exploreTrip = trips.find((t) => !!t.coverImageUrl);
  const aiTrip = trips.find(
    (t) => t.isAiGenerated && !!t.coverImageUrl && t.id !== exploreTrip?.id
  );
  return {
    exploreCoverUrl: exploreTrip?.coverImageUrl ?? null,
    aiCoverUrl: aiTrip?.coverImageUrl ?? null,
  };
}

export function useOnboardingContent(): OnboardingContent {
  const currentUid = useAuthStore((s) => s.user?.uid ?? null);

  const { data: trips = [], isLoading: tripsLoading } = usePublicTrips(20);

  // Same queryKey shape as useExplore.ts's own fetchUserSuggestions call —
  // when the user has already visited Explore this session, this is served
  // from TanStack Query's cache with zero extra Firestore round trips.
  const { data: rawSuggestions = [], isLoading: suggestionsLoading } = useQuery({
    queryKey: ['userSuggestions', currentUid ?? 'anon'],
    queryFn: fetchUserSuggestions,
    staleTime: 10 * 60 * 1000,
  });

  const { exploreCoverUrl, aiCoverUrl } = useMemo(
    () => selectOnboardingCovers(trips),
    [trips]
  );

  const communityAvatars: OnboardingAvatar[] = useMemo(() => {
    const filtered: UserProfile[] = currentUid
      ? rawSuggestions.filter((u) => u.uid !== currentUid)
      : rawSuggestions;
    return filtered
      .slice(0, 6)
      .map((u) => ({ uid: u.uid, avatarUrl: u.avatarUrl, name: u.fullName }));
  }, [rawSuggestions, currentUid]);

  return {
    exploreCoverUrl,
    aiCoverUrl,
    communityAvatars,
    isLoading: tripsLoading || suggestionsLoading,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx jest __tests__/hooks/useOnboardingContent.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add hooks/useOnboardingContent.ts __tests__/hooks/useOnboardingContent.test.ts
git commit -m "feat: add useOnboardingContent hook for live onboarding photo/avatar data"
```

---

## Task 3: `useReduceMotion` hook

**Files:**
- Create: `hooks/useReduceMotion.ts`

**Interfaces:**
- Produces: `export function useReduceMotion(): boolean` — used by Task 5 (`KenBurnsImage`) and Task 8 (`OnboardingCommunitySlide`).

This wraps React Native's `AccessibilityInfo` module, which has no pure-logic branch to isolate and no component-rendering test infra in this repo (no `@testing-library/react-native` or `react-test-renderer` installed — see the two existing test files, both pure-module tests). Verification here is typecheck + the manual on-device check in Task 12 (toggling Reduce Motion in the simulator's Accessibility settings), consistent with how the rest of this codebase verifies RN-specific runtime behavior.

- [ ] **Step 1: Create `hooks/useReduceMotion.ts`**

```ts
import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Decorative motion (Ken Burns drift, avatar-grid drift) checks this and
// skips straight to the resting frame when true — motion here is additive,
// never load-bearing for comprehension. See the onboarding redesign spec's
// Motion System / Accessibility decision.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription.remove();
  }, []);

  return reduceMotion;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useReduceMotion.ts
git commit -m "feat: add useReduceMotion hook"
```

---

## Task 4: `SlideTextBlock` component

**Files:**
- Create: `components/onboarding/SlideTextBlock.tsx`

**Interfaces:**
- Consumes: `useTheme()` from `hooks/useTheme.ts` (existing).
- Produces: `export function SlideTextBlock(props: { eyebrow: string; title: string; body: string; active: boolean }): JSX.Element` — used by Tasks 6, 7, 8, 9.

No automated test — this is a purely presentational animated component (no pure-logic branch), verified visually in Task 12. Same reasoning as Task 3.

- [ ] **Step 1: Create `components/onboarding/SlideTextBlock.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight, LetterSpacing, LineHeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface SlideTextBlockProps {
  eyebrow: string;
  title: string;
  body: string;
  active: boolean;
}

function useRiseIn(active: boolean, delayMs: number) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  useEffect(() => {
    if (!active) {
      opacity.setValue(0);
      translateY.setValue(10);
      return;
    }
    const anim = Animated.sequence([
      Animated.delay(delayMs),
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 550, useNativeDriver: true }),
      ]),
    ]);
    anim.start();
    return () => anim.stop();
  }, [active, delayMs, opacity, translateY]);

  return { opacity, transform: [{ translateY }] };
}

// Eyebrow -> title -> body stagger, same rise-and-fade shape
// app/(auth)/welcome.tsx already uses for its logo/tagline/actions sequence
// — the whole auth flow reads as one motion language.
export function SlideTextBlock({ eyebrow, title, body, active }: SlideTextBlockProps) {
  const { colors } = useTheme();
  const eyebrowAnim = useRiseIn(active, 150);
  const titleAnim = useRiseIn(active, 280);
  const bodyAnim = useRiseIn(active, 400);

  return (
    <View style={styles.container}>
      <Animated.Text
        style={[
          styles.eyebrow,
          { color: colors.text.tertiary, opacity: eyebrowAnim.opacity, transform: eyebrowAnim.transform },
        ]}
      >
        {eyebrow}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.title,
          { color: colors.text.primary, opacity: titleAnim.opacity, transform: titleAnim.transform },
        ]}
      >
        {title}
      </Animated.Text>
      <Animated.Text
        style={[
          styles.body,
          { color: colors.text.secondary, opacity: bodyAnim.opacity, transform: bodyAnim.transform },
        ]}
      >
        {body}
      </Animated.Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: Spacing['6'] },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: LetterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom: Spacing['2'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: LetterSpacing.tight,
    marginBottom: Spacing['3'],
    lineHeight: FontSize['2xl'] * LineHeight.tight,
  },
  body: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * LineHeight.normal,
  },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/SlideTextBlock.tsx
git commit -m "feat: add SlideTextBlock onboarding component"
```

---

## Task 5: `KenBurnsImage` component

**Files:**
- Create: `components/onboarding/KenBurnsImage.tsx`

**Interfaces:**
- Consumes: `useTheme()`; `useReduceMotion()` from Task 3; `StarMark` from `components/ui/StarMark.tsx` (existing).
- Produces: `export function KenBurnsImage(props: { uri: string | null; active: boolean; style?: ViewStyle; parallaxScale?: Animated.AnimatedInterpolation<number> }): JSX.Element` — used by Task 6 (`OnboardingPhotoSlide`). `parallaxScale` is an optional externally-driven scale (the swipe-parallax effect — see Task 6) composed with this component's own internal Ken Burns scale via a second `transform` entry.

No automated test — presentational/animated, verified in Task 12 (same reasoning as Task 3/4).

- [ ] **Step 1: Create `components/onboarding/KenBurnsImage.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { StarMark } from '@/components/ui/StarMark';

interface KenBurnsImageProps {
  uri: string | null;
  active: boolean;
  style?: ViewStyle;
  // Swipe-parallax scale driven by the parent slide's scroll position
  // (Task 6) — composed with this component's own continuous Ken Burns
  // scale as a second `transform` entry, not multiplied together manually.
  parallaxScale?: Animated.AnimatedInterpolation<number>;
}

// Branded fallback (sunken tint + star mark) shows immediately; the real
// photo cross-fades in over 300ms once it resolves, so there's never a dead
// frame. Continuous slow zoom/pan while `active` — skipped when Reduce
// Motion is on. See the onboarding redesign spec's Motion System.
export function KenBurnsImage({ uri, active, style, parallaxScale }: KenBurnsImageProps) {
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      scale.setValue(1);
      translateY.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, { toValue: 1.12, duration: 9000, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: -8, duration: 9000, useNativeDriver: true }),
        ]),
        Animated.parallel([
          Animated.timing(scale, { toValue: 1, duration: 9000, useNativeDriver: true }),
          Animated.timing(translateY, { toValue: 0, duration: 9000, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, scale, translateY]);

  useEffect(() => {
    fade.setValue(0);
    if (uri) {
      Animated.timing(fade, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    }
  }, [uri, fade]);

  const transform = parallaxScale
    ? [{ scale }, { translateY }, { scale: parallaxScale }]
    : [{ scale }, { translateY }];

  return (
    <View style={[styles.container, { backgroundColor: colors.background.sunken }, style]}>
      <View style={styles.fallback}>
        <StarMark size={40} />
      </View>
      {uri ? (
        <Animated.Image
          source={{ uri }}
          style={[StyleSheet.absoluteFill, { opacity: fade, transform }]}
          resizeMode="cover"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  fallback: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/KenBurnsImage.tsx
git commit -m "feat: add KenBurnsImage onboarding component"
```

---

## Task 6: `OnboardingPhotoSlide` component (slides 1 & 2)

**Files:**
- Create: `components/onboarding/OnboardingPhotoSlide.tsx`

**Interfaces:**
- Consumes: `KenBurnsImage` (Task 5), `SlideTextBlock` (Task 4), `useTheme()`.
- Produces: `export function OnboardingPhotoSlide(props: { imageUrl: string | null; eyebrow: string; title: string; body: string; active: boolean; scrollX: Animated.Value; index: number }): JSX.Element` — used by Task 10 (`onboarding.tsx`), for slide indices 0 and 1. `scrollX` is the shared horizontal-scroll `Animated.Value` Task 10 drives off the `FlatList`'s `onScroll`; `index` is this slide's own position, used to compute the swipe-parallax interpolation.

- [ ] **Step 1: Create `components/onboarding/OnboardingPhotoSlide.tsx`**

```tsx
import { Animated, View, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/constants/spacing';
import { KenBurnsImage } from '@/components/onboarding/KenBurnsImage';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';

interface OnboardingPhotoSlideProps {
  imageUrl: string | null;
  eyebrow: string;
  title: string;
  body: string;
  active: boolean;
  scrollX: Animated.Value;
  index: number;
}

// Layout A from the design-phase visual comparison: photo fills the top
// ~60%, fades to canvas via a scrim, text + CTA sit on light ground below.
export function OnboardingPhotoSlide({
  imageUrl,
  eyebrow,
  title,
  body,
  active,
  scrollX,
  index,
}: OnboardingPhotoSlideProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();

  // Swipe parallax: the incoming photo scales in from 1.05 -> 1.0 as it
  // reaches the centered position, rather than snapping to final scale —
  // see the spec's Motion System.
  const parallaxScale = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [1.05, 1, 1.05],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.photoRegion}>
        <KenBurnsImage
          uri={imageUrl}
          active={active}
          style={StyleSheet.absoluteFillObject}
          parallaxScale={parallaxScale}
        />
        <LinearGradient
          colors={['transparent', colors.background.primary] as [string, string]}
          style={styles.scrim}
        />
      </View>
      <View style={styles.textRegion}>
        <SlideTextBlock eyebrow={eyebrow} title={title} body={body} active={active} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  photoRegion: { height: '60%', width: '100%' },
  scrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 100 },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/OnboardingPhotoSlide.tsx
git commit -m "feat: add OnboardingPhotoSlide component"
```

---

## Task 7: `OnboardingWalletSlide` component (slide 3)

**Files:**
- Create: `components/onboarding/OnboardingWalletSlide.tsx`

**Interfaces:**
- Consumes: `BoardingPassCard` from `components/wallet/BoardingPassCard.tsx` (existing — `{ pass: BoardingPass; onPress: () => void }`), `SlideTextBlock` (Task 4), `BoardingPass` type from `types/index.ts`.
- Produces: `export function OnboardingWalletSlide(props: { active: boolean }): JSX.Element` — used by Task 10, slide index 2.

- [ ] **Step 1: Create `components/onboarding/OnboardingWalletSlide.tsx`**

```tsx
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { BoardingPass } from '@/types';
import { Spacing } from '@/constants/spacing';

// There's no public wallet data to query (boarding passes/reservations are
// owner-only) — showing the app's real BoardingPassCard with a sample pass
// is more honest than generic stock photography of a travel document. See
// the onboarding redesign spec's "Wallet slide hero" decision.
const SAMPLE_PASS: BoardingPass = {
  id: 'onboarding-sample',
  ownerUid: 'onboarding-sample',
  airline: 'Nova Air',
  flightNumber: 'NA 214',
  origin: 'SFO',
  originCity: 'San Francisco',
  destination: 'NRT',
  destinationCity: 'Tokyo',
  departureTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  seat: '14A',
  boardingGroup: 'B',
  gate: '52',
  barcode: 'SAMPLE',
  status: 'upcoming',
  createdAt: new Date().toISOString(),
};

interface OnboardingWalletSlideProps {
  active: boolean;
}

export function OnboardingWalletSlide({ active }: OnboardingWalletSlideProps) {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.slide, { width }]}>
      {/* pointerEvents="none" — this is a preview, not a real interactive pass */}
      <View style={styles.cardRegion} pointerEvents="none">
        <BoardingPassCard pass={SAMPLE_PASS} onPress={() => {}} />
      </View>
      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="Travel Wallet"
          title="Every pass, one place"
          body="Boarding passes, hotel reservations, and loyalty cards — no more digging through email."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  cardRegion: { height: '48%', justifyContent: 'center', paddingTop: Spacing['8'] },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/OnboardingWalletSlide.tsx
git commit -m "feat: add OnboardingWalletSlide component"
```

---

## Task 8: `OnboardingCommunitySlide` component (slide 4)

**Files:**
- Create: `components/onboarding/OnboardingCommunitySlide.tsx`

**Interfaces:**
- Consumes: `Avatar` from `components/ui/Avatar.tsx` (existing — `{ uri?, name?, size?, style? }`), `StarMark` (existing), `SlideTextBlock` (Task 4), `useReduceMotion` (Task 3), `OnboardingAvatar` type from `hooks/useOnboardingContent.ts` (Task 2).
- Produces: `export function OnboardingCommunitySlide(props: { avatars: OnboardingAvatar[]; active: boolean; scrollX: Animated.Value; index: number }): JSX.Element` — used by Task 10, slide index 3. Same `scrollX`/`index` swipe-parallax contract as Task 6's `OnboardingPhotoSlide`.

- [ ] **Step 1: Create `components/onboarding/OnboardingCommunitySlide.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, useWindowDimensions } from 'react-native';
import { Avatar } from '@/components/ui/Avatar';
import { StarMark } from '@/components/ui/StarMark';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { OnboardingAvatar } from '@/hooks/useOnboardingContent';
import { Spacing } from '@/constants/spacing';

interface OnboardingCommunitySlideProps {
  avatars: OnboardingAvatar[];
  active: boolean;
  scrollX: Animated.Value;
  index: number;
}

export function OnboardingCommunitySlide({
  avatars,
  active,
  scrollX,
  index,
}: OnboardingCommunitySlideProps) {
  const { width } = useWindowDimensions();
  const reduceMotion = useReduceMotion();
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!active || reduceMotion) {
      scale.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.06, duration: 9000, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 9000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [active, reduceMotion, scale]);

  // Same swipe-parallax contract as OnboardingPhotoSlide (Task 6) — composed
  // with the grid's own drift scale as a second transform entry.
  const parallaxScale = scrollX.interpolate({
    inputRange: [(index - 1) * width, index * width, (index + 1) * width],
    outputRange: [1.05, 1, 1.05],
    extrapolate: 'clamp',
  });

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.gridRegion}>
        {avatars.length > 0 ? (
          <Animated.View style={[styles.grid, { transform: [{ scale }, { scale: parallaxScale }] }]}>
            {avatars.map((a) => (
              <Avatar key={a.uid} uri={a.avatarUrl} name={a.name} size="xl" style={styles.gridAvatar} />
            ))}
          </Animated.View>
        ) : (
          // Branded fallback when the suggestions query is empty (e.g. a
          // freshly-seeded database with no other users yet).
          <StarMark size={40} />
        )}
      </View>
      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="Community"
          title="Travel together"
          body="Follow other explorers, share your trips, and get inspired by the community."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  gridRegion: { height: '55%', alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing['4'],
    paddingHorizontal: Spacing['8'],
  },
  gridAvatar: { margin: Spacing['1'] },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/OnboardingCommunitySlide.tsx
git commit -m "feat: add OnboardingCommunitySlide component"
```

---

## Task 9: `OnboardingProSlide` component (slide 5)

**Files:**
- Create: `components/onboarding/OnboardingProSlide.tsx`

**Interfaces:**
- Consumes: `PaywallFeatureList` from `components/paywall/PaywallFeatureList.tsx` (existing, no props), `SlideTextBlock` (Task 4).
- Produces: `export function OnboardingProSlide(props: { active: boolean }): JSX.Element` — used by Task 10, slide index 4.

- [ ] **Step 1: Create `components/onboarding/OnboardingProSlide.tsx`**

```tsx
import { View, StyleSheet, ScrollView, useWindowDimensions } from 'react-native';
import { PaywallFeatureList } from '@/components/paywall/PaywallFeatureList';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { Spacing } from '@/constants/spacing';

interface OnboardingProSlideProps {
  active: boolean;
}

// No hero photo/component region — the feature list itself is the content,
// so it gets the space a photo would otherwise occupy. See the spec's
// Visual System section.
export function OnboardingProSlide({ active }: OnboardingProSlideProps) {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.header}>
        <SlideTextBlock
          eyebrow="Supernova Pro"
          title="Go further with Pro"
          body="Unlock unlimited AI trips, flight alerts, and more — upgrade any time."
          active={active}
        />
      </View>
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        <PaywallFeatureList />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  header: { paddingTop: Spacing['8'] },
  listContent: { paddingHorizontal: Spacing['6'], paddingTop: Spacing['4'] },
});
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/onboarding/OnboardingProSlide.tsx
git commit -m "feat: add OnboardingProSlide component"
```

---

## Task 10: Rewrite `app/(auth)/onboarding.tsx`

**Files:**
- Modify: `app/(auth)/onboarding.tsx` (full rewrite)

**Interfaces:**
- Consumes: `useOnboardingContent` (Task 2), `useReduceMotion` is NOT used directly here (only inside child components), `OnboardingPhotoSlide` (Task 6, now takes `scrollX`/`index`), `OnboardingWalletSlide` (Task 7), `OnboardingCommunitySlide` (Task 8, now takes `scrollX`/`index`), `OnboardingProSlide` (Task 9), `Button` from `components/ui/Button.tsx` (existing), `useTheme()`, `SPRING` from `constants/motion.ts`.
- Produces: default export `OnboardingScreen` — routed to by `app/(auth)/sign-up.tsx:173` and `app/_layout.tsx:123` (both unchanged, existing routes). Owns the `scrollX` `Animated.Value` (driven by the `FlatList`'s `onScroll`) that Tasks 6 and 8 consume for swipe parallax.

- [ ] **Step 1: Replace the full contents of `app/(auth)/onboarding.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  ListRenderItemInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingContent } from '@/hooks/useOnboardingContent';
import { OnboardingPhotoSlide } from '@/components/onboarding/OnboardingPhotoSlide';
import { OnboardingWalletSlide } from '@/components/onboarding/OnboardingWalletSlide';
import { OnboardingCommunitySlide } from '@/components/onboarding/OnboardingCommunitySlide';
import { OnboardingProSlide } from '@/components/onboarding/OnboardingProSlide';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

const SLIDE_COUNT = 5;
const SLIDE_INDEXES = [0, 1, 2, 3, 4];

async function markOnboardingComplete() {
  await AsyncStorage.setItem('onboarding_complete', '1');
}

function DotItem({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const width = useRef(new Animated.Value(active ? 24 : 8)).current;

  useEffect(() => {
    Animated.spring(width, { toValue: active ? 24 : 8, ...SPRING, useNativeDriver: false }).start();
  }, [active, width]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: active ? colors.text.primary : colors.background.cardBorder, width },
      ]}
    />
  );
}

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<number>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const content = useOnboardingContent();

  const handleFinish = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markOnboardingComplete();
    router.replace('/(tabs)');
  }, []);

  const handleSeePlans = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markOnboardingComplete();
    router.replace('/paywall');
  }, []);

  const handleNext = useCallback(() => {
    if (activeIndex < SLIDE_COUNT - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      handleFinish();
    }
  }, [activeIndex, handleFinish]);

  const handleSkip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markOnboardingComplete();
    router.replace('/(tabs)');
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIndex(newIndex);
    },
    [width]
  );

  const renderSlide = useCallback(
    ({ item: index }: ListRenderItemInfo<number>) => {
      const active = index === activeIndex;
      switch (index) {
        case 0:
          return (
            <OnboardingPhotoSlide
              imageUrl={content.exploreCoverUrl}
              eyebrow="Explore"
              title="Explore the world"
              body="Discover trending destinations, hidden gems, and trip ideas from real travelers."
              active={active}
              scrollX={scrollX}
              index={index}
            />
          );
        case 1:
          return (
            <OnboardingPhotoSlide
              imageUrl={content.aiCoverUrl}
              eyebrow="AI Itineraries"
              title="A full plan, in seconds"
              body="Tell us where you're headed — AI builds the day-by-day."
              active={active}
              scrollX={scrollX}
              index={index}
            />
          );
        case 2:
          return <OnboardingWalletSlide active={active} />;
        case 3:
          return (
            <OnboardingCommunitySlide
              avatars={content.communityAvatars}
              active={active}
              scrollX={scrollX}
              index={index}
            />
          );
        default:
          return <OnboardingProSlide active={active} />;
      }
    },
    [activeIndex, content.exploreCoverUrl, content.aiCoverUrl, content.communityAvatars, scrollX]
  );

  const isLast = activeIndex === SLIDE_COUNT - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.text.secondary }]}>Skip</Text>
        </TouchableOpacity>
      )}

      <FlatList
        ref={listRef}
        data={SLIDE_INDEXES}
        keyExtractor={(i) => String(i)}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.flatList}
        bounces={false}
      />

      <View style={styles.controls}>
        <View style={styles.dots}>
          {SLIDE_INDEXES.map((i) => (
            <DotItem key={i} active={i === activeIndex} />
          ))}
        </View>

        <Button
          label={isLast ? 'Get started' : 'Next'}
          onPress={handleNext}
          variant="primary"
          size="lg"
          fullWidth
          haptic="none"
        />

        {isLast ? (
          <TouchableOpacity onPress={handleSeePlans} activeOpacity={0.7} style={styles.seePlans}>
            <Text style={[styles.seePlansText, { color: colors.text.secondary }]}>See plans</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: {
    position: 'absolute',
    top: 60,
    right: Spacing['6'],
    zIndex: 10,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  skipText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  flatList: { flex: 1 },
  controls: { paddingHorizontal: Spacing['6'], paddingBottom: 48, gap: Spacing['5'] },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing['2'] },
  dot: { height: 8, borderRadius: 4 },
  seePlans: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: Spacing['2'],
  },
  seePlansText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, textDecorationLine: 'underline' },
});
```

This fully replaces the old dark/`DarkColors`/icon-bubble implementation — no `DarkColors` import remains in this file.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in `app/(auth)/onboarding.tsx` or `components/onboarding/*`.

- [ ] **Step 4: Commit**

```bash
git add app/\(auth\)/onboarding.tsx
git commit -m "feat: rewrite onboarding as a light-editorial, live-content flow"
```

---

## Task 11: Update `app/(auth)/_layout.tsx`

**Files:**
- Modify: `app/(auth)/_layout.tsx`

**Interfaces:** none (routing/theming config only, no exported symbols consumed elsewhere).

- [ ] **Step 1: Remove the `onboarding` dark-screen override and fix the stale comment**

Replace the full contents of `app/(auth)/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { DarkColors, LightColors } from '@/constants/colors';

// welcome.tsx is the one deliberately-dark immersive screen left in this
// stack (Architecture Rule 3) — sign-in/sign-up/forgot-password/onboarding
// are all light editorial. A single stack-level contentStyle can't serve
// both — without the per-screen override below, the transition into/out of
// welcome shows a flash of the wrong color at the edges.
export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: LightColors.background.primary },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="welcome" options={{ contentStyle: { backgroundColor: DarkColors.background.primary } }} />
    </Stack>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add app/\(auth\)/_layout.tsx
git commit -m "fix: drop stale dark-screen override for onboarding in auth layout"
```

---

## Task 12: Manual verification in the simulator

**Files:** none — this task runs the app, it doesn't change code.

This is the primary verification for the visual/motion/navigation behavior that can't be unit-tested in this codebase (no RN component-render test infra — see Task 3's note), matching CLAUDE.md's guidance to verify UI changes by running the feature, not just typechecking.

- [ ] **Step 1: Start Metro and launch on the iOS simulator**

Run: `cd /Users/markolsen/Projects/supernova-travel && npx expo start --dev-client`, then press `i` (or use the already-running dev-client build per this project's EAS cloud dev-build workflow).

- [ ] **Step 2: Force onboarding to show**

The screen only shows once per install. In the running app (or via a fresh simulator install), sign up with a new test account — `sign-up.tsx` routes to `/(auth)/onboarding` on success. Alternatively, if already past onboarding on a dev build, clear the flag: run `await AsyncStorage.removeItem('onboarding_complete')` from a debug console, or reinstall the app on the simulator.

- [ ] **Step 3: Walk every slide**

Confirm for each of the 5 slides:
- Slide 1 (Explore) and slide 2 (AI Itineraries) show a real trending/AI-generated trip cover photo (or the branded star-mark fallback tile if the Firestore `trips` collection has no public trips yet), with a slow continuous Ken Burns drift while the slide is active.
- Slide 3 (Wallet) shows the real `BoardingPassCard` (Nova Air, SFO → NRT) centered, not tappable.
- Slide 4 (Community) shows a grid of real user avatars (or the star-mark fallback if there are no other users yet).
- Slide 5 (Pro) shows the 5-row `PaywallFeatureList`, with **"Get started"** as the primary button and **"See plans"** as a secondary link below it.
- Eyebrow → title → body text staggers in on every slide transition (swiping back to a previous slide re-triggers it too).
- Dragging slowly between slide 1↔2 or slide 3↔4, the incoming photo/avatar-grid is subtly larger (scaled ~1.05) while off-center and eases down to its resting scale as it centers — the swipe parallax. Easiest to see with a slow, deliberate drag rather than a quick flick.
- The whole screen is light (`#FBF9F5` canvas), not dark — no leftover `DarkColors` anywhere.

- [ ] **Step 4: Verify navigation**

- "Skip" (visible on slides 1–4) → lands on `(tabs)`, and relaunching the app afterward does NOT show onboarding again (flag persisted).
- "Next" advances one slide at a time with the dot indicator tracking correctly.
- "Get started" on slide 5 → lands on `(tabs)`.
- "See plans" on slide 5 → lands on `/paywall`.

- [ ] **Step 5: Verify Reduce Motion**

In the iOS Simulator: Settings → Accessibility → Motion → toggle "Reduce Motion" on. Relaunch onboarding (per Step 2) and confirm the Ken Burns drift and avatar-grid drift no longer animate (images/avatars sit static at rest scale) while the text stagger and dot-indicator morph still work normally.

- [ ] **Step 6: Run the full test suite one more time**

Run: `npm test`
Expected: all tests pass, including the new `useOnboardingContent.test.ts`.

No commit for this task — it's verification only. If any step surfaces a bug, fix it as a small follow-up commit against the relevant task's file before considering the plan complete.
