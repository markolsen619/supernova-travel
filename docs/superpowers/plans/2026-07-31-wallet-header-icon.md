# Wallet Header Icon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent Wallet icon button to the header of the Profile tab and the Explore tab, so the wallet has an entry point on the screen users actually land on.

**Architecture:** Both tabs get a `Bag` icon (phosphor-react-native) added to their existing header row, wired to `router.push('/(wallet)')` with a `Light` haptic on press — the exact same icon/behavior already used by the (untouched) Wallet button on `app/user/[uid].tsx`. Profile's header row already has room next to the Settings gear; Explore's header has no icon row today and needs one added.

**Tech Stack:** React Native, Expo Router, phosphor-react-native, expo-haptics. No new dependencies.

## Global Constraints

- Icon: `Bag` from `phosphor-react-native`, size 22, weight `regular` — matches the existing Settings gear icon's styling on Profile.
- Color: `colors.text.secondary` from `useTheme()` — never a hardcoded hex (Architecture Rule 3).
- Haptic: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` on tap (nav rule).
- Navigation target: `router.push('/(wallet)')`.
- `accessibilityLabel="Wallet"` on both buttons.
- `useCallback` required for the press handler (Architecture Rule 6).
- Do not touch `app/user/[uid].tsx` — its existing Wallet button is out of scope.
- Do not touch `app/(tabs)/index.tsx` (Feed), `app/(tabs)/search.tsx`, or `app/(tabs)/create.tsx` — explicitly excluded per the design spec.

---

### Task 1: Wallet icon on Profile tab header

**Files:**
- Modify: `app/(tabs)/profile.tsx:1-40` (imports), `:180-183` (handlers area), `:204-215` (heroActions JSX), `:483-495` (styles)

**Interfaces:**
- Consumes: existing `router` (from `useFocusEffect`'s `import { router, useFocusEffect } from 'expo-router';` — profile.tsx uses the static `router` singleton, not `useRouter()`), existing `colors` from `useTheme()`, existing `styles.heroIconBtn`.
- Produces: nothing consumed by other tasks — Task 2 is an independent file.

- [ ] **Step 1: Add the `Bag` icon import**

In `app/(tabs)/profile.tsx`, the icon import block currently reads (around line 16):

```ts
import {
  Gear,
  PencilSimple,
  MapTrifold,
  BookmarkSimple,
  SquaresFour,
  Compass,
} from 'phosphor-react-native';
```

Add `Bag` to the list:

```ts
import {
  Bag,
  Gear,
  PencilSimple,
  MapTrifold,
  BookmarkSimple,
  SquaresFour,
  Compass,
} from 'phosphor-react-native';
```

- [ ] **Step 2: Add the `handleWallet` callback**

Directly below the existing `handleSettings` callback (around line 180-183):

```ts
  const handleSettings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/settings');
  }, []);
```

add:

```ts
  const handleWallet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)');
  }, []);
```

- [ ] **Step 3: Add the Wallet button to the `heroActions` row**

The current JSX (around line 204-215) reads:

```tsx
        <View style={styles.heroActions}>
          <ScreenHeaderStar />
          <TouchableOpacity
            onPress={handleSettings}
            style={styles.heroIconBtn}
            activeOpacity={0.7}
            hitSlop={6}
            accessibilityLabel="Settings"
          >
            <Gear size={22} color={colors.text.secondary} weight="regular" />
          </TouchableOpacity>
        </View>
```

Replace it with a version that groups Wallet + Settings together on the right (so `justifyContent: 'space-between'` on `heroActions` still puts the star on the far left and the icon pair on the far right, instead of spreading three items evenly):

```tsx
        <View style={styles.heroActions}>
          <ScreenHeaderStar />
          <View style={styles.heroIconGroup}>
            <TouchableOpacity
              onPress={handleWallet}
              style={styles.heroIconBtn}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Wallet"
            >
              <Bag size={22} color={colors.text.secondary} weight="regular" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSettings}
              style={styles.heroIconBtn}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Settings"
            >
              <Gear size={22} color={colors.text.secondary} weight="regular" />
            </TouchableOpacity>
          </View>
        </View>
```

- [ ] **Step 4: Add the `heroIconGroup` style**

In the `StyleSheet.create` block, directly below `heroIconBtn` (around line 490-495):

```ts
  heroIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
```

add:

```ts
  heroIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no new errors involving `app/(tabs)/profile.tsx`.

Run: `npm run lint`
Expected: no new errors involving `app/(tabs)/profile.tsx`.

- [ ] **Step 6: Manually verify in the running app**

Run: `npx expo start` (press `i` for iOS simulator, or `w` for web).

