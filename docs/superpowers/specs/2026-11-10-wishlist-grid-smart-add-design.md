# Wish list: photo grid, smart add, server covers — design

**Date:** 2026-11-10 · **Owner approved:** sections 1–3 in chat (2026-11-10) · **Builds on:** `2026-11-06-social-wishlist-design.md`

## Why

Device test of build 67 (owner, 2026-11-10):

- The profile's wish list is a plain text list grouped by city. The owner mostly opens it to **find something they saved** ("that Budapest market post"), and a list of place names doesn't help with that.
- The saved-post screen's cover never loads. TikTok's oEmbed returns no image for photo posts, and the phone's fetch of TikTok's embed page doesn't return the post's data. The **server** reads the same embed page fine (log `embed: 'caption'`, 2026-11-10).
- Getting a saved place into a trip meant choosing a day from a list of 18. That list also opened 0 pt tall (a grey screen, fixed separately in `3ab4a95`).

## Goals

1. Saved posts are easy to find again: a photo grid like Explore and Profile.
2. A saved place lands in the right day of a trip with one tap, and you see where it went.
3. Covers show reliably, without storing images.

Unchanged: the wish list stays private, TikTok-only, and owner-only. Google Places is not used. Server cost stays near zero.

## 1. Profile wish list: photo grid

Profile → Trips → **Wish list** replaces the grouped text list (`components/wishlist/WishlistList`) with:

- **A grid of saved posts,** newest first.
  - Columns come from `useLayout().columns`, as in Explore: 2 on a phone, 3–4 on iPad.
  - Each card has a 4:5 cover and an eyebrow of the post's city plus place count (`BUDAPEST · 1 PLACE`; `2 PLACES`; no city → `TIKTOK`).
  - Below the cover is the creator, `@handle`.
  - A small **On a trip** tag shows when any of the post's places has `addedTo`.
- **City filter chips** above the grid (`components/explore/FilterChips`):
  - The chips are `All · {city} ({n}) …`, cities ordered by number of saves, each counted once per post.
  - A post counts under its own `city`, and also under any of its places' cities.
  - Selecting a chip shows only that city's posts. The selection resets when the screen is left; it is not persisted.
- **Paste a TikTok link** stays at the top as a secondary row. It opens `/wishlist/save`, as today.
- **Empty state:** an icon, the title "Save places from TikTok", the line "Share a video to Supernova and its places land here.", and the action **Paste a link**.
- **Tapping a card** opens `/wishlist/[id]` (the saved-post screen, which has its back button since `588f62d`).
- **While a cover loads or fails,** the card shows the quiet image mark (`ImageSquare`, `text.disabled`), never an error.

Pure rules live in `utils/wishlist.ts`:
- `wishCityChips(saves)` returns `{ city, count }[]`.
- `savesInCity(saves, city | null)` filters the posts.
- `wishCardEyebrow(save)` builds the eyebrow.

## 2. Smart add

### Entry points

- The city card on a trip (`CityWishlistCard`): its rows call smart add instead of opening the day list.
- The trip's **Wish list · N** chip sheet (`TripWishlistSheet`).
- The saved-post screen, place → **Add to a trip**:
  - If exactly one upcoming or current trip fits the place (`fitsTrip`), smart add goes straight to it.
  - Otherwise the trip picker (`AddWishToTripSheet`) shows first, and smart add runs on the chosen trip.

### Choosing the day

A new pure function, `smartPlacement(trip: TripWithDays, place, today)`, returns `{ dayId, order, afterTitle | null, dayNumber, city }`, or `null`.

1. **The place's city.**
   - The place goes to its nearest located trip city, as in `wishByCity`.
   - A day's city is `day.destinationIndex` (single-city trips: city 0).
2. **Candidate days.**
   - The candidates are that city's days.
   - Past days are dropped while the trip is under way. Day N's date is `tripStart(trip)` (`utils/agentApply.ts`) + N − 1. Undated trips keep every day.
   - No candidates → `null`.
3. **Score each day.**
   - The score is the kilometres the place adds at its best spot: `bestInsertion` / `insertionCostKm` from `utils/routePlacement.ts`.
   - Timed and booked stops are `fixed`, as in Nova.
   - Stops without a position are ignored for distance.
4. **Pick a day.**
   - The lowest added km wins.
   - Ties go to the day with fewer stops, then the earlier day.
   - If every candidate day has no located stop, the first candidate that isn't the city's departure day wins. The departure day is the city's last day when it is also the next city's arrival day. A city with a single day uses that day.
