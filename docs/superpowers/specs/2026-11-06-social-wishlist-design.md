# Social wish list — design

Date: 2026-11-06 · Owner-approved in chat (parts 1–3) · Branch `feat/social-wishlist` · Ships in a store build (native share target)

## Goal

While scrolling TikTok, a traveler taps **Share → Supernova** on a post about a place they'd love to go. Supernova keeps
the place in a private **Wish list**, grouped by city, with the post that inspired it one tap away. When they have an
upcoming trip near that place, the trip shows a **Wish list** chip from which the place goes onto any day as a normal
stop. Built to cost a fraction of a cent per save.

## Owner decisions

- Built around **places** (what people mostly share); a "7 days in Japan" video simply saves each place it names.
- **TikTok only** in version one. Instagram later (its official access needs Meta app review and returns no images).
- **Private**: only the owner ever sees their wish list.
- **Free with a monthly limit, unlimited on Pro**: 20 saves a month free (like Nova's allowance).
- **Option 1**: the share opens Supernova to a "Save to wish list" sheet the traveler confirms (no silent saving).
  A **Paste a link** fallback lives in the Wish list.
- The video is watched in TikTok ("Watch on TikTok"); no in-app player in version one.

## 1. Saving a post

**Share target.** A share-intent library (`expo-share-intent` or equivalent, version matching Expo SDK 54 — chosen in
the plan) registers an iOS share extension that opens the app and an Android `SEND text/plain` intent filter. The
app receives the shared text/URL; a TikTok link (`tiktok.com/@…/video/{id}`, `vm.tiktok.com/…`, `vt.tiktok.com/…`,
`www.tiktok.com/t/…`) opens the **Save to wish list** sheet. Anything else: "Supernova can save TikTok posts for now".
A share that arrives signed out, before auth settles or offline waits in AsyncStorage (`pendingShare`) and opens the
sheet when it can — the `pendingInvite` pattern.

**Server: callable `readSocialPost({ url, requestId })`** (pure rules in `functions/src/socialPost.ts`, wiring in
`socialPostFunctions.ts`):

1. Auth; AI consent (purpose `agent`, as Nova); validate the URL host (TikTok only); follow short links server-side
   (HEAD/GET with redirects, 5 s timeout, final host must be TikTok) to the canonical video URL and its **video id**.
2. **Limit**: `usage_quotas/{uid}/wishlist/{YYYY-MM}` — a set of video ids. A video already in this month's set is free;
   a new one counts. Free tier: 20 per month → `resource-exhausted` (the app opens the limit paywall). Pro/Business:
   unlimited. Everyone: ≤ 30 new videos an hour.
3. **Cache** `socialPosts/{videoId}` (server-only, no user data): if fresh (< 30 days), reuse its places — no AI call.
4. Else **TikTok oEmbed** (`https://www.tiktok.com/oembed?url=…`, free, no key): caption (`title`), creator
   (`author_name`, `author_unique_id`), cover (`thumbnail_url`, short-lived — returned, never stored). Private or
   deleted video → `not-found`.
5. **Gemini** (`gemini-2.5-flash`, thinking 0, JSON schema) reads the **caption and creator handle only** and returns
   `{ city, country, places: [{ name, kind, city }] }`, `kind ∈ restaurant | bar | cafe | sight | hotel | activity |
   shop | other`, at most 10 places, only places the text actually names (never guessed). Cleaned by pure
   `cleanPlaces` (trim, dedupe, cap 10, drop names that are just the city or country).
6. **Mapbox** places each name in its city (Search Box / temporary geocoding, the app's grounding rules:
   `pickBestFeature`, name match, ≤ 25 km of the city), plus the city centre; unplaced names are kept without a position.
7. Saves the cache doc; returns `{ videoId, postUrl, caption (≤ 300 chars), author, authorHandle, coverUrl, city,
   country, cityLat, cityLng, places: [{ id, name, kind, city, countryCode, lat|null, lng|null }] }`.

`requestId` makes a retry free (a dropped connection never charges twice). Cost per new video ≈ $0.0003 (Gemini);
oEmbed and Mapbox free at our volume; Google Places never used.

**The sheet** (`components/wishlist/SaveFromSocialSheet`): the post's cover, creator and caption; the places, each ticked,
with its city and type icon; a place within 50 km of an upcoming or current trip's city reads **"Fits your Tokyo trip"**.
Untick, or **Add a place by name** (the existing place search, boxed to the post's city when known). **Save** writes the
wish-list doc; then a short "Saved to your wish list" and the app returns (iOS: the user taps back to TikTok; Android:
`finish` back to the sharing app when opened from a share). "No places named in this post" when the AI found none —
the post is still saveable with its city, and Add a place by name is right there.

**Data — `users/{uid}/wishlist/{videoId}`** (owner read/write/delete only; rules whitelist the keys and sizes):

```
{ platform: 'tiktok', videoId, postUrl, author, authorHandle, caption (≤ 300), city|null, country|null,
  cityLat|null, cityLng|null, savedAt (request.time),
  places: [{ id, name (≤ 120), kind, city|null, countryCode|null, lat|null, lng|null,
             addedTo?: { tripId, dayId, activityId } }]   // ≤ 10
}
```

No images are stored (TikTok's cover URLs expire, and copies aren't allowed); a saved post's cover is fetched fresh via
oEmbed when opened (callable `socialPostCover({ videoId })` — free, cached 1 h server-side — or the app calls oEmbed
directly, chosen in the plan).

## 2. Where saved places show up

**Profile → Trips → "Wish list"** filter, after Past (own profile only — the public profile never has it). Grouped by
city (`TOKYO · 6 PLACES`), newest city first; each place: name, type icon, "from @handle"; posts without a named place
sit under their city or **Somewhere** with **Name this place**. Empty state: icon, "Save places from TikTok", how-to
(Share → Supernova), primary **Paste a link** (a field that opens the same sheet).

**Trip chip.** An upcoming or current trip, for its owner and members (`isTripMember`), shows **Wish list · N** among the
chips when N saved places lie within 50 km of any of its cities (`wishMatches(trip, saves)` — pure, by distance, so
Shibuya matches Tokyo). The sheet lists them with **Add to a day** → `DayPickerSheet` → a normal stop via `useCreateTrip`
(`type` from kind: restaurant/bar/cafe → restaurant, hotel → hotel, else activity; `title` = name, `placeName`,
`lat`/`lng`, `searchQuery` = "name, city" so the background grounding pass can improve it, `titleSource: 'user'`), then
`addedTo` is written on the wish-list place and it shows a check. Only the viewer's own saves are ever listed.

**Saved place screen** (`app/wishlist/[id].tsx`): the post's cover (fresh), caption and creator; the place on a small
static map; **Watch on TikTok** (opens the TikTok app via the post URL, else the browser) and **Add to a trip** (pick
an upcoming trip near it, then a day); delete the save or remove one place.

## 3. Cost, limits, edge cases

- Cost: ~$0.0003 per *new* video; repeat shares of one video anywhere are free (cache); 1,000 saves ≈ $0.30.
- Over the free limit: `resource-exhausted` before any AI call → the hosted limit paywall ("Save unlimited places with Pro").
- No AI consent: the shared consent sheet first (`useAiConsentGate`, purpose `agent`).
- Not TikTok / unreadable link / private or deleted video / offline: plain messages; the link waits when offline.
- More than 10 places: the first 10 the caption names.
- Account deletion: `users/{uid}` is deleted recursively (wish list included) and `usage_quotas/{uid}` already is;
  `socialPosts` holds no user data.
- Privacy policy: TikTok receives the shared link to look up the public post; Google's Gemini reads the post's public
  caption to find place names; nothing about the traveler is sent with them.
- Notification types: none.

## Testing (pure Jest)

`tiktokVideoUrl` (hosts, short links accepted only after resolution, ids), `cleanPlaces`, the AI answer parser, `quotaDecision`
(month set, free/Pro, hourly cap, repeat video free), `wishMatches` (50 km, multi-city, ended trips excluded),
`kindToActivityType`, wish-list doc builder + rules key whitelist, `wishlistByCity` grouping. Device: Share → Supernova
from the TikTok app on iPhone and Android (needs the store build).

## Out of scope (version one)

Instagram (and other platforms); playing the video in the app; public wish lists; reading places from the video's audio
or on-screen text; push reminders ("You saved 3 places in Lisbon").
