# Home landing page and Explore with the feed — design

Date: 2026-10-29 · Owner-approved in conversation (sections 1–4; mockups: "Supernova Home Layouts" v2 and "Supernova Explore Layouts" option B).

## Why

With few users, the feed (today's Home tab) looks empty and confuses people. Home becomes a landing page with
everything at a glance — your trips, wallet, messages — and the feed's photos and videos move into Explore, where
they inspire next to the destinations.

## Decisions (owner)

- Tabs stay **Home · Explore · + · Globe · Profile**; Home and Explore change jobs.
- Home = layout A with a **sticky header**: the splash logo (star + wordmark) on the left, **Wallet** and one
  combined **Inbox** button (notifications + messages) on the right. No shortcut cards.
- A **Today card** while on a trip; **Get inspired** whenever there are **0 or 1** trips ahead.
- Greetings vary: several versions per time of day, sometimes in the trip's local language.
- Explore = option **B** as drawn: a **From travelers** row on top, then destinations, latest trips, people to follow.
  No globe background.

## Navigation (Section 1)

- `app/(tabs)/index.tsx` becomes Home. The current feed screen moves to a full-screen route `app/feed.tsx`
  (push, with a back button), opened from Explore with an optional `start` post id; it keeps everything it does today
  (photos, videos, double-tap like, trip cards every 3 posts, travelers to follow, moderation filtering).
- Posting ("Add to feed") moves to: a **Share** link on Explore's From travelers row, and a new Create-tab option
  **"Share a photo or video"** (opens the existing `/add-to-feed` flow).
- Wallet: Home's header button and Profile (as today). The wallet entry on Explore is removed.
- Notifications and messages: Home's header button opens the existing inbox `app/notifications.tsx`.
- Push taps and in-app notification routes are unchanged (`utils/notificationRoute.ts`). Any route that pointed at
  the feed tab (`/` or `/(tabs)`) for a post opens the post screen as today; nothing deep-links to the feed tab itself.

## Home (Section 2)

**Header (sticky):** logo left (star + wordmark; white wordmark in dark mode, dark in light mode — a themed
wordmark, not a tinted image, so the star keeps its gradient), right: Wallet button, Inbox button with a badge
(Section 3). Icons from Phosphor, 44 pt targets, labels for VoiceOver.

**Greeting:** an eyebrow date (`THURSDAY, OCT 29`) over a greeting with the first name. Time bands: morning
(5–11), afternoon (12–16), evening (17–21), late night (22–4). Each band has several phrasings (e.g. "Morning, Mark",
"Good morning, Mark", "Rise and shine, Mark", "Fresh start, Mark"; "Afternoon, Mark", "Hope the day's going well,
Mark"; "Evening, Mark", "Good evening, Mark"; "Night owl, Mark?"). The choice is fixed for a day (seeded by the
calendar date and band) and changes day to day. While on a trip, about one day in three uses the local greeting of
today's city's country (pt "Bom dia", fr "Bonjour", es "Buenos días", it "Buongiorno", de "Guten Morgen", nl "Goedemorgen",
ie "Dia duit", ja "Ohayō", … with afternoon/evening forms where they exist); unknown country → the English set.
Sentence case, no exclamation marks. No name known → the greeting without a name.

**Body, by state.** "Your trips" = trips you own plus trips you've joined (the existing own + joined lists).
1. **On a trip today** (today within its dates): the **Today card** — cover photo, `TODAY · DAY 3 OF 7`, today's city
   (from the route's nights per city, not from stops), up to 4 of today's stops with the next one not marked visited
   highlighted (by stop order; no times needed), today's booking (flight with gate/time, hotel check-in/out,
   reservation, train) when there is one, and **"Nothing planned today · Add a stop"** when the day has no stops.
   Tap the card → the trip; tap the booking → its wallet detail; tap "Add a stop" → the trip on that day.
   Two trips overlapping today → the one that started most recently is the Today card, the other goes to Coming up.
2. **Not travelling, a trip ahead:** the soonest dated trip as the big card — cover, `IN 20 DAYS` (or `TOMORROW`),
   dates, title, and its first booking if any.
3. **Coming up:** the remaining upcoming trips as rows (thumbnail, eyebrow dates, title), soonest first; trips without
   dates last, labelled `DATES NOT SET`. Past trips never appear (they're on the profile under Past).
4. **Get inspired** when there are 0 or 1 trips ahead (counting today's): popular catalog destinations as swipeable
   cards (`DestinationCard` data; no Places calls), with **See all** → Explore.
5. **No trips:** a "Plan your next trip" card (one primary action, "Plan a trip" → the Create tab), then Get inspired.

Pull to refresh. Works offline from the app's saved trips and wallet (no new persisted queries; Get inspired hides
when the catalog isn't cached). Spring motion on state changes; light and dark themes.

## Inbox (Section 3)

- The existing `app/notifications.tsx` (Activity | Messages tabs) is the Inbox.
- The header badge shows **unread messages + unseen activity** as a number (`9+` cap). Today the app only tracks
  "anything unread" (`hooks/useUnreadActivity.ts`); extend it to counts from the same data (threads' `lastMessageAt`
  vs the user's read cursor; notifications newer than the activity seen time).
- Opening it from Home lands on **Messages** when a conversation is unread, otherwise **Activity**.

## Explore (Section 4)

- **From travelers:** the 10 newest public posts (the feed's own query, moderation-filtered), each tile the photo or a
  video's cover with a play badge and "Name · Place". Tap → `/feed?start={postId}`, the full-screen feed starting at
  that post. Hidden when there are no posts. The heading row has a **Share** link → `/add-to-feed`.
- Then destinations (region/vibe chips), latest trips, people to follow — unchanged.

## Data and code

- No server changes, no new Firestore data, no rules changes. Ships in an app update; older apps keep their tabs.
- Pure, tested rules (no renderer in this project):
  - `utils/homeState.ts` — which state to show; trip ordering (current, upcoming by start, undated last); which trip is
    "today's" when two overlap; Get inspired visibility (≤ 1 ahead).
  - `utils/todayCard.ts` — today's day number and city from start day + nights; today's stops (≤ 4) and the next
    unvisited one; the "nothing planned" case; today's booking (reusing `utils/bookingDays.ts`).
  - `utils/greeting.ts` — time band, daily-stable variant, local-language greetings by country, missing name.
  - `utils/inboxBadge.ts` — count and `9+` label; which tab to open.
- Screens/components: `app/(tabs)/index.tsx` (Home), `app/feed.tsx` (moved feed), `components/home/*` (header,
  Today card, next-trip card, trip row, Get inspired strip, plan card), Explore's From travelers row, Create-tab option.

## Testing

Unit tests for the four rule files, including the owner's Europe trip shape (18 days, 7 cities, 11 empty days, no
times, shared bookings) and a one-day trip. Then a TestFlight build for the owner's phone: Home in each state (on a
trip, one ahead, none), header buttons and badge, Explore's row → feed at the right post, posting from Explore and
Create.

## Not in this project

A globe background or hero on Explore; a separate Trips or Wallet tab; changes to the feed's content rules.