5. **The order value.**
   - The order is the midpoint between the neighbours at the chosen spot, or last + step: the same rule as `utils/agentApply.ts` `orderAt` (exported for this; today module-private).
   - It is one write, and no other stop is renumbered.

`null`, or a place without a position, falls back to today's flow: the day list (`DayPickerSheet`).

### The write

The write is the ordinary stop add (`useCreateTrip().addActivity` with `wishActivity(place, save)`, at the computed `order`), then `markAdded` on the wish list. The firestore rules and offline guard are the same as adding by hand. Offline, it shows "Connect to add this" (`requireOnline`).

### The result banner (trip page)

`✓ Added to Day 6 · Budapest, after Fisherman's Bastion` · **Change day** · **Undo**

- **Wording** comes from a pure `smartAddBanner(result)`:
  - `after {title}` when there's a stop before it.
  - `first stop of Day N` when there isn't.
  - Single-city trips leave out the city.
- **Change day** opens `DayPickerSheet`. Picking a day moves the stop there: deleted and re-added at that day's best spot, with the wish list's `addedTo` updated.
- **Undo** deletes the stop and clears `addedTo`.
- **The banner** stays 6 s, or until it's tapped. It uses the house spring, and the page scrolls to the new stop.
- **Started outside the trip page:** smart add from the saved-post screen opens the trip (`/trip/{id}`) and the banner shows there. Params: `wishAdded={activityId}`, `wishDay={dayId}`.

Afterwards the place leaves the city card (`wishByCity` already drops places on the trip) and reads **On this trip** in the chip sheet. On a shared trip it is an ordinary stop the members see. The wish list itself is never shared.

## 3. Covers from the server

### The callable

`wishCovers({ videoIds: string[] })`, in `functions/src/wishCoverFunctions.ts`, with pure rules in `functions/src/wishCovers.ts`.

- **Auth and limits:** signed-in callers only. At most 30 ids, digits only (`/^\d{8,25}$/`).
- **Only the caller's own saves:** one `getAll` of `users/{uid}/wishlist/{id}`. Ids not in the caller's wish list are dropped, so the callable can't fetch arbitrary TikTok content.
- **For each remaining id,** it reads `socialPosts/{id}` (server-only, already exists):
  - **Cache hit:** if `cover.url` is set and `cover.expiresMs − now > 1 h`, the cached link is returned.
  - **Cache miss:** otherwise it fetches `https://www.tiktok.com/embed/v2/{id}` (5 s timeout), parses it with `parseEmbedPage`, and merges `cover: { url, expiresMs }` into the doc. The doc is not created if the post's own cache entry doesn't exist. The cover lives in its own field, so it never touches the post's cached places.
  - **`expiresMs`** comes from `coverExpiry(url, now)`: the link's `x-expires` query parameter (seconds) × 1000. If it's missing or unreadable, now + 24 h. It is capped at now + 14 days.
- **Response:** `{ covers: Record<videoId, string | null> }`. A failed fetch gives `null` and is not cached.
- **Runtime:** the callable runs in parallel with `allSettled`.

### The app

- `hooks/useWishCovers(videoIds)` is a TanStack query keyed by the sorted ids, with `staleTime` 1 h. It is used by the grid and the saved-post screen, and is never persisted offline.
- The phone-side cover lookups are removed: `tiktokCover` and the embed-page fetch in `services/socialPost.ts`. The phone's reading for **saving** (`readPostOnDevice`) stays as a hint.
- The save sheet keeps the `coverUrl` that `readSocialPost` returns.

### Cost

- A cache read per post at most once an hour per viewer, and one free TikTok fetch per post about weekly.
- No images are stored, so `users/{uid}/wishlist` is unchanged and the rules are unchanged.

## Testing

Everything is pure-function tests (the project has no component renderer).

- **`wishCityChips` / `savesInCity` / `wishCardEyebrow`:** counts, ordering, posts whose places are in several cities, no city.
- **`smartPlacement`:**
  - picks the day with the least added km;
  - keeps fixed (timed or booked) stops in place;
  - drops past days;
  - empty days → the first day that isn't the departure day;
  - single-day city;
  - no city days → `null`;
  - unlocated place → `null`;
  - the order lands between its neighbours.
- **`smartAddBanner`:** after a stop, first stop, single-city wording.
- **`coverExpiry`:** an `x-expires` in seconds, missing, garbage, capped.
- **Cache choice:** good with > 1 h left, refreshed otherwise; ids not in the caller's list are dropped.

## Out of scope

A globe view of saves, pins on the trip map, AI suggestions of which saves to add, other platforms, sharing a wish list.