Sign in, open the **Profile** tab. Confirm:
- A bag icon now appears to the left of the gear icon in the top header row.
- Tapping it navigates to the wallet hub (`/(wallet)`), and the back gesture returns to Profile.
- Tapping it produces a light haptic on a physical device (not testable in simulator, but code review confirms the call is present).
- Layout doesn't overlap or clip on a standard iPhone width.

- [ ] **Step 7: Commit**

```bash
git add app/\(tabs\)/profile.tsx
git commit -m "$(cat <<'EOF'
feat: add wallet icon to Profile tab header

The Profile tab never had a wallet entry point — the existing Wallet
button lived only on app/user/[uid].tsx, a screen the tab never routes
through.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cq4MSAMakHpHAoaRNgcpBY
EOF
)"
```

---

### Task 2: Wallet icon on Explore tab header

**Files:**
- Modify: `app/(tabs)/explore.tsx:1-23` (imports), `:111-119` (handlers area), `:131-142` (header JSX), `:248-265` (styles)

**Interfaces:**
- Consumes: existing `router` (from `const router = useRouter();` at line 79), existing `colors` from `useTheme()`.
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Add the `TouchableOpacity` and `Bag` imports**

Current imports (lines 1-23):

```tsx
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useExplore } from '@/hooks/useExplore';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { TrendingCard } from '@/components/explore/TrendingCard';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { TripGrid } from '@/components/explore/TripGrid';
import { SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { Trip } from '@/types';
```

Change the `react-native` import to include `TouchableOpacity`, and add a new `phosphor-react-native` import for `Bag`:

```tsx
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { Bag } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useExplore } from '@/hooks/useExplore';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { TrendingCard } from '@/components/explore/TrendingCard';
import { UserSuggestion } from '@/components/explore/UserSuggestion';
import { TripGrid } from '@/components/explore/TripGrid';
import { SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';
import { Trip } from '@/types';
```

- [ ] **Step 2: Add the `handleWalletPress` callback**

Directly below the existing `handleTrendingPress` callback (around line 116-119):

```ts
  const handleTrendingPress = useCallback((name: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(tabs)/search', params: { q: name } });
  }, [router]);
```

add:

```ts
  const handleWalletPress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)');
  }, [router]);
```

- [ ] **Step 3: Restructure the header JSX to add a right-aligned Wallet icon**

Current JSX (lines 131-142):

```tsx
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.titleRow}>
            <ScreenHeaderStar />
            <Text style={[styles.title, { color: colors.text.primary }]}>
              Explore
            </Text>
          </View>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Discover your next destination
          </Text>
        </View>
```

Replace with:

```tsx
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerTopRow}>
            <View style={styles.titleRow}>
              <ScreenHeaderStar />
              <Text style={[styles.title, { color: colors.text.primary }]}>
                Explore
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleWalletPress}
              style={styles.walletBtn}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Wallet"
            >
              <Bag size={22} color={colors.text.secondary} weight="regular" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
            Discover your next destination
          </Text>
        </View>
```

- [ ] **Step 4: Update styles — add `headerTopRow` and `walletBtn`, move `marginBottom` off `titleRow`**

Current styles (lines 248-265):

```ts
  header: {
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['6'],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    marginBottom: Spacing['1'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  subtitle: {
    fontSize: FontSize.sm,
  },
```

Replace with (the `marginBottom` that used to sit on `titleRow` now belongs on the row wrapping both the title and the wallet icon):

```ts
  header: {
    paddingHorizontal: Spacing['6'],
    marginBottom: Spacing['6'],
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing['1'],
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  subtitle: {
    fontSize: FontSize.sm,
  },
  walletBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
```

- [ ] **Step 5: Typecheck and lint**

Run: `npx tsc --noEmit`
Expected: no new errors involving `app/(tabs)/explore.tsx`.

Run: `npm run lint`
Expected: no new errors involving `app/(tabs)/explore.tsx`.

- [ ] **Step 6: Manually verify in the running app**

With the dev server still running from Task 1, open the **Explore** tab. Confirm:
- A bag icon now appears at the right edge of the header, level with the "Explore" title/star.
- Tapping it navigates to the wallet hub (`/(wallet)`), and the back gesture returns to Explore.
- The subtitle ("Discover your next destination") still sits directly below the header row with the same spacing as before.
- Layout doesn't overlap or clip on a standard iPhone width.

- [ ] **Step 7: Commit**

```bash
git add app/\(tabs\)/explore.tsx
git commit -m "$(cat <<'EOF'
feat: add wallet icon to Explore tab header

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Cq4MSAMakHpHAoaRNgcpBY
EOF
)"
```
