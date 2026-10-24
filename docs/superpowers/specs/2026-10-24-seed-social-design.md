# Seeding the social side — design

Date: 2026-10-24 · Status: approved in conversation · Roadmap item 3 (`competitive-roadmap` memory)

## Why

A new user's feed is 8 posts from 4 people (newest 2026-10-21) — scrolled through in seconds. 16 of 26 accounts follow nobody. Explore is full (69 editorial trips), the feed is not.

## Decisions (owner, 2026-10-24)

- **Full feed + people to follow.** Use what exists — no new content, no AI, no paid APIs.
- Suggestions in **onboarding and in the feed**.
- The feed stays unpersonalised (everyone sees all public posts); no automatic follows.

## 1. The feed is never empty

- Posts first, newest first, paged as today (`useFeed('forYou')`).
- **Trip cards** — a full-screen page like a post: cover photo, eyebrow (`PORTUGAL · 5 DAYS`), title, author row (avatar + name; editorial trips show the Supernova star and a **"Supernova pick"** tag), one action **"Open trip"** → `/trip/{id}`.
- Placement (pure `mixFeed`): one trip card after every **3** posts; when posts run out, trip cards continue until the pool is used. A **"Travelers to follow"** page sits at index **2** (after 2 posts or cards) while the viewer follows fewer than **3** people.
- **Trip pool** (`useFeedTrips`, one query, `staleTime` 10 min): `trips` where `visibility == 'public'`, `orderBy('createdAt','desc')`, `limit(100)` (existing index). Split client-side: travelers' trips (non-editorial) newest first, then editorial picks by `savesCount` desc. Only trips with a cover photo; moderation-filtered (`filterVisible`: blocked authors, reported, `moderationHidden`); never your own trips; a trip already shown as a post's trip isn't repeated.
- Feed analytics/ordering beyond this: out of scope.

## 2. Travelers to follow

- **Who** (pure `rankSuggestions`): candidates = authors of the 30 newest public posts + the 30 most-followed users. Eligible = `pickCommunityFaces` rules (photo required; never private, editorial, `moderationHidden`, the App Review demo account, yourself) + not blocked by you + not already followed. (Someone who blocked *you* can't be excluded — the app can't read other people's block lists; the follow is refused by the rules and the row says "Couldn't follow. Try again later." Same as feed posts today.) Ranked: posted most recently first, then followers. Up to **6**.
- **Onboarding:** a 7th, last step **"Travelers to follow"** — eyebrow `YOUR PEOPLE`, title, one line ("Follow a few travelers to fill your feed with their trips."), up to 6 rows (avatar, name, @username, a short line: `3 TRIPS · 12 FOLLOWERS`), each with the existing follow button (`followButtonState`: Follow / Following / Request / Requested — private accounts can't appear, but the button stays correct). Primary **"Continue"**; nothing forced. With no eligible travelers the step is skipped.
- **Feed page:** the same list as a full-screen page (dark, like the feed) titled "Travelers to follow", shown while following < 3; disappears on the next feed load once 3 are followed.
- `useTravelerSuggestions()` — posts query (30) + users by `followersCount` (30) + `documentId in` batches for post authors not already loaded; `staleTime` 10 min; following set from `follows where follower == me` (≤ 300, existing `useConnections` shape).

## Copy

Sentence case, no exclamation marks. "Travelers to follow", "Follow a few travelers to fill your feed with their trips.", "Supernova pick", "Open trip", "Continue".

## Testing

- `mixFeed`: every 3 posts a trip; trips continue after posts; suggestions at index 2 only when following < 3 and suggestions exist; no trips → posts unchanged; dedupe of trips already in posts.
- `feedTripPool`: split + order, cover required, own trips excluded.
- `rankSuggestions`: eligibility (each exclusion), already-followed excluded, recency then followers, cap 6.
- Device (next build): fresh account → onboarding step → feed shows trip cards and the suggestions page.

## Out of scope

A personalised/"Following" feed, Supernova posting new content, notifications nudging people to post.
