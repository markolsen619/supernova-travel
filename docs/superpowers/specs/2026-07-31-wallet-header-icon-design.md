# Wallet header icon — design

## Problem

Users can't find the wallet. The previous wallet redesign spec
([2026-07-27-travel-wallet-redesign-design.md](./2026-07-27-travel-wallet-redesign-design.md)) noted the
only entry point was a "Wallet" button on the profile screen and left it there deliberately (a "feature
you opt into," not top-level nav).

Investigating the report, the actual bug is worse than low prominence: **the Profile tab itself has no
wallet entry point at all.** `app/(tabs)/profile.tsx` — what renders when you tap the Profile tab — has
never had a Wallet button. The Wallet button referenced in the previous spec lives on
`app/user/[uid].tsx`, a separate "view any user's profile" screen reached via `router.push('/user/<uid>')`
(tapping an avatar in a post, search result, or suggestion). It happens to also render your own profile
if the uid matches, which is how it appeared to exist — but the Profile tab never routes through it.

## Design

Add a persistent Wallet icon button to the header-actions row on two tabs, matching the icon/behavior
already established on `user/[uid].tsx`:

- **`app/(tabs)/profile.tsx`** — add to the existing `heroActions` row, next to the Settings gear icon.
  This is the actual fix: it's the first wallet entry point this screen has ever had.
- **`app/(tabs)/explore.tsx`** — today the header is just `ScreenHeaderStar` + title + subtitle, no icon
  row. Restructure the title area into the same left-star / right-icon row pattern already used on
  Profile, and put the Wallet icon there.

Explicitly out of scope (confirmed with user):
- **Feed** (`(tabs)/index.tsx`) — excluded by request.
- **Search** (`(tabs)/search.tsx`) — always-dark immersive globe screen, no header chrome by design
  (Architecture Rule 3); adding floating chrome here works against "dark is for immersive moments only."
- **Create** (`(tabs)/create.tsx`) — single-focus "how do you want to start a trip" screen with no
  secondary actions; adding an icon dilutes the one-CTA focus.
- **`app/user/[uid].tsx`** — already has a working Wallet button; left untouched.

## Implementation details

- Icon: `Bag` (phosphor-react-native), same icon already used on `user/[uid].tsx`'s Wallet button.
- Size 22 / weight `regular`, matching the existing Settings gear button's styling on Profile.
- Behavior: `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)` (nav rule) → `router.push('/(wallet)')`.
- `accessibilityLabel="Wallet"`, ≥44pt hit target (existing icon-button style already satisfies this).
- Both icons pull color from `useTheme()` (`colors.text.secondary`), never hardcoded — these are light
  chrome screens, not the always-dark exceptions.

## Testing

Manual only — this is a small, purely visual navigation change with no new data flow. Verify on both
tabs: icon renders in the header, tap navigates to `/(wallet)` (lands on the wallet hub), haptic fires,
hit target is comfortable to tap, and layout doesn't break on a narrow device width. Verify light/dark
mode both render correctly.
