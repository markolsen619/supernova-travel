# Travel Wallet Redesign — Unified Hub, Full CRUD

**Date:** 2026-07-27
**Status:** Approved

## Context

The travel wallet (boarding passes, reservations, loyalty programs) already exists as three separate,
disconnected features under `app/(wallet)/`, but it's meaningfully unfinished:

- **Reservations have no add screen.** `app/(wallet)/reservations.tsx`'s `+` button shows
  `Alert.alert('Coming soon', 'Adding reservations manually is coming in a future update.')` — there is
  no way to create a reservation from the UI at all today.
- **Nothing is editable.** `hooks/useBoardingPasses.ts`, `useReservations.ts`, and
  `useLoyaltyPrograms.ts` each expose only `add*`/`delete*` mutations. Firestore rules already permit
  `update` for the document owner on all three collections (`firestore.rules:285-300`), so this is a
  purely client-side gap, not a security one.
- **There's no unified entry point.** The only way into the wallet is a "Wallet" button on your own
  profile (`app/user/[uid].tsx:93-96`), which jumps straight to the boarding-passes list. Reservations
  and loyalty programs are separate screens with no cross-navigation between any of the three.
- **The header markup is duplicated 8 times** — every one of the 8 existing wallet screens hand-rolls
  the identical back-button / small-star / title / right-action header.

