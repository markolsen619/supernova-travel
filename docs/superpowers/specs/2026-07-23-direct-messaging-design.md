# Direct Messaging + Unified Activity Center

**Date:** 2026-07-23
**Status:** Approved

## Context

The app currently has one-directional following (`follows/{followerUid}_{followeeUid}`) and a
notifications system (`users/{uid}/notifications`) that only surfaces trip invites. There is no
way for users to message each other, and no way to see who liked or commented on your posts — the
heart icon in the top-right of the feed already routes to `app/notifications.tsx`, but that screen
only renders `trip_invite` / `trip_invite_accepted` rows today.

This spec adds:
1. A "confirmed friend" concept (mutual follow) gating who can message whom.
2. Direct messaging — 1:1 and group threads, text-only.
3. Extending the existing Activity screen (behind the heart icon) into a two-tab surface:
   **Activity** (trip invites + new post-like/post-comment notifications) and **Messages** (the DM
   inbox).

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Friend definition | Mutual follow (`follows` both directions) | "Confirmed" implies both sides opted in; reuses the existing follow graph, no new relationship collection |
| Thread creation | Server-side callable (`createDmThread`), not a direct client write | Firestore rules can't loop over a variable-length `participants` array to check friendship per member — this only works as a Cloud Function |
| 1:1 thread ID | Deterministic sorted pair (`${uidA}_${uidB}`), get-or-create | Tapping "Message" on the same friend always resolves to the same thread — no duplicates |
| Group thread ID | Auto-generated | Two people may legitimately want more than one distinct group thread together over time |
| Group membership | Fixed at creation, no add/remove | Keeps v1 rules/UI simple; add/remove-members is a natural fast-follow |
| Group naming | Auto-generated (comma-joined participant names) | No naming UI/field needed for v1 |
| Real-time messages | `onSnapshot` inside an open thread | Matches the app's one existing real-time exception (post comments) — a chat that isn't live defeats the point |
| Messages inbox list | Plain `getDocs` via TanStack Query | Not actively "live" the way an open chat is; matches the rest of the app's query architecture |
| DM notification delivery | Push only, no `users/{uid}/notifications` doc | The Messages tab itself (via `lastMessageAt` vs. the recipient's read cursor) *is* the notification; a duplicate doc would be redundant state to keep in sync |
| Post like/comment notifications | New `post_like` / `post_comment` `AppNotification` variants, via the existing `notifyUser()` helper | Mirrors the `tripInvites.ts` pattern exactly — same in-app doc + push |
| Heart badge | Single dot (not a numeric count) | Matches the app's minimal/editorial style; a number badge is called out as an anti-pattern in the design skill |
| Read tracking | Per-participant `reads/{uid}` subdoc (threads); `read: boolean` field (notifications); `users/{uid}.lastMessagesSeenAt` (badge) | Each mechanism is owner-scoped and avoids shared-field write conflicts between participants |
| Message content | Text only, ≤4000 chars | Keeps v1 scope tight; photo/video attachments are a clear fast-follow, not a redesign |

## Data Model

### Firestore: new collections

```
dmThreads/{threadId}
  type: 'direct' | 'group'
  participants: string[]        // 2 for direct, 3-12 for group
  createdByUid: string
  createdAt: Timestamp
  lastMessageText: string | null
  lastMessageAt: Timestamp | null
  lastMessageSenderUid: string | null

  messages/{messageId}
    senderUid: string
    text: string                // 1-4000 chars
    createdAt: Timestamp

  reads/{uid}                   // one doc per participant
    lastReadAt: Timestamp
```

`threadId` for `type: 'direct'` is `${sorted(uidA, uidB)}` joined by `_`. For `type: 'group'` it's
a normal Firestore auto-ID.

### `types/index.ts` additions

```ts
export type DmThreadType = 'direct' | 'group';

export interface DmThread {
  id: string;
  type: DmThreadType;
  participants: string[];
  createdByUid: string;
  createdAt: Timestamp;
  lastMessageText: string | null;
  lastMessageAt: Timestamp | null;
  lastMessageSenderUid: string | null;
}

export interface DmMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Timestamp;
}

export interface PostLikeNotification {
  id: string;
  type: 'post_like';
  postId: string;
  postCoverUrl: string | null;
  likerUid: string;
  likerName: string;
  likerAvatarUrl: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export interface PostCommentNotification {
  id: string;
  type: 'post_comment';
  postId: string;
  postCoverUrl: string | null;
  commentText: string;
  commenterUid: string;
  commenterName: string;
  commenterAvatarUrl: string | null;
  read: boolean;
  createdAt: Timestamp;
}

export type AppNotification =
  | TripInviteNotification
  | TripInviteAcceptedNotification
  | PostLikeNotification
  | PostCommentNotification;
```

Existing `TripInviteNotification` / `TripInviteAcceptedNotification` need a `read: boolean` field
added if not already present (`notify.ts` already writes `read: false` on every doc; the type
should reflect it now that the client needs to read/toggle it).

### `users/{uid}` addition

New field: `lastMessagesSeenAt: Timestamp | null`. Owner-writable (already excluded from the
existing `tier` write-lockout, so no rule change needed beyond what exists).

## Firestore Rules

```
match /dmThreads/{threadId} {
  allow read: if isAuthed() && request.auth.uid in resource.data.participants;
  // Creation validates a variable-length participants array against the
  // friend graph — not expressible in rules, so it's Cloud-Functions-only.
  allow create, update: if false;

  match /messages/{messageId} {
    function thread() {
      return get(/databases/$(database)/documents/dmThreads/$(threadId));
    }
    allow read: if isAuthed() && request.auth.uid in thread().data.participants;
    allow create: if isAuthed()
      && request.auth.uid in thread().data.participants
      && request.resource.data.senderUid == request.auth.uid
      && request.resource.data.text is string
      && request.resource.data.text.size() > 0
      && request.resource.data.text.size() <= 4000;
    allow update, delete: if false;
  }

  match /reads/{uid} {
    allow read, write: if isOwner(uid);
  }
}
```

`notifications` rule changes from blanket `allow write: if false` to:

```
allow create, delete: if false;
allow update: if isOwner(uid)
  && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
```

## Cloud Functions

### `functions/src/dmThreads.ts` (new)

`createDmThread` — HTTPS callable, mirrors `inviteToTrip`'s shape:

```ts
interface CreateDmThreadRequest {
  participantUids: string[]; // the OTHER participants, caller is added automatically
}
```

Validates: 1-11 other participants (2-12 total including caller), no duplicates, every other uid
is a mutual friend of the caller (`isFriend` re-derived server-side, same reasoning as
`canManageTrip` in `tripInvites.ts` — Admin SDK reads bypass rules entirely). For exactly 2 total
participants: compute the deterministic sorted-pair ID and get-or-create (idempotent — returns the
existing thread if one's already there). For 3+: create a new auto-ID doc with
`type: 'group'`. Returns `{ threadId, isNew: boolean }`.

### `functions/src/dmMessages.ts` (new)

`onMessageCreated` — Firestore trigger on `dmThreads/{threadId}/messages/{messageId}`. Updates the
parent thread's `lastMessageText`/`lastMessageAt`/`lastMessageSenderUid`, then sends an Expo push
to every other participant (reusing `sendPushNotification`, exported from `notify.ts` for this —
no `notifyUser()` call, since this doesn't write an in-app notification doc per the decision
above).

### `functions/src/postEvents.ts` (new)

Two triggers, both following `tripInvites.ts`'s use of `notifyUser()`:
- `onLikeCreated` — `posts/{postId}/likes/{likeId}`. Skips if `likerUid === post.authorUid`.
  Notifies the post's author with a `post_like` notification.
- `onCommentCreated` — `posts/{postId}/comments/{commentId}`. Skips if
  `commenterUid === post.authorUid`. Notifies the post's author with a `post_comment`
  notification, including a truncated preview of the comment text.

### `functions/src/notify.ts` (modified)

Export `sendPushNotification` (currently private) so `dmMessages.ts` can call it directly.

### `functions/src/index.ts` (modified)

Add exports for `createDmThread`, `onMessageCreated`, `onLikeCreated`, `onCommentCreated`.

## Screens & Hooks

### `hooks/useIsFriend.ts` (new)

`useIsFriend(otherUid)` — true if mutual follow. Can compose two `useIsFollowing`-style checks or
a single hook doing both `getDoc` calls in parallel.

### `hooks/useMutualFriends.ts` (new)

`useMutualFriends(uid)` — like `useFollowConnections` but intersection instead of union: only uids
where both `follows/{me}_{uid}` and `follows/{uid}_{me}` exist. Powers the new-message friend
picker.

### `hooks/useDmThreads.ts`, `hooks/useDmMessages.ts`, `hooks/useCreateDmThread.ts` (new)

- `useDmThreads()` — TanStack Query, `dmThreads` where `participants array-contains me`, ordered by
  `lastMessageAt desc`. Powers the Messages tab.
- `useDmMessages(threadId)` — `onSnapshot` subscription (the real-time exception), ordered by
  `createdAt asc`. Powers the open chat screen.
- `useCreateDmThread()` — mutation wrapping the `createDmThread` callable.
- Sending a message is a direct client `addDoc` into `dmThreads/{threadId}/messages` (no callable
  needed — the security rule alone is sufficient for a simple append-only write).

### `app/user/[uid].tsx` (modified)

New "Message" button, rendered only when `useIsFriend(uid)` is true (no disabled/greyed-out state
for non-friends — the button doesn't render at all, matching `SavedGrid`'s existing
show-nothing-if-not-applicable pattern). On tap: `useCreateDmThread({ participantUids: [uid] })`,
then navigate to `app/messages/[threadId]` with the returned ID.

### `app/messages/[threadId].tsx` (new — full-screen push, same pattern as `app/user/[uid].tsx`)

Header: for `type: 'direct'`, the other participant's avatar + name; for `type: 'group'`, a
stacked-avatar cluster + auto-generated comma-joined name. Message list via `useDmMessages`,
newest at bottom, sender bubbles right-aligned (near-black / `text.inverse`, the app's primary
action color), other-participant bubbles left-aligned (`Surface` fill + hairline). Group threads
additionally show the sender's name above each incoming bubble (ambiguous otherwise with 2+ other
participants); direct threads don't. Composer: text input + send button, `Medium` haptic on send.
Writes `reads/{me}.lastReadAt = serverTimestamp()` on focus.

### `app/notifications.tsx` (modified — same route, no new nav entry)

Adds a segmented control at the top: **Activity** | **Messages**.

- **Activity** tab: existing `trip_invite`/`trip_invite_accepted` rows, plus new `post_like` (small
  cover thumbnail + "{name} liked your post", tap → `post/[id]`) and `post_comment` ("{name}
  commented: '{text}'", tap → `post/[id]`) rows. Viewing this tab batch-writes `read: true` on all
  currently-unread notification docs.
- **Messages** tab: `useDmThreads()` rendered as an inbox — other participant(s)' avatar/name (via
  `useAuthorProfiles`), last-message preview, relative time, unread dot (thread's `lastMessageAt` >
  my `reads/{me}.lastReadAt`, and I'm not the last sender). A "+" button in this tab's header opens
  a multi-select friend picker (structurally reused from `InviteFriendsSheet`, audience swapped to
  `useMutualFriends`) — picking people calls `createDmThread` and navigates to the result. Gaining
  focus on this tab updates `users/{me}.lastMessagesSeenAt`.

### `app/(tabs)/index.tsx` (modified)

The header's `Heart` button gains a badge dot, driven by a new `useHasUnreadActivity()` hook:

```
true if:
  any `notifications` doc has read == false (limit(1) query), OR
  the most recent dmThread for me (participants array-contains me, orderBy lastMessageAt desc,
  limit(1)) has lastMessageSenderUid != me AND lastMessageAt > users/{me}.lastMessagesSeenAt
```

## Firestore Indexes

One new composite index needed in `firestore.indexes.json`:
- `dmThreads`: `participants` (array-contains) + `lastMessageAt` (desc)

The `notifications.read == false` badge query is a single-field equality filter with no `orderBy`
on a different field, so Firestore's automatic single-field indexing already covers it — no manual
entry needed.

## Out of Scope (v1)

Typing indicators, read receipts (double-check marks), message reactions, photo/video messages,
adding/removing members from an existing group, editing or unsending messages, message search,
blocking/reporting within a conversation, custom group names/photos, push notification deep-linking
directly into a specific thread from a cold app start (nice-to-have if trivial during
implementation, not a hard requirement).
