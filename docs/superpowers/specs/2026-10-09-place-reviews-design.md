# Place photos & reviews — travelers review the places on their trips

Status: direction approved in conversation 2026-10-09 · anyone signed in can
review; a "Visited on a trip" badge marks people who had the place on a trip.

## Intent

Make the place sheet social: travelers add photos and short reviews of the
places on their trips, and everyone sees them next to Google's details. Over
time this gives each place a Supernova rating and photo history — the thing a
business would care about.

## Where it shows

- **From an itinerary stop** (place sheet opened from a trip): "Plan a trip
  here" is gone (you're already planning one). Under the booking action, a
  secondary row: **Add photos** · **Write a review** (or **Edit your review**).
- **From the globe / Search / destination pages:** "Plan a trip here" stays;
  the same two buttons sit below it as text links.
- **A new section on every place sheet — "FROM SUPERNOVA TRAVELERS":** average
  stars and count ("4.6 · 23 reviews"), a strip of the newest photos, the three
  best reviews (Visited first, then newest), and **See all** → a full list.
  Empty: icon + "Be the first to review {place}" + Write a review.
- Only places with a Google place id can be reviewed (they are what everyone
  shares). A stop placed by Mapbox gets one when its sheet upgrades on open; if
  it still has none, the section and buttons don't show.

## A review

One per person per place (writing again edits it): **stars 1–5** (optional if
there are photos), **text** up to 1,000 characters (optional), **up to 6
photos**. At least one of stars, text or photos. "Add photos" opens the same
composer scrolled to photos.

**Visited on a trip** is set by the server, never the client: true when one of
the author's trips (authored or joined) has a stop with that place id.

## Data

| Path | Contents | Access |
|---|---|---|
| `placeReviews/{placeId}_{uid}` | `placeId, placeName, authorUid, authorName, authorAvatarUrl, rating (1–5 or null), text, photoUrls[≤6], visited (server), moderationHidden (server), createdAt, updatedAt` | read: signed in · create/update: the author, id must be `{placeId}_{their uid}`, field checks (rating, text ≤1000, ≤6 photos, no `visited` / `moderationHidden`) · delete: the author |
| `placeStats/{placeId}` | `reviewCount, ratingCount, ratingSum, photoCount, latestPhotos[≤12] {url, reviewId}` | read: signed in · write: server only |
| Storage `place_photos/{uid}/{placeId}/{n}.jpg` | the photos | public read (like posts) · owner write, images ≤10 MB |

**Functions:** `onPlaceReviewWritten` — sets `visited` (collection-group query on
`activities.placeId`, a declared field override, then the trip's membership) and
recomputes `placeStats` for the place (a review write is rare; recompute from
that place's reviews, skipping `moderationHidden`).

## Moderation (App Store 1.2)

- `containsObjectionableText` runs before a review is saved.
- Every review has ⋯ → Report / Block (`useContentActions`, new target type
  `review`); `onReportCreated` hides it at 3 distinct reports
  (`moderationHidden`), which also drops it from `placeStats`.
- Lists filter blocked authors and your own reports (`filterVisible`).
- The author can delete their review (and its photos).
- **deleteAccount** deletes the user's `placeReviews` and `place_photos/{uid}/`
  (stats recompute through the trigger).

## Older apps

Nothing they read changes. The new report target type only comes from 1.0.4+;
the server accepts it.

## Testing (pure, Jest)

Review validation (`reviewProblem`: at least one of stars/text/photos, 1–5,
lengths, counts), `reviewId`, stats from reviews (`placeStatsFrom`: averages,
hidden excluded, newest photos first, cap 12), ordering for the sheet
(`topReviews`: visited first, then newest), rating summary copy.

## Out of scope

Business accounts / claiming a place, replies to reviews, likes on reviews,
notifications, review feeds on profiles.
