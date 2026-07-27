# Onboarding Redesign — Light Editorial, Live Content

**Date:** 2026-07-26
**Status:** Approved

## Context

`app/(auth)/onboarding.tsx` is a 5-slide horizontal swiper shown once, immediately after sign-up
(`app/(auth)/sign-up.tsx:173`) and on any subsequent cold launch where the local
`onboarding_complete` flag hasn't been set yet (`app/_layout.tsx:122-123`). It's the first real
content a new user sees inside the app, before they land on `(tabs)`.

The current implementation is built in the dark, purple/pink-gradient, icon-bubble style — glow
orbs, aurora blobs, duotone Phosphor icons on a `DarkColors` background. This is precisely the
"AI-generated app" anti-pattern the project's design philosophy (CLAUDE.md) calls out by name, and
it isn't photo-led at all, which conflicts with the app-wide hard rule that photography leads on
any place/trip screen.

`app/(auth)/_layout.tsx` currently carries a comment claiming `welcome.tsx` and `onboarding.tsx` are
exempt "always-dark" screens per "Architecture Rule 3." The *current* CLAUDE.md Architecture Rule 3
only exempts the map/globe, splash screen, AI-generating screen, and `BoardingPassCard` — onboarding
is not on that list. The code comment is stale; this redesign brings the screen back in line with
the design doc it claims to follow. `welcome.tsx` is explicitly **out of scope** for this pass (see
Design Decisions) — only `onboarding.tsx` changes.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Scope | `onboarding.tsx` only, not `welcome.tsx` | `welcome.tsx` is a single static logo screen, not a "show what the app does" moment; a dark cold-open before a light onboarding flow reads as an intentional transition rather than an inconsistency |
| Visual content | Live app content (real Firestore data), not stock photography or custom illustration | Matches the "photos lead" rule with content that's actually true — real destinations and real people already on the platform — and doubles as social proof. Avoids an illustration-asset production project. |
| Layout | Full-bleed hero: photo/component fills the top ~60% of the slide, fades to canvas via a bottom scrim, text + CTA sit on light ground below | User-approved after a 3-way visual comparison (full-bleed vs. postcard-card inset vs. full-screen cinematic-with-overlay). Full-screen overlay was rejected specifically for reading too close to the dark/immersive splash screen, which onboarding is deliberately not part of. |
| Slide count | 4 content slides + 1 closing Pro-teaser slide (was 5, with a content-free "Ready to Explore?" closer) | Every slide now carries real content; ending on empty marketing copy was weak. The closing slide is repurposed to tease Pro rather than dropped, per the next decision. |
| Pro teaser | Slide 5 shows `PaywallFeatureList`; primary CTA still reads "Get started" and routes to `(tabs)` (not a forced paywall); a secondary "See plans" link routes to `/paywall` | A hard paywall immediately after signup, before the user has seen any value, risks onboarding drop-off. The free-tier quota (`useAiGenerateTrip`) already routes to `/paywall` naturally the first time it's relevant — this slide only sets expectations early. |
| Wallet slide hero | The real `BoardingPassCard` component with a hardcoded sample pass, not a photo | Boarding passes/reservations are owner-only Firestore data — there's no public wallet content to query. Showing the actual product UI is more honest than a generic travel-document stock photo, and doubles as a preview of a real differentiator. |
| Motion | Continuous Ken Burns drift (scale 1.0→1.12, slight pan, ~9s loop) on photo/avatar-grid slides; staggered eyebrow→title→body→CTA entrance (~120ms stagger, `cubic-bezier(0.16,1,0.3,1)`); swipe-parallax photo scale-in (1.05→1.0) | User-approved after a live browser demo. Staggered entrance reuses the exact easing/sequencing pattern `welcome.tsx` already uses for its logo/tagline/actions, so the whole auth flow reads as one motion language rather than two competing systems. |
| Reduced motion | Ken Burns and swipe-parallax both check `AccessibilityInfo.isReduceMotionEnabled()` on mount and skip to the resting frame if enabled | Motion here is decorative, not load-bearing for comprehension — matches how the rest of the app treats motion |
| Data fetching | One new hook, `useOnboardingContent()`, fetches everything in parallel on mount (TanStack Query, matching the app's no-`onSnapshot` convention) | All slide content is ready well before the user swipes to it — no pop-in mid-flow |
| Query reuse | Explore/AI-cover slides derive from the existing `usePublicTrips(20)` call; the community-avatars slide reuses the `fetchUserSuggestions` query already written for `useExplore.ts` (exported rather than duplicated) | If the user already visited Explore this session, both queries are served from TanStack Query's cache — zero extra Firestore round trips. Avoids maintaining two copies of the same query. |
| Loading / empty / error state | Each photo/avatar slide shows a static branded fallback (gradient tile + star mark) immediately; the real content cross-fades in over ~300ms once it resolves; on query failure (after TanStack Query's existing 2-retry default) it silently stays on the fallback | Onboarding never blocks or shows an error state over decorative content. A branded gradient (not fake stock photography) avoids needing to source placeholder travel photos just to cover a rare empty-database/offline edge case. |

## Slide Plan

| # | Slide | Hero content | Data source | CTA |
|---|-------|--------------|--------------|-----|
| 1 | Explore the world | Real trending trip cover photo | `usePublicTrips(20)`, first result with `coverImageUrl != null` | Next |
| 2 | AI-powered itineraries | Real AI-generated trip cover photo | Same query, filtered to `isAiGenerated === true`, excluding whichever trip slide 1 already picked | Next |
| 3 | Your travel wallet | Live `BoardingPassCard`, sample pass (SFO→NRT, `status: 'upcoming'`) | None — hardcoded literal | Next |
| 4 | Travel together | Grid of real user avatars, top-followed users | `fetchUserSuggestions` (exported from `useExplore.ts`), first 6 | Next |
| 5 | Go further with Pro | `PaywallFeatureList` (all 6 existing Pro features) | None | **Get started** (primary, → `(tabs)`) / **See plans** (secondary, → `/paywall`) |

## Visual System

- **Layout:** photo/component region fills top ~60% of the slide; `LinearGradient`-style scrim
  (transparent → `LightColors.background.primary`) blends it into the canvas below. Slide 3 swaps
  the bleed photo for a centered, padded `BoardingPassCard`; slide 5 swaps it for a scrollable
  `PaywallFeatureList` block, since 6 feature rows don't fit the photo region's height.
- **Eyebrow:** uppercase, tracked-out (`0.08em`+), muted (`colors.text.tertiary`) — the app's
  existing editorial-signature pattern, above every slide's title.
- **Title:** 24px / weight 600, `-0.02em` letter-spacing.
- **Body:** 13–15px, `colors.text.secondary`.
- **Skip:** top-right, dark text on light canvas (not white-on-photo — the photo region has already
  faded to canvas well before the skip button's row).
- **Dots:** existing `DotItem` component, unchanged — its width-morph spring already matches house
  motion spec.
- **CTA:** existing `Button` primary variant, full width, near-black/`colors.background.primary`
  text per the app's standard button styling — no longer pinned to `DarkColors`.

All colors resolve via `useTheme()`; `onboarding.tsx` drops its `DarkColors` import entirely.

## Motion System

- **Ken Burns:** continuous `Animated.loop` on the active slide's hero image/avatar-grid — scale
  1.0 → 1.12 with a small translate, ~9s, alternating. Runs only while a slide is the active index
  (paused/reset on the others to avoid animating off-screen views for no reason). Skipped entirely
  (image rendered at rest scale) when `AccessibilityInfo.isReduceMotionEnabled()` is true.
- **Text stagger:** eyebrow → title → body → CTA, each a 500-550ms rise-and-fade
  (`translateY: 10→0`, `opacity: 0→1`), staggered ~120ms apart, `cubic-bezier(0.16,1,0.3,1)` —
  the same curve `welcome.tsx` uses for its own entrance sequence. Re-keyed per slide index so React
  remounts (and thus re-triggers) the text block on every swipe.
- **Swipe parallax:** as `onMomentumScrollEnd` / scroll position updates the active index, the
  incoming slide's hero image scales in from 1.05 → 1.0 rather than snapping to final scale —
  cheap depth cue, no shared-element transition library needed.
- **Dots:** unchanged existing `DotItem` spring.

## Data Layer

### `hooks/useOnboardingContent.ts` (new)

```ts
interface OnboardingContent {
  exploreCoverUrl: string | null;
  aiCoverUrl: string | null;
  communityAvatars: Array<{ uid: string; avatarUrl: string | null; name: string }>;
  isLoading: boolean;
}
```

Implementation:
- Calls `usePublicTrips(20)` directly (existing hook, `hooks/useTripList.ts`) and derives
  `exploreCoverUrl` / `aiCoverUrl` via `useMemo` over the same result set — no new trip query.
  `aiCoverUrl` excludes whichever trip `exploreCoverUrl` resolved to, so the two photo slides never
  show the same image back to back.
- Calls a `useQuery` wrapping the newly-exported `fetchUserSuggestions` from `hooks/useExplore.ts`,
  same `queryKey`/`staleTime` as `useExplore` already uses, so the two hooks share one cache entry
  when both are warm.
- `isLoading` is true until both queries have settled (success or exhausted retries) — used only to
  decide whether to render the branded fallback vs. cross-fade in real content, never to block
  rendering or show a spinner.

### `hooks/useExplore.ts`

`fetchUserSuggestions` changes from a file-private function to a named export. No behavior change;
`useExplore()`'s own usage is unaffected.

## Files Touched

- `app/(auth)/onboarding.tsx` — full rewrite per this spec
- `app/(auth)/_layout.tsx` — remove `onboarding` from the dark-screen `contentStyle` override (falls
  back to the stack's default light `contentStyle`); fix the stale comment that calls it an
  "always-dark" screen
- `hooks/useOnboardingContent.ts` — new
- `hooks/useExplore.ts` — export `fetchUserSuggestions`

## Explicitly Out of Scope

- `welcome.tsx` — stays dark/immersive as-is (see Design Decisions)
- Any change to the `sign-up.tsx` → `onboarding` routing, or the `onboarding_complete` AsyncStorage
  flag mechanism itself
- Shared-element / native-transition libraries — the swipe parallax is a plain scale animation, not
  a real shared-element transition
- Localization of new slide copy (matches existing project-wide English-only state)