Live flight monitoring (gate/terminal-change detection, delay detection, and the notification logic
that would use them) is explicitly **out of scope** for this project — it's independent enough to be
its own future project, and the user confirmed building the wallet itself first. This project adds the
`terminal` field to the data model now (see Design Decisions) so that future project doesn't need a
second migration, but implements no logic that populates or reacts to it.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Visual direction | Light-editorial hub (background, header, tabs, reservation rows) with the existing dark, skeuomorphic boarding-pass and loyalty cards preserved as-is | User-approved after a 2-way visual comparison against a fully-dark "Apple Wallet style" section. The project's design philosophy reserves dark for a short, deliberate list of immersive moments (splash, globe map, AI-generating) — a whole feature area going dark is exactly the "AI-generated app" anti-pattern it calls out. The boarding-pass/loyalty-card dark treatment is a narrower, already-documented exception (skeuomorphic physical object), which this project doesn't touch. |
| Navigation entry point | Unchanged — still only the "Wallet" button on the user's own profile (`app/user/[uid].tsx`), now pointing at the new unified hub instead of straight to boarding passes | No tab bar change. Keeps the 5-tab bar (Feed/Explore/Create/Search/Profile) as-is; the wallet remains a feature you opt into from your profile rather than a top-level nav destination. |
| Hub structure | One new screen, `app/(wallet)/index.tsx`, replaces `boarding-passes.tsx`/`reservations.tsx`/`loyalty.tsx` as the entry point. Four segments: **All · Flights · Reservations · Loyalty** | A single "Reservations" segment (rather than splitting into e.g. "Stays") avoids awkwardly excluding restaurant/car-rental/show reservations from a narrower label — every reservation row already shows its own type icon and color, so the sub-type distinction isn't lost. |
| Reservation types | Add `'show'` to `ReservationType`, with its own icon (`Confetti`, distinct from `activity`'s `Ticket`) | User explicitly mentioned shows/concerts/theater as a category distinct from generic "activity." |
| Edit UX pattern | Reuse the existing full-screen add form for edit, keyed by an optional `?id=` query param, rather than a separate modal-sheet edit flow | Matches the app's existing "Add X" full-push-screen pattern (used today for boarding passes and loyalty) rather than introducing a second UI pattern (page-sheet modal, as `EditProfileSheet` uses) just for wallet items. Smaller build: one form per type serves both add and edit. |
| `terminal` field | Add `terminal?: string` to `BoardingPass` now, editable in the form next to the existing `gate` field | Costs almost nothing to add now and avoids a second data-model migration when the (separate, future) flight-monitoring project needs it. No automated flow populates it yet — purely manual entry, like every other field in this form today. |
| Date/time entry | Replace raw free-text ISO date/time inputs (departure time, check-in/out, loyalty expiry) with `@react-native-community/datetimepicker`, reusing the exact iOS-modal-spinner / Android-native-dialog integration pattern `app/(auth)/sign-up.tsx` already establishes | The dependency is already in the project (used once, for date-of-birth entry) — no new dependency, and replaces a real UX rough edge (typing `"2025-08-15T10:30:00"` by hand) with a proper picker, directly serving the "sleek and modern" ask. |
| Shared header | Extract `components/wallet/WalletHeader.tsx` (back button, small `StarMark` + title, optional right-side action) from the 8x-duplicated inline header markup | Every wallet screen is touched by this project anyway; this is the natural moment to deduplicate rather than copy-pasting a 9th/10th/11th copy for the new hub and reservation-add screens. |
| "All" segment's add button | `Alert.alert` with one button per type (`Boarding pass / Reservation / Loyalty program / Cancel`) | Reuses the same native, cross-platform multi-button alert already used for delete confirmations throughout the wallet — no new bottom-sheet component needed for a single three-way choice. The app has no existing action-sheet pattern to reuse instead. |
| Reservation photo attachments | `Reservation.attachmentUrls` stays untouched/unused | No image-upload flow exists anywhere in the app for reservations today; building one is a meaningfully larger feature than this pass and wasn't requested. |
| Testing | One unit test for the new pure `combineDateAndTime` helper (date + time `Date` objects → ISO string); everything else verified manually in the simulator | The feature is almost entirely UI/CRUD wiring against patterns already proven elsewhere (same mutation shape, same form styling, same DateTimePicker integration copied from sign-up.tsx). `combineDateAndTime` is the one piece of new logic subtle enough (timezone/component-swap bugs) to be worth testing in isolation. No component-render test library is installed in this repo, consistent with how other recent UI work here has been verified. |

## Data Model

### `types/index.ts`

```ts
export interface BoardingPass {
  id: string;
  ownerUid: string;
  airline: string;
  flightNumber: string;
  origin: string;
  originCity: string;
  destination: string;
  destinationCity: string;
  departureTime: string;
  arrivalTime?: string;
  seat?: string;
  boardingGroup?: string;
  gate?: string;
  terminal?: string;        // new
  barcode?: string;
  barcodeFormat?: BarcodeFormat;
  status: BoardingPassStatus;
  createdAt: string;
}

export type ReservationType =
  | 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show'; // 'show' new
```

No Firestore migration needed — `terminal` is optional, existing documents read fine without it, and
security rules already allow the document owner to `update` all three wallet collections.

### `constants/icons.ts`

```ts
export const RESERVATION_ICONS: Record<ReservationType, IconEntry> = {
  hotel:      { Icon: Buildings, color: '#a78bfa' },
  airbnb:     { Icon: House,     color: '#f472b6' },
  rental_car: { Icon: Car,       color: '#fbbf24' },
  restaurant: { Icon: ForkKnife, color: '#f472b6' },
  activity:   { Icon: Ticket,    color: '#34d399' },
  show:       { Icon: Confetti,  color: '#f472b6' },  // new
};
```

## Hooks

`hooks/useBoardingPasses.ts`, `hooks/useReservations.ts`, `hooks/useLoyaltyPrograms.ts` each gain an
`update*` mutation, following the identical shape their existing `add*`/`delete*` mutations already
use:

```ts
// hooks/useBoardingPasses.ts (same shape in the other two hooks, substituting collection/type names)
const updatePass = useMutation({
  mutationFn: async ({ id, ...updates }: Partial<BoardingPass> & { id: string }) => {
    await updateDoc(doc(db, 'boarding_passes', id), updates);
  },
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] }),
});

return { boardingPasses, isLoading, addPass, updatePass, deletePass };
```

`useReservations` returns `updateReservation`; `useLoyaltyPrograms` returns `updateProgram`. Both
follow the exact same three-line mutation + invalidate shape.

## `components/wallet/WalletHeader.tsx` (new)

```ts
interface WalletHeaderProps {
  title: string;
  onBack: () => void;
  rightAction?: { icon: PhosphorIcon; onPress: () => void; label: string };
}
```

Replaces the identical hand-rolled header (`ArrowLeft` back button, `StarMark size={18}` + title, and
an optional right-side icon button — see `app/(wallet)/boarding-passes.tsx:38-62` for the pattern being
extracted) across all 8 existing wallet screens plus the 2 new ones (hub, reservation add/edit).

## `app/(wallet)/index.tsx` (new — the unified hub)

Replaces `boarding-passes.tsx`, `reservations.tsx`, and `loyalty.tsx` as the entry point (those three
files are deleted; their route names are removed from `app/(wallet)/_layout.tsx`).

- **Header**: `WalletHeader` — title "Wallet," right action is `+` (Plus icon).
- **Segmented control**: `All · Flights · Reservations · Loyalty`, same selectable-pill visual language
  the loyalty-add form's program-type selector already uses.
- **Content** (per segment):
  - **All**: one scrolling list, grouped under section labels ("Flights," "Reservations," "Loyalty") —
    a label only renders when more than one category has content, so a wallet with just flights shows
    no empty section headers.
  - **Flights / Reservations / Loyalty**: the same list filtered to that one category, no section
    labels needed.
  - Boarding passes sort by `departureTime` ascending, reservations by `checkIn` ascending, loyalty by
    `programName` ascending — unchanged from today's per-screen sorting.
- **Loading**: `SkeletonCard` × 3, shown while any of the three underlying queries (`useBoardingPasses`,
  `useReservations`, `useLoyaltyPrograms`) is loading.
- **Empty states**: `EmptyState` (full `size="md"`) when the whole wallet is empty across all three
  categories ("Your wallet is empty — add a boarding pass, reservation, or loyalty program to get
  started"); `EmptyState size="sm"` for an individual empty segment when viewing e.g. "Loyalty" with
  nothing added yet.
- **Add button behavior**:
  - On **All**: `Alert.alert('Add to wallet', undefined, [{ text: 'Boarding pass', onPress: ... },
    { text: 'Reservation', onPress: ... }, { text: 'Loyalty program', onPress: ... }, { text: 'Cancel',
    style: 'cancel' }])`, each routing to that type's add screen.
  - On a specific segment: routes straight to that segment's add screen (`Flights` →
    `boarding-pass/add`, `Reservations` → `reservation/add`, `Loyalty` → `loyalty/add`), matching the
    single-purpose `+` buttons the three old list screens already had.

## Add / Edit Forms

Each type has one form screen serving both add and edit, switched by an optional `id` query param:

- `boarding-pass/add` (no param) → add mode
- `boarding-pass/add?id=xyz` → edit mode: looks up the existing pass via `useBoardingPasses()`,
  pre-fills every field, header title becomes "Edit boarding pass," submit button becomes "Save
  changes," and submit calls `updatePass.mutate({ id, ...formFields })` instead of `addPass.mutate`.

Same `?id=` pattern for `reservation/add` and `loyalty/add`.

### Boarding pass form (`app/(wallet)/boarding-pass/add.tsx`, modified)

All existing fields unchanged, plus:
- **Terminal** field added next to the existing **Gate** field, same row.
- **Departure date** and **Departure time** become two `DateTimePicker` fields (`mode="date"` and
  `mode="time"` respectively) instead of one free-text ISO datetime input. Combined into a single ISO
  string on submit via the new `combineDateAndTime(date: Date, time: Date): string` helper (see
  Testing below). Uses the same iOS-modal-spinner-with-"Done"-button / Android-native-dialog-on-tap
  integration `app/(auth)/sign-up.tsx:456-483` already establishes for date-of-birth entry.

### Reservation form (`app/(wallet)/reservation/add.tsx` — new file, doesn't exist today)

- **Type** selector: `hotel · airbnb · rental_car · restaurant · activity · show`, same selectable-pill
  pattern as the loyalty form's program-type row (`app/(wallet)/loyalty/add.tsx:178-209`).
- **Title**, **confirmation code** (both required).
- **Check-in** / **check-out**: `DateTimePicker` in `mode="date"` (date-only, per the `Reservation`
  type — no time component).
- **Address**, **notes** (both optional, plain text, unchanged shape from the `Reservation` type).
- `attachmentUrls` is not exposed in this form — see Design Decisions.
- Submit calls `addReservation.mutate(...)` (add mode) or `updateReservation.mutate({ id, ... })` (edit
  mode).

### Loyalty form (`app/(wallet)/loyalty/add.tsx`, modified)

All existing fields unchanged, plus:
- **Expiry date** switches from free-text (`"YYYY-MM-DD"` placeholder) to `DateTimePicker`
  (`mode="date"`).
- Reused for edit via the `?id=` param, following the same prefill/title-swap/submit-branch pattern as
  the other two forms.

## Detail Screens

`boarding-pass/[id].tsx`, `reservation/[id].tsx`, `loyalty/[id].tsx` each gain an **Edit** button
alongside the existing **Delete** button — both full-width, stacked, Edit as `variant="secondary"`
above Delete's existing destructive-outline style. Edit routes to that type's add screen with
`?id={item.id}`.

## `app/(wallet)/_layout.tsx`

```tsx
<Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
  <Stack.Screen name="index" />
  <Stack.Screen name="boarding-pass/[id]" />
  <Stack.Screen name="boarding-pass/add" />
  <Stack.Screen name="reservation/[id]" />
  <Stack.Screen name="reservation/add" />
  <Stack.Screen name="loyalty/[id]" />
  <Stack.Screen name="loyalty/add" />
</Stack>
```

`boarding-passes`, `reservations`, `loyalty` route entries are removed (their files are deleted).

## `app/user/[uid].tsx`

`handleWalletPress` (line 93-96) changes its target from `/(wallet)/boarding-passes` to
`/(wallet)` (the new hub's `index.tsx`). No other change to this file.

## Testing

`combineDateAndTime(date: Date, time: Date): string` — a new pure helper (likely living in
`utils/date.ts` or colocated with the boarding-pass form, exact location decided at plan time) that
takes the separately-picked date and time `Date` objects from the two `DateTimePicker`s and produces
one combined ISO 8601 string for `BoardingPass.departureTime`. Gets a unit test covering: normal
combination, a time crossing midnight, and a date/time pair whose individual `Date` objects carry
unrelated day-of-month values (only the time-of-day components of `time` should be used, the
date-of-month components of `date`). Everything else in this project — hub filtering/sorting, form
prefill, mutation wiring, header extraction — is verified manually in the simulator, matching how the
rest of the app's recent UI work has been tested (no component-render test library installed here).

## Explicitly Out of Scope

- Gate/terminal-change detection, delay detection, and any notification logic that would use the new
  `terminal` field — separate future project.
- Any change to `functions/src/checkFlightStatus.ts`.
- Reservation photo attachments / image upload (`Reservation.attachmentUrls`).
- Barcode/pass scanning or OCR import — every add/edit flow remains manual entry, matching today.
- Tab bar changes — the wallet is not becoming a top-level tab in this project.
