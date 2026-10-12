# Friends on a trip, on the globe — design

Approved in chat 2026-10-11/12: position from the itinerary (no GPS); followers only, Public/Followers
trips only, switch in Settings on by default.

## Goal

On the Search globe, people you follow who are on a trip today appear as their profile photo at
today's city; tapping opens their trip. It shows only what they already share with followers, never
needs location permission, and disappears when the trip ends.

## What's shown

- A 40 pt circle: profile photo (initials if none), 2 pt brand ring, first name below (always-dark
  globe styling). At today's city's coordinates. Two or more in one city are spread on a small circle
  around it (`spreadCluster`, ~18 px apart at the current zoom, deterministic by uid) — never stacked.
- Tap → `/trip/[id]` (Light haptic). The viewer can read the trip: it is Public or Followers and they follow.
- Nobody travelling → nothing changes on the globe.

## Who appears for whom

A traveller T appears for viewer V when **all** hold:
1. V follows T (`follows/{V}_{T}` exists).
2. T's trip visibility is `public` or `followers` (private never), and not `moderationHidden`.
3. Today (UTC calendar day) is within the trip: from its first day's date to its last day's date.
4. T's `users/{T}.settings.showOnGlobe` is not `false` (missing = on).
5. Neither has blocked the other (`users/{T}/blocked/{V}`, `users/{V}/blocked/{T}`).
6. Today's day has a city with coordinates.

A private account's followers are exactly its approved followers, so rule 1 covers it.
If T has several qualifying trips today, the one whose current day starts latest wins (`pickTodayTrip`).

## Today's city

The trip day whose `date` is today (UTC calendar day). Its `destinationIndex` picks
`[destination, ...additionalDestinations][i]` (null → 0); that entry's `name`, `lat`, `lng`. No
day dated today, or no coordinates → T doesn't appear. UTC, not the traveller's local time: trips
store no time zone, and at city level a few hours either side is fine.

## Delivery (server)

- `users/{V}/friendsTraveling/{T}` = `{ uid, name, avatarUrl, tripId, tripTitle, city, lat, lng, day,
  updatedAt }`. Read: owner only. Write: Cloud Functions only.
- `refreshFriendsTraveling` (every hour): trips that could be under way (`endDate >= today − 1 day`,
  `startDate <= today + 1 day`, visibility in public/followers) → for each, today's city → the
  traveller's followers (`follows` where `followeeUid == T`) minus blocks → upsert their entries;
  delete entries whose traveller no longer qualifies (`friendsTraveling` collection-group query on
  `day < today`, plus any left by a change below).
- Immediate updates, recomputing one traveller (`syncTraveler(T)`): trip written (dates, days, cities,
  visibility, hidden), a day written, `follows` created/deleted (that pair), `users/{T}.settings.showOnGlobe`
  changed, a block created (that pair).
- `deleteAccount`: delete the user's own `friendsTraveling` subcollection (goes with `users/{uid}`
  recursive delete) and every `friendsTraveling/{uid}` entry in others' lists (collection-group on `uid`,
  declared field override).
- Pure rules in `functions/src/friendsTraveling.ts` (no firebase-admin).

## App

- `hooks/useFriendsTraveling()` — one `getDocs` of `users/{me}/friendsTraveling` (staleTime 10 min,
  `refetchInterval` 10 min while open, like the heat), moderation-filtered (`filterVisible`), and
  **only entries whose `day` is today (UTC)** (`isCurrentEntry`) — so a trip that has ended never lingers
  on the globe even if the hourly cleanup is late.
- `components/search/FriendTravelMarker` — the circle; `MarkerView`s on `GlobeMapView`, above the heat
  and destination pins, below sheets. Coordinates from `spreadCluster`.
- Settings → Privacy: switch "Show me on friends' globes while I travel", on by default; footnote:
  "People who follow you see your profile photo in the city you're in that day, only during trips you
  share with followers or everyone." Writes `settings.showOnGlobe` (rules: owner may set a boolean).

## Privacy

Nothing new is collected: it's itinerary data already visible to these followers. Privacy policy adds:
"During trips you share with followers or everyone, people who follow you can see your profile photo
at that day's city on the globe. You can turn this off in Settings → Privacy." App Privacy unchanged.

## Tests (pure)

`isTripUnderwayToday` (dates, UTC bounds, visibility, hidden), `todaysCity` (destinationIndex, null,
missing coords, no day today), `pickTodayTrip`, `shouldSeeTraveler` (follow, switch, blocks),
`spreadCluster` (single point unchanged, n points distinct and deterministic), `staleEntries`,
`isCurrentEntry` (today kept; yesterday and missing day dropped).

## Out of scope

Live GPS, a list of travelling friends outside the globe, notifications ("Kell just landed in Prague").
