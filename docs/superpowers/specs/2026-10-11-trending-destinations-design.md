# Trending destinations — design

Approved in chat 2026-10-11 (option A: every new trip counts, as anonymous per-city totals).

## Goal

The globe's heat map reacts to what people are planning now, not only to a fixed popularity score and
public trips' stops refreshed once a night. No one can learn who is planning a trip, or where a
particular trip goes.

## Today

`aggregateDiscovery` runs daily at 04:00 UTC: a full pass over public trips that writes each
destination's `topPlaces`/counts and `aggregates/heatmap` = catalog baseline (`baselinePoints`,
popularity) + public trips' stop points (`buildHeatPoints`, weighted by saves and likes). The app reads
the heat once per 12 h (`useHeatmap`).

## Counting (live)

- New trigger `onTripWrittenTrend` (`trips/{tripId}`, onDocumentWritten). For before and after it takes
  the trip's catalog cities from its destination points (`destination` + `additionalDestinations`) with
  `destinationKeysFor` — **regardless of visibility** — and increments today's count for each city the
  write **added** (`trendNewSlugs(before, after)`). A new trip adds all its cities; a later added city
  counts then; removals and deletions subtract nothing ("people started planning here").
- Editorial trips (`isEditorialTrip`) never count. Trips written by the seed script are editorial.
- Storage: `trendCounts/{slug}` = `{ days: { 'YYYY-MM-DD': n } }` (UTC day), `FieldValue.increment(1)`.
  **No client access** (rules: deny all) — raw and below-threshold counts never leave the server.
  Days older than the window are pruned by the refresh job.
- The trigger reads the catalog through the existing 10-minute cache; it does no work when a write
  changes no destination point (the trip doc is written constantly).

## Heat (every 15 minutes)

- New scheduled `refreshTrending` (every 15 min): reads `trendCounts/*` (≤ catalog size), sums each
  city's last **14** days (`trendTotal`), and drops cities under **3** (`TREND_MIN`).
- Weight: `trendWeight(n) = round(12 · log2(1 + n))` for n ≥ 3, else 0 — grows with planning, but one
  booming city doesn't flatten the rest.
- Points: the weight spread over five points in the middle of the city's box (`trendPoints`, same shape
  as `baselinePoints`, its own seed so they don't sit on the baseline's).
- The daily job also writes its community stop points to `aggregates/heatCommunity` (server-only), so
  the refresh can rebuild `aggregates/heatmap` = baseline + trending + community without re-reading
  trips. It writes only when the points changed.
- Backfill: a one-off script (`scripts/backfill-trends.mjs`, `--dry-run`) counts the last 14 days of
  non-editorial trips by `createdAt`, so the globe isn't flat on day one.

## App

`useHeatmap` re-reads `aggregates/heatmap` every 10 minutes (`staleTime` 10 min, refetch on focus)
instead of every 12 h. Nothing else changes on the client; the `HeatmapLayer` already draws whatever
points it's given.

## Privacy

Clients only ever see the combined heat. Per-trip, per-day and below-threshold counts stay in a
collection no client can read. Privacy policy gains: "We count, anonymously, which destinations people
are planning, to show what's trending. No one can see who is planning a trip or where their trip goes."
`deleteAccount` needs nothing: counts hold no user identity.

## Tests (pure, `functions/src/trending.ts`)

`trendDayKey` (UTC day), `trendNewSlugs` (create, add a city, no change, removal), `trendTotal` (14-day
window, ignores older and future days), `trendWeight` (threshold 3, diminishing), `trendPoints`
(five points in the box's middle, deterministic), `pruneTrendDays`.

## Out of scope

A "Trending now" list in Explore, per-country trends, decay finer than daily.
