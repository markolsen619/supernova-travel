# Private accounts and follow requests

Status: decisions taken in conversation 2026-10-01 · Target: 1.0.2

## Intent

A traveler can make their account private. People who don't follow them still
see who they are — photo, name, @username, bio and counts — with "This account
is private" and a **Request to follow** button, and nothing else. The owner
accepts or declines each request. Existing followers keep following.

Decisions taken with the user:

- A private account's **Public trips become followers-only while it's
  private**, and public again if it goes public.
- Going back to public **approves every pending request**.
- **Two-step rollout for posts.** 1.0.1 (live) and 1.0.2 (TestFlight) ask
  the feed for "the newest posts" with no visibility filter. Firestore rejects
  any query the rules can't prove safe, so tightening the posts rule now
  would break those versions' feeds outright. Step 1 (this release):
  everything below, with private posts hidden by the new app version and
  marked `followers` in the data. Step 2 (a later release, once most users
  have updated): the posts read rule refuses `followers` posts to
  non-followers.

## Data

| Where | What |
|---|---|
| `users/{uid}.settings.privacy` | `'public' \| 'private'` — the field already exists (`buildUserProfile` writes `'public'`) |
| `followRequests/{requesterUid}_{targetUid}` | `{ requesterUid, targetUid, requesterName, requesterAvatarUrl, createdAt }` |
| `trips/{id}` | While private: a `public` trip becomes `visibility: 'followers'` with `publicWhenAccountPublic: true`; restored when public |
| `posts/{id}.visibility` | **New**: `'public' \| 'followers'`. Every existing post backfilled `'public'`. Same flip and restore as trips (`publicWhenAccountPublic`) |

Trips need no query changes: `followers` visibility is already enforced by
rules and honoured by Explore, destination pages, the heat map, Algolia and
profiles.

## Server (Cloud Functions)

- `onUserPrivacyChanged` (`users/{uid}` written, `settings.privacy` changed)
  - to private: flip the user's public trips and posts as above
  - to public: restore them; approve every pending request to them (create
    the follow, keep both counts right, notify each requester), delete the
    requests
- `onPostCreatedVisibility`: a post written without `visibility` (any app up to
  1.0.2) gets `'public'`, or `'followers'` if its author is private
- `onFollowRequestCreated` → `follow_request` notification to the target
- `respondToFollowRequest({ requesterUid, accept })`, an HTTPS callable called
  by the target
  - accept: creates `follows/{requester}_{target}` and bumps both counts in one
    transaction, deletes the request, and notifies the requester with
    `follow_accepted`
  - decline: deletes the request (no notification)
- `onBlockCreated` also deletes follow requests in both directions
- `deleteAccount` also deletes follow requests sent or received

Pure, tested modules: `privacyTransition` (which trips/posts change and to
what), `profileAccess` (full or locked view), `followButtonState` (`follow` /
`request` / `requested` / `following` / `self`).

## Rules

- `followRequests`
  - create: by the requester, only to a private account, never to yourself,
    and not if either side has blocked the other
  - read: by either party
  - delete: by either party (cancel or decline)
  - update: never
- `follows` create: refused when the followee is private (must go through a
  request; the callable writes accepted follows with the Admin SDK)
- `trips` create/update: refused when the author is private and the new
  visibility is `public`
- `posts`: unchanged this release (step 2 above), apart from refusing a
  `visibility` value other than `public`/`followers` when one is given
- Notification types `follow_request` and `follow_accepted` carry
  `profileUid`, which joins the push whitelist (`pushData.ts`) and the client
  route table (`/user/{uid}`)

## App

- Settings → Privacy: **Private account** switch with one line explaining it
  (followers keep following; new followers need approval; public trips and
  posts become followers-only while it's on)
- Public profile (`app/user/[uid].tsx`), when `profileAccess` says locked:
  header (photo, name, @username, bio, counts), then a lock card ("This
  account is private" / "Follow {name} to see their trips and posts.") with
  the request button. The counts aren't tappable
- Follow button everywhere (profile, follow lists, Explore suggestions):
  Follow → Request to follow → Requested (tap to cancel) for private accounts
- Notifications
  - `follow_request` row: avatar, "{name} wants to follow you", **Accept** and
    **Decline** (same pattern as trip invites)
  - `follow_accepted` row: "{name} accepted your request", opens their profile
- Followers/Following lists of a private account you don't follow: lock state
  instead of the list
- Feed: asks only for `visibility == 'public'` posts (new composite index
  `posts(visibility, createdAt desc)`, declared and deployed with the change)
- Post grid on a profile: yours = all; a private account you follow = public
  and followers queries merged; anyone else = public only (rules aren't
  filters)
- Trip visibility picker: while private, **Public** is disabled with "Your
  account is private — trips are visible to followers"

## Out of scope

Step 2 posts rule (tracked in CLAUDE.md); a personalised following feed;
hiding a private account from user search (it stays findable, as on Instagram);
making follow lists private at the rules level (hidden in the app only).
