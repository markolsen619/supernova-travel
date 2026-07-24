# Direct Messaging + Unified Activity Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add mutual-friend-gated direct messaging (1:1 and fixed-membership group threads) and extend the existing Activity screen (behind the feed's heart icon) into a two-tab Activity/Messages surface with post-like/post-comment notifications and an unread badge.

**Architecture:** Firestore `dmThreads` collection (server-created only, via a `createDmThread` callable — friendship validation against a variable-length participant array can't be expressed in security rules) with a `messages` subcollection (client-writable, real-time via `onSnapshot`) and a `reads` subcollection (per-participant read cursors). Two new Cloud Function triggers (`onLikeCreated`, `onCommentCreated`) extend the existing `notifyUser()` notification pipeline; a third (`onMessageCreated`) fans out DM pushes without writing a notification doc, since the Messages tab itself is the notification surface.

**Tech Stack:** Firebase (Firestore, Cloud Functions v2, Cloud Messaging via Expo push), TanStack Query, Zustand, Expo Router, `phosphor-react-native`, Jest (root app only — `functions/` has no test harness, see Global Constraints).

**Spec:** `docs/superpowers/specs/2026-07-23-direct-messaging-design.md`

## Global Constraints

- Mutual follow (`follows/{a}_{b}` AND `follows/{b}_{a}` both exist) is the only definition of "friend" — no new relationship collection.
- Text-only messages, ≤4000 characters. No photo/video attachments in this pass.
- Group DMs: 2–12 total participants, membership fixed at creation (no add/remove), name is always auto-generated (comma-joined participant names) — no custom title field anywhere.
- No `onSnapshot` in TanStack Query hooks anywhere in this app — the one existing exception is post comments (`app/post/[id].tsx`); DM messages become the second and last exception for this feature. Every other new query in this plan uses `getDocs`/`getDoc`.
- All new/modified components read colors via `useTheme()` — never import `DarkColors`/`LightColors` directly (none of these screens are on the immersive-dark exception list).
- `StyleSheet.create` stays static (module-level) — theme-dependent colors go inline, matching every existing screen touched by this plan.
- Icon + color pairs come from `constants/icons.ts` where a semantic map exists; otherwise a bare `phosphor-react-native` import is fine (matches `app/notifications.tsx`'s existing `Check`/`X`/`Bell` usage).
- Haptics: `Light` on navigation/tab-switch, `Medium` on send/create actions — matches the app's existing convention throughout this plan.
- **Testing reality check:** this repo has exactly one test file (`__tests__/constants/icons.test.ts`, pure static data) and zero test infrastructure for Firebase-touching code — no `firebase-rules-unit-testing`, no emulator suite, no Cloud Functions test harness (`functions/package.json` has no `test` script at all). Introducing that infrastructure is out of scope for this feature. This plan follows the existing pattern: genuinely pure logic (extracted into `utils/dm.ts`) gets real Jest unit tests; Firestore rules are verified via the `firebase_validate_security_rules` MCP tool (already used successfully this session) plus a live-rules diff after deploy; Cloud Functions are verified via `npm run build` (tsc) plus manual exercise through the running app once their calling UI exists; hooks and screens are verified by running the app per this project's standing UI-verification rule.
- Deployment (Firestore rules and Cloud Functions) is **not** bundled into per-task commits — it's the final task, and per this project's operating rules, deploying to the live Firebase project requires explicit user confirmation before it runs. Don't deploy earlier tasks' rules/functions changes individually; batch it at the end.

---

### Task 1: Types

**Files:**
- Modify: `types/index.ts`

**Interfaces:**
- Produces: `DmThreadType`, `DmThread`, `DmMessage`, `PostLikeNotification`, `PostCommentNotification`, updated `AppNotification` union — every later task in this plan imports these.

- [ ] **Step 1: Add the DM and notification types**

Add after the existing `AppNotification` union (currently `types/index.ts:153`, right before the `// ── Budget & expenses ──` section header):

```ts
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

// ── Direct messaging ─────────────────────────────────────────────────────

export type DmThreadType = 'direct' | 'group';

/** `dmThreads/{threadId}` — created only via the `createDmThread` Cloud
 * Function (Admin SDK); see firestore.rules `dmThreads` create/update: if
 * false. `threadId` is a deterministic sorted pair for `type: 'direct'`
 * (get-or-create, so "Message" always resolves to the same thread), or an
 * auto-generated ID for `type: 'group'`. */
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

/** `dmThreads/{threadId}/messages/{messageId}` — client-writable directly
 * (no callable needed to send), append-only. */
export interface DmMessage {
  id: string;
  senderUid: string;
  text: string;
  createdAt: Timestamp;
}
```

Replace the now-superseded existing block at `types/index.ts:129-153`
(`TripInviteNotification` through `export type AppNotification = ...`) — keep
`TripInviteNotification` and `TripInviteAcceptedNotification` exactly as they
are (both already have `read: boolean`, no change needed there), only the
final `AppNotification` line moves down into the new block above and gets
removed from its old location.

- [ ] **Step 2: Add `lastMessagesSeenAt` to `UserProfile`**

In the `UserProfile` interface (`types/index.ts:6-25`), add one field after `createdAt`:

```ts
export interface UserProfile {
  uid: string;
  fullName: string;
  username: string;
  avatarUrl: string | null;
  bio: string;
  location: string;
  followersCount: number;
  followingCount: number;
  tripsCount: number;
  tier: Tier;
  createdAt: string;
  /** Set (client-writable, like every UserProfile field except `tier`) when
   * the Messages tab in app/notifications.tsx gains focus — the coarse
   * signal behind the heart icon's badge dot for new DMs. Per-thread read
   * state lives separately in dmThreads/{id}/reads/{uid}. */
  lastMessagesSeenAt: Timestamp | null;
}
```

- [ ] **Step 3: Verify the app still typechecks**

Run: `npx tsc --noEmit`
Expected: no new errors. (There will likely be pre-existing errors unrelated
to this change in a project this size — confirm none of them mention
`AppNotification`, `DmThread`, `DmMessage`, or `UserProfile`.)

- [ ] **Step 4: Commit**

```bash
git add types/index.ts
git commit -m "feat(dm): add DM and notification types"
```

---

### Task 2: Pure DM helpers (with real unit tests)

**Files:**
- Create: `utils/dm.ts`
- Test: `__tests__/utils/dm.test.ts`

**Interfaces:**
- Consumes: `DmThread` from Task 1.
- Produces: `sortedPairId(uidA, uidB): string`, `formatGroupName(names, maxNames?): string`, `isThreadUnread(thread, myUid, lastReadAtMillis): boolean` — used by Task 12 (`useDmThreads`) and Task 15 (`useUnreadActivity`).

This is the one part of this feature that's genuinely pure logic (no Firebase
involved) — everything downstream of it is deliberately kept thin so the
actual branching logic lives here where it can be tested for real, matching
this repo's one existing test file's style (`__tests__/constants/icons.test.ts`).

- [ ] **Step 1: Write the failing tests**

Create `__tests__/utils/dm.test.ts`:

```ts
import { Timestamp } from 'firebase/firestore';
import { sortedPairId, formatGroupName, isThreadUnread } from '@/utils/dm';

describe('sortedPairId', () => {
  it('sorts uids alphabetically regardless of argument order', () => {
    expect(sortedPairId('userB', 'userA')).toBe('userA_userB');
    expect(sortedPairId('userA', 'userB')).toBe('userA_userB');
  });
});

describe('formatGroupName', () => {
  it('joins all names when at or under the max', () => {
    expect(formatGroupName(['Sarah', 'Alex'])).toBe('Sarah, Alex');
  });

  it('truncates with a "+N more" tail beyond the max', () => {
    expect(formatGroupName(['Sarah', 'Alex', 'Jordan', 'Kim'], 3)).toBe('Sarah, Alex, Jordan +1 more');
  });
});

describe('isThreadUnread', () => {
  const lastMessageAt = Timestamp.fromMillis(1_000_000);

  it('is false when I sent the last message', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'me' }, 'me', null)).toBe(false);
  });

  it('is false when there is no last message yet', () => {
    expect(isThreadUnread({ lastMessageAt: null, lastMessageSenderUid: null }, 'me', null)).toBe(false);
  });

  it('is true when never read and someone else sent the last message', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'them' }, 'me', null)).toBe(true);
  });

  it('is true when the last message arrived after my read cursor', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'them' }, 'me', 900_000)).toBe(true);
  });

  it('is false when I already read past the last message', () => {
    expect(isThreadUnread({ lastMessageAt, lastMessageSenderUid: 'them' }, 'me', 1_000_001)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest __tests__/utils/dm.test.ts`
Expected: FAIL — `Cannot find module '@/utils/dm'`

- [ ] **Step 3: Write the implementation**

Create `utils/dm.ts`:

```ts
import type { Timestamp } from 'firebase/firestore';
import type { DmThread } from '@/types';

/** `${uidA}_${uidB}` sorted alphabetically — mirrors the Cloud Function's
 * own sortedPairId() (functions/src/dmThreads.ts) so a direct thread's ID
 * is deterministic from either side. */
export function sortedPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

/** "Sarah, Alex, Jordan" — comma-joined, truncated with a "+N more" tail
 * beyond `maxNames` so a large group's header/inbox row doesn't overflow. */
export function formatGroupName(names: string[], maxNames = 3): string {
  if (names.length <= maxNames) return names.join(', ');
  const shown = names.slice(0, maxNames).join(', ');
  return `${shown} +${names.length - maxNames} more`;
}

/** A thread counts as unread for `myUid` if its last message came from
 * someone else and arrived after my own read cursor (or I've never read it
 * at all). Used both for the per-row dot in the Messages tab (cursor =
 * dmThreads/{id}/reads/{myUid}.lastReadAt) and the coarse heart-icon badge
 * (cursor = users/{myUid}.lastMessagesSeenAt) — same logic, different
 * granularity of read cursor. */
export function isThreadUnread(
  thread: Pick<DmThread, 'lastMessageAt' | 'lastMessageSenderUid'>,
  myUid: string,
  lastReadAtMillis: number | null,
): boolean {
  if (!thread.lastMessageAt || thread.lastMessageSenderUid === myUid) return false;
  const lastMessageMillis = (thread.lastMessageAt as Timestamp).toMillis();
  return lastReadAtMillis === null || lastMessageMillis > lastReadAtMillis;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest __tests__/utils/dm.test.ts`
Expected: PASS, 5 tests in `isThreadUnread`, 2 in `formatGroupName`, 1 in `sortedPairId`.

- [ ] **Step 5: Commit**

```bash
git add utils/dm.ts __tests__/utils/dm.test.ts
git commit -m "feat(dm): add pure DM helpers with unit tests"
```

---

### Task 3: Firestore rules

**Files:**
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: nothing (rules are declarative).
- Produces: the security boundary every later client-side hook (Tasks 12–13) depends on.

- [ ] **Step 1: Add the `dmThreads` rule block**

Add inside `service cloud.firestore { match /databases/{database}/documents { ... } }`,
after the closing brace of the `usage_quotas` block (`firestore.rules:222`,
right before the `// Reports` comment) — same top level as `trips`, `posts`, etc:

```
    // Direct messages — thread creation validates a variable-length
    // participants array against the mutual-follow graph, which security
    // rules can't express (no loop/forall over an array). createDmThread
    // (Admin SDK) is the only way a thread doc comes into existence.
    match /dmThreads/{threadId} {
      allow read: if isAuthed() && request.auth.uid in resource.data.participants;
      allow create, update: if false;
      allow delete: if false;

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

      // One doc per participant — each side's own read cursor. Splitting
      // this out (instead of a map field on the thread doc) avoids two
      // participants needing shared write access to the same parent doc.
      match /reads/{uid} {
        allow read, write: if isOwner(uid);
      }
    }
```

- [ ] **Step 2: Loosen the `notifications` write rule to allow marking read**

Replace the existing block at `firestore.rules` (inside `match /users/{uid}`, currently):

```
      // Notifications
      match /notifications/{notifId} {
        allow read: if isOwner(uid);
        allow write: if false;
      }
```

with:

```
      // Notifications
      match /notifications/{notifId} {
        allow read: if isOwner(uid);
        // Content is Cloud-Functions-only (Admin SDK); the owner may only
        // ever flip their own `read` field, never author/edit a notification.
        allow create, delete: if false;
        allow update: if isOwner(uid)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['read']);
      }
```

- [ ] **Step 3: Validate the rules syntax**

Use the `mcp__plugin_firebase_firebase__firebase_validate_security_rules` tool
with `type: "firestore"` and `source_file: "firestore.rules"`.
Expected: `OK: No errors detected.`

- [ ] **Step 4: Commit**

```bash
git add firestore.rules
git commit -m "feat(dm): add dmThreads/messages/reads rules, allow marking notifications read"
```

(Not deployed yet — see Task 22.)

---

### Task 4: Firestore indexes

**Files:**
- Modify: `firestore.indexes.json`

- [ ] **Step 1: Replace the dead `conversations` index with a real `dmThreads` one**

The current `conversations` entry has been unused since the very first commit
(`64f34bb`) — no code anywhere references a `conversations` collection; it's
orphaned scaffold config, not a prior implementation to preserve. Replace it:

```json
    {
      "collectionGroup": "conversations",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "lastMessageAt", "order": "DESCENDING" }
      ]
    },
```

with:

```json
    {
      "collectionGroup": "dmThreads",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "participants", "arrayConfig": "CONTAINS" },
        { "fieldPath": "lastMessageAt", "order": "DESCENDING" }
      ]
    },
```

This is the index Task 12's `fetchDmThreads` query needs (`where('participants',
'array-contains', uid)` + `orderBy('lastMessageAt', 'desc')`).

- [ ] **Step 2: Commit**

```bash
git add firestore.indexes.json
git commit -m "feat(dm): swap the dead conversations index for dmThreads"
```

(Not deployed yet — see Task 22.)

---

### Task 5: Export `sendPushNotification` from `notify.ts`

**Files:**
- Modify: `functions/src/notify.ts`

**Interfaces:**
- Produces: `sendPushNotification(tokens: string[], title: string, body: string): Promise<void>` as a named export — consumed directly by Task 7 (`dmMessages.ts`), which needs to push without writing an in-app notification doc.

- [ ] **Step 1: Add `export` to the existing function**

In `functions/src/notify.ts`, change (currently line 39):

```ts
async function sendPushNotification(tokens: string[], title: string, body: string): Promise<void> {
```

to:

```ts
export async function sendPushNotification(tokens: string[], title: string, body: string): Promise<void> {
```

No other change to the file — `notifyUser()` keeps calling it exactly as before.

- [ ] **Step 2: Verify the Cloud Functions package still builds**

Run: `cd functions && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/notify.ts
git commit -m "feat(dm): export sendPushNotification for reuse by DM message pushes"
```

---

### Task 6: `createDmThread` Cloud Function

**Files:**
- Create: `functions/src/dmThreads.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: nothing new (Admin SDK Firestore access only).
- Produces: callable `createDmThread({ participantUids: string[] }) => { threadId: string; isNew: boolean }` — consumed by Task 12's `useCreateDmThread` hook.

- [ ] **Step 1: Write the function**

Create `functions/src/dmThreads.ts`:

```ts
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const MAX_GROUP_SIZE = 12;

interface CreateDmThreadRequest {
  participantUids: string[]; // the OTHER participants — caller is added automatically
}

interface CreateDmThreadResult {
  threadId: string;
  isNew: boolean;
}

/** `${uidA}_${uidB}` sorted alphabetically — mirrors utils/dm.ts's
 * sortedPairId() on the client. Deterministic so a 1:1 thread can never be
 * duplicated by tapping "Message" twice. */
function sortedPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

async function isMutualFriend(uidA: string, uidB: string): Promise<boolean> {
  const [aFollowsB, bFollowsA] = await Promise.all([
    db.doc(`follows/${uidA}_${uidB}`).get(),
    db.doc(`follows/${uidB}_${uidA}`).get(),
  ]);
  return aFollowsB.exists && bFollowsA.exists;
}

/**
 * Creates (or, for a 1:1 pair, resolves the existing) DM thread. Friendship
 * validation against a variable-length participants array can't be
 * expressed in firestore.rules (no loop/forall over an array), so thread
 * creation is Admin-SDK-only — see firestore.rules `dmThreads` create/update:
 * if false.
 */
export const createDmThread = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request): Promise<CreateDmThreadResult> => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const callerUid = request.auth.uid;
    const { participantUids } = request.data as CreateDmThreadRequest;

    if (!Array.isArray(participantUids) || participantUids.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'participantUids is required');
    }
    const others = Array.from(new Set(participantUids.filter((uid) => uid !== callerUid)));
    if (others.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', "Can't start a thread with only yourself");
    }
    const participants = [callerUid, ...others];
    if (participants.length > MAX_GROUP_SIZE) {
      throw new functions.https.HttpsError('invalid-argument', `Groups are limited to ${MAX_GROUP_SIZE} people`);
    }

    const friendChecks = await Promise.all(others.map((uid) => isMutualFriend(callerUid, uid)));
    if (friendChecks.some((isFriend) => !isFriend)) {
      throw new functions.https.HttpsError('permission-denied', 'You can only message mutual friends');
    }

    const isDirect = participants.length === 2;
    const threadId = isDirect
      ? sortedPairId(participants[0], participants[1])
      : db.collection('dmThreads').doc().id;
    const threadRef = db.doc(`dmThreads/${threadId}`);

    if (isDirect) {
      const existing = await threadRef.get();
      if (existing.exists) {
        return { threadId, isNew: false };
      }
    }

    await threadRef.set({
      type: isDirect ? 'direct' : 'group',
      participants,
      createdByUid: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageText: null,
      lastMessageAt: null,
      lastMessageSenderUid: null,
    });

    return { threadId, isNew: true };
  },
);
```

- [ ] **Step 2: Export it from `index.ts`**

Add to `functions/src/index.ts`:

```ts
export { createDmThread } from './dmThreads';
```

- [ ] **Step 3: Verify the build**

Run: `cd functions && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/dmThreads.ts functions/src/index.ts
git commit -m "feat(dm): add createDmThread callable"
```

---

### Task 7: `onMessageCreated` Cloud Function

**Files:**
- Create: `functions/src/dmMessages.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `sendPushNotification` from Task 5.
- Produces: Firestore trigger on `dmThreads/{threadId}/messages/{messageId}` — no client-facing interface (fires automatically).

- [ ] **Step 1: Write the function**

Create `functions/src/dmMessages.ts`:

```ts
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { sendPushNotification } from './notify';

const db = admin.firestore();

/**
 * Fires on every new DM message. Updates the parent thread's denormalized
 * lastMessage* fields (the client can't — see firestore.rules `dmThreads`
 * update: if false) and pushes every other participant. Deliberately does
 * NOT write a users/{uid}/notifications doc: the Messages tab itself, read
 * via lastMessageAt vs. the recipient's own read cursor, is the
 * notification for DMs (see the design spec's "DM notification delivery"
 * decision).
 */
export const onMessageCreated = onDocumentCreated(
  'dmThreads/{threadId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { threadId } = event.params;
    const message = snap.data();

    const threadRef = db.doc(`dmThreads/${threadId}`);
    const threadSnap = await threadRef.get();
    if (!threadSnap.exists) return;
    const thread = threadSnap.data()!;

    await threadRef.update({
      lastMessageText: message.text,
      lastMessageAt: message.createdAt,
      lastMessageSenderUid: message.senderUid,
    });

    const recipients: string[] = (thread.participants ?? []).filter(
      (uid: string) => uid !== message.senderUid,
    );
    if (recipients.length === 0) return;

    const senderDoc = await db.doc(`users/${message.senderUid}`).get();
    const senderData = senderDoc.data() ?? {};
    const senderName: string = senderData.fullName ?? senderData.displayName ?? 'Someone';

    const tokenLists = await Promise.all(
      recipients.map(async (uid) => {
        const userDoc = await db.doc(`users/${uid}`).get();
        return (userDoc.data()?.expoPushTokens ?? []) as string[];
      }),
    );
    const tokens = tokenLists.flat();
    if (tokens.length === 0) return;

    const text: string = message.text ?? '';
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await sendPushNotification(tokens, senderName, preview);
  },
);
```

- [ ] **Step 2: Export it from `index.ts`**

Add to `functions/src/index.ts`:

```ts
export { onMessageCreated } from './dmMessages';
```

- [ ] **Step 3: Verify the build**

Run: `cd functions && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/dmMessages.ts functions/src/index.ts
git commit -m "feat(dm): add onMessageCreated trigger for thread fan-out and push"
```

---

### Task 8: Post like/comment notification triggers

**Files:**
- Create: `functions/src/postEvents.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `notifyUser` from `functions/src/notify.ts` (already exported, unchanged).
- Produces: Firestore triggers on `posts/{postId}/likes/{likeId}` and `posts/{postId}/comments/{commentId}` — no client-facing interface.

- [ ] **Step 1: Write the functions**

Create `functions/src/postEvents.ts`:

```ts
import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { notifyUser } from './notify';

const db = admin.firestore();

function coverUrlFor(post: FirebaseFirestore.DocumentData): string | null {
  if (post.mediaType === 'photo') return post.mediaUrl ?? null;
  return post.thumbnailUrl ?? null;
}

/** posts/{postId}/likes/{likeId} — the like doc only carries { uid,
 * createdAt } (see components/feed/FeedActions.tsx), so the liker's
 * name/avatar need a users/ lookup here. */
export const onLikeCreated = onDocumentCreated(
  'posts/{postId}/likes/{likeId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { postId } = event.params;
    const likerUid: string = snap.data().uid;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const post = postSnap.data()!;
    if (post.authorUid === likerUid) return; // no self-notifications

    const likerDoc = await db.doc(`users/${likerUid}`).get();
    const likerData = likerDoc.data() ?? {};
    const likerName: string = likerData.fullName ?? likerData.displayName ?? 'A traveler';

    await notifyUser(post.authorUid, {
      notification: {
        type: 'post_like',
        postId,
        postCoverUrl: coverUrlFor(post),
        likerUid,
        likerName,
        likerAvatarUrl: likerData.avatarUrl ?? null,
      },
      push: {
        title: 'New like',
        body: `${likerName} liked your post`,
      },
    });
  },
);

/** posts/{postId}/comments/{commentId} — the comment doc already carries
 * authorDisplayName/authorAvatarUrl (see the Comment type), so no extra
 * users/ lookup is needed here, unlike likes. */
export const onCommentCreated = onDocumentCreated(
  'posts/{postId}/comments/{commentId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { postId } = event.params;
    const comment = snap.data();
    const commenterUid: string = comment.authorUid;

    const postSnap = await db.doc(`posts/${postId}`).get();
    if (!postSnap.exists) return;
    const post = postSnap.data()!;
    if (post.authorUid === commenterUid) return; // no self-notifications

    const text: string = comment.text ?? '';
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    const commenterName: string = comment.authorDisplayName ?? 'A traveler';

    await notifyUser(post.authorUid, {
      notification: {
        type: 'post_comment',
        postId,
        postCoverUrl: coverUrlFor(post),
        commentText: preview,
        commenterUid,
        commenterName,
        commenterAvatarUrl: comment.authorAvatarUrl ?? null,
      },
      push: {
        title: 'New comment',
        body: `${commenterName}: ${preview}`,
      },
    });
  },
);
```

- [ ] **Step 2: Export both from `index.ts`**

Add to `functions/src/index.ts`:

```ts
export { onLikeCreated, onCommentCreated } from './postEvents';
```

- [ ] **Step 3: Verify the build**

Run: `cd functions && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/postEvents.ts functions/src/index.ts
git commit -m "feat(dm): notify post authors on new likes and comments"
```

---

### Task 9: `useIsFriend` and `useMutualFriends` hooks

**Files:**
- Create: `hooks/useIsFriend.ts`
- Create: `hooks/useMutualFriends.ts`

**Interfaces:**
- Consumes: `follows` collection (existing), `useAuthStore` (existing).
- Produces: `useIsFriend(otherUid: string | null): UseQueryResult<boolean>` — consumed by Task 19 (`app/user/[uid].tsx`). `useMutualFriends(uid: string | null): UseQueryResult<string[]>` — consumed by Task 17 (`FriendPickerSheet`).

- [ ] **Step 1: Write `useIsFriend`**

Create `hooks/useIsFriend.ts`:

```ts
import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';

async function checkMutualFollow(uidA: string, uidB: string): Promise<boolean> {
  const [aFollowsB, bFollowsA] = await Promise.all([
    getDoc(doc(db, 'follows', `${uidA}_${uidB}`)),
    getDoc(doc(db, 'follows', `${uidB}_${uidA}`)),
  ]);
  return aFollowsB.exists() && bFollowsA.exists();
}

/** True only if both users follow each other — the "confirmed friend" gate
 * for direct messaging. Doc ID convention (`${followerUid}_${followeeUid}`)
 * matches useFollow.ts's followDocId(). */
export function useIsFriend(otherUid: string | null) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useQuery({
    queryKey: ['isFriend', uid, otherUid],
    queryFn: () => checkMutualFollow(uid, otherUid!),
    enabled: !!uid && !!otherUid && uid !== otherUid,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Write `useMutualFriends`**

Create `hooks/useMutualFriends.ts`:

```ts
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import { db } from '@/services/firebase';

async function fetchMutualFriends(uid: string): Promise<string[]> {
  const [followingSnap, followersSnap] = await Promise.all([
    getDocs(query(collection(db, 'follows'), where('followerUid', '==', uid))),
    getDocs(query(collection(db, 'follows'), where('followeeUid', '==', uid))),
  ]);
  const following = new Set(followingSnap.docs.map((d) => d.data().followeeUid as string));
  const followers = new Set(followersSnap.docs.map((d) => d.data().followerUid as string));
  return Array.from(following).filter((otherUid) => followers.has(otherUid));
}

/** Intersection of "people I follow" and "people who follow me" — the
 * audience for starting a new DM (direct or group). Stricter than
 * useFollowConnections (union), which trip invites intentionally keep using. */
export function useMutualFriends(uid: string | null) {
  return useQuery({
    queryKey: ['mutualFriends', uid],
    queryFn: () => fetchMutualFriends(uid!),
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/useIsFriend.ts hooks/useMutualFriends.ts
git commit -m "feat(dm): add useIsFriend and useMutualFriends hooks"
```

---

### Task 10: `useDmThreads` (list + single thread + create mutation)

**Files:**
- Create: `hooks/useDmThreads.ts`

**Interfaces:**
- Consumes: `isThreadUnread` from `utils/dm.ts` (Task 2), `DmThread` from `types/index.ts` (Task 1), `createDmThread` callable (Task 6).
- Produces: `useDmThreads(): UseQueryResult<Array<DmThread & { unread: boolean }>>`, `useDmThread(threadId: string | null): UseQueryResult<DmThread | null>`, `useCreateDmThread(): UseMutationResult<{threadId: string; isNew: boolean}, unknown, string[]>` — all three consumed by Task 19 (Messages tab), Task 18 (chat screen header), Task 17 (friend picker), Task 20 (profile Message button).

- [ ] **Step 1: Write the hook file**

Create `hooks/useDmThreads.ts`:

```ts
import { collection, doc, getDoc, getDocs, orderBy, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db, functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isThreadUnread } from '@/utils/dm';
import type { DmThread } from '@/types';

async function fetchDmThreads(uid: string): Promise<Array<DmThread & { unread: boolean }>> {
  const snap = await getDocs(
    query(
      collection(db, 'dmThreads'),
      where('participants', 'array-contains', uid),
      orderBy('lastMessageAt', 'desc'),
    ),
  );
  const threads = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DmThread);

  const readCursors = await Promise.all(
    threads.map((t) => getDoc(doc(db, 'dmThreads', t.id, 'reads', uid))),
  );

  return threads.map((thread, i) => {
    const lastReadAt = readCursors[i].data()?.lastReadAt;
    return {
      ...thread,
      unread: isThreadUnread(thread, uid, lastReadAt ? lastReadAt.toMillis() : null),
    };
  });
}

/** All DM threads I'm a participant in, newest activity first, each
 * annotated with whether I've read past its last message. Powers the
 * Messages tab in app/notifications.tsx. */
export function useDmThreads() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  return useQuery({
    queryKey: ['dmThreads', uid],
    queryFn: () => fetchDmThreads(uid!),
    enabled: !!uid,
    staleTime: 30 * 1000,
  });
}

async function fetchDmThread(threadId: string): Promise<DmThread | null> {
  const snap = await getDoc(doc(db, 'dmThreads', threadId));
  return snap.exists() ? ({ id: snap.id, ...snap.data() } as DmThread) : null;
}

/** Single thread doc — powers the chat screen's header (participants, type). */
export function useDmThread(threadId: string | null) {
  return useQuery({
    queryKey: ['dmThread', threadId],
    queryFn: () => fetchDmThread(threadId!),
    enabled: !!threadId,
    staleTime: 60 * 1000,
  });
}

interface CreateDmThreadResult {
  threadId: string;
  isNew: boolean;
}

/** Starts (or resolves an existing) DM thread via the createDmThread Cloud
 * Function — friendship validation against a variable-length participant
 * list can't be expressed in Firestore rules, so thread creation is
 * Admin-SDK-only (see firestore.rules `dmThreads` create/update: if false). */
export function useCreateDmThread() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (participantUids: string[]) => {
      const fn = httpsCallable<{ participantUids: string[] }, CreateDmThreadResult>(
        functions,
        'createDmThread',
      );
      return fn({ participantUids }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dmThreads'] });
    },
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useDmThreads.ts
git commit -m "feat(dm): add useDmThreads/useDmThread/useCreateDmThread hooks"
```

---

### Task 11: `useDmMessages` (real-time) and `useSendDmMessage`

**Files:**
- Create: `hooks/useDmMessages.ts`

**Interfaces:**
- Consumes: `DmMessage` from `types/index.ts` (Task 1).
- Produces: `useDmMessages(threadId: string | null): { messages: DmMessage[]; loading: boolean }`, `useSendDmMessage(threadId: string | null): (text: string) => Promise<void>` — both consumed by Task 18 (chat screen).

This is the app's second `onSnapshot` exception (the first is post comments,
`app/post/[id].tsx`), following that exact pattern: `useState` + `useEffect`
managing the listener directly, not wrapped in TanStack Query.

- [ ] **Step 1: Write the hook file**

Create `hooks/useDmMessages.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { DmMessage } from '@/types';

/** Real-time message list for one open thread — the app's second
 * onSnapshot exception (the first is post comments in app/post/[id].tsx),
 * for the same reason: a chat that isn't live defeats the point. */
export function useDmMessages(threadId: string | null) {
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!threadId) return;
    setLoading(true);
    const q = query(collection(db, 'dmThreads', threadId, 'messages'), orderBy('createdAt', 'asc'));
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as DmMessage));
      setLoading(false);
    });
    return unsub;
  }, [threadId]);

  return { messages, loading };
}

/** Sends a message via a direct client addDoc — no callable needed, the
 * messages `create` rule alone enforces "must be a participant, must be
 * the sender." onMessageCreated (Cloud Function) handles the fan-out:
 * updating the thread's lastMessage* fields and pushing the recipients. */
export function useSendDmMessage(threadId: string | null) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!threadId || !uid || !trimmed) return;
      await addDoc(collection(db, 'dmThreads', threadId, 'messages'), {
        senderUid: uid,
        text: trimmed,
        createdAt: serverTimestamp(),
      });
    },
    [threadId, uid],
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useDmMessages.ts
git commit -m "feat(dm): add real-time useDmMessages and useSendDmMessage hooks"
```

---

### Task 12: Mark notifications read

**Files:**
- Modify: `hooks/useNotifications.ts`

**Interfaces:**
- Produces: `useMarkNotificationsRead(): UseMutationResult<void, unknown, void>` — consumed by Task 19 (`app/notifications.tsx`'s Activity tab).

- [ ] **Step 1: Add the mutation**

Replace the full contents of `hooks/useNotifications.ts` with:

```ts
import { collection, getDocs, orderBy, query, where, writeBatch } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { AppNotification } from '@/types';

async function fetchNotifications(uid: string): Promise<AppNotification[]> {
  const snap = await getDocs(query(collection(db, 'users', uid, 'notifications'), orderBy('createdAt', 'desc')));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as AppNotification);
}

/** Short staleTime — this is the one place a pending trip invite needs to
 * feel current, not the usual 2-minute default. Still getDocs, not
 * onSnapshot, per the app's existing architecture rule. */
export function useNotifications() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  return useQuery({
    queryKey: ['notifications', uid],
    queryFn: () => fetchNotifications(uid!),
    enabled: !!uid,
    staleTime: 30 * 1000,
  });
}

/** Batch-marks every currently-unread notification `read: true` — called
 * when the Activity tab is viewed. firestore.rules only allows the owner to
 * flip this one field, never author/edit notification content. */
export function useMarkNotificationsRead() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const snap = await getDocs(
        query(collection(db, 'users', uid, 'notifications'), where('read', '==', false)),
      );
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach((d) => batch.update(d.ref, { read: true }));
      await batch.commit();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', uid] });
      queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity', uid] });
    },
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useNotifications.ts
git commit -m "feat(dm): add useMarkNotificationsRead mutation"
```

---

### Task 13: `useUnreadActivity` (heart-icon badge)

**Files:**
- Create: `hooks/useUnreadActivity.ts`

**Interfaces:**
- Consumes: `isThreadUnread` from `utils/dm.ts` (Task 2), `DmThread` from `types/index.ts` (Task 1).
- Produces: `useHasUnreadActivity(): UseQueryResult<boolean>`, `useMarkMessagesSeen(): UseMutationResult<void, unknown, void>` — consumed by Task 21 (feed header badge) and Task 19 (Messages tab focus).

- [ ] **Step 1: Write the hook file**

Create `hooks/useUnreadActivity.ts`:

```ts
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { isThreadUnread } from '@/utils/dm';
import type { DmThread } from '@/types';

async function checkUnreadActivity(uid: string): Promise<boolean> {
  const unreadNotifSnap = await getDocs(
    query(collection(db, 'users', uid, 'notifications'), where('read', '==', false), limit(1)),
  );
  if (!unreadNotifSnap.empty) return true;

  const [latestThreadSnap, userSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'dmThreads'),
        where('participants', 'array-contains', uid),
        orderBy('lastMessageAt', 'desc'),
        limit(1),
      ),
    ),
    getDoc(doc(db, 'users', uid)),
  ]);
  if (latestThreadSnap.empty) return false;

  const thread = latestThreadSnap.docs[0].data() as DmThread;
  const lastSeenAt = userSnap.data()?.lastMessagesSeenAt;
  return isThreadUnread(thread, uid, lastSeenAt ? lastSeenAt.toMillis() : null);
}

/** Drives the feed header's heart-icon badge dot — true if there's any
 * unread notification OR the most recent DM thread has activity I haven't
 * seen. Two small, cheap, indexed queries; no N+1 over every thread. */
export function useHasUnreadActivity() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  return useQuery({
    queryKey: ['hasUnreadActivity', uid],
    queryFn: () => checkUnreadActivity(uid),
    enabled: !!uid,
    staleTime: 30 * 1000,
  });
}

/** Marks "you've seen the Messages tab as of now" — called when that tab
 * gains focus. This is only the coarse badge signal; per-thread read state
 * for the inbox's own unread dots lives separately in
 * dmThreads/{id}/reads/{uid} (see useDmThreads.ts). */
export function useMarkMessagesSeen() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await updateDoc(doc(db, 'users', uid), { lastMessagesSeenAt: serverTimestamp() });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity', uid] });
    },
  });
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add hooks/useUnreadActivity.ts
git commit -m "feat(dm): add useHasUnreadActivity and useMarkMessagesSeen hooks"
```

---

### Task 14: `MessageBubble` component

**Files:**
- Create: `components/messages/MessageBubble.tsx`

**Interfaces:**
- Consumes: `DmMessage` from `types/index.ts` (Task 1).
- Produces: `<MessageBubble message={DmMessage} isMine={boolean} senderName?={string} />` — consumed by Task 18 (chat screen).

- [ ] **Step 1: Write the component**

Create `components/messages/MessageBubble.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { DmMessage } from '@/types';

interface MessageBubbleProps {
  message: DmMessage;
  isMine: boolean;
  /** Shown above the bubble only in group threads, where "the other
   * person" is ambiguous with 2+ other participants. Omit for direct
   * threads. */
  senderName?: string;
}

export function MessageBubble({ message, isMine, senderName }: MessageBubbleProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.row, isMine ? styles.rowMine : styles.rowTheirs]}>
      {!!senderName && !isMine && (
        <Text style={[styles.senderName, { color: colors.text.tertiary }]}>{senderName}</Text>
      )}
      <View
        style={[
          styles.bubble,
          isMine
            ? { backgroundColor: colors.text.primary, borderBottomRightRadius: BorderRadius.sm }
            : { backgroundColor: colors.background.sunken, borderBottomLeftRadius: BorderRadius.sm },
        ]}
      >
        <Text style={{ color: isMine ? colors.text.inverse : colors.text.primary, fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.4 }}>
          {message.text}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    maxWidth: '78%',
    marginVertical: Spacing['1'],
  },
  rowMine: {
    alignSelf: 'flex-end',
  },
  rowTheirs: {
    alignSelf: 'flex-start',
  },
  senderName: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginBottom: 2,
    marginLeft: Spacing['2'],
  },
  bubble: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.lg,
  },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/messages/MessageBubble.tsx
git commit -m "feat(dm): add MessageBubble component"
```

---

### Task 15: `FriendPickerSheet` component

**Files:**
- Create: `components/messages/FriendPickerSheet.tsx`

**Interfaces:**
- Consumes: `useMutualFriends` (Task 9), `useAuthorProfiles` (existing), `useCreateDmThread` (Task 10).
- Produces: `<FriendPickerSheet visible={boolean} onClose={() => void} onCreated={(threadId: string) => void} />` — consumed by Task 19 (Messages tab "+" button).

Structurally mirrors `components/trip/InviteFriendsSheet.tsx` (same BlurView
bottom-sheet chrome, same `FlashList` row layout), but multi-select instead
of one-tap-per-row, and scoped to mutual friends instead of the follow union.

- [ ] **Step 1: Write the component**

Create `components/messages/FriendPickerSheet.tsx`:

```tsx
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, Platform, Dimensions } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { UsersThree, X, Check } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMutualFriends } from '@/hooks/useMutualFriends';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useCreateDmThread } from '@/hooks/useDmThreads';
import { Avatar } from '@/components/ui/Avatar';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

const SHEET_HEIGHT = Dimensions.get('window').height * 0.6;

interface FriendPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onCreated: (threadId: string) => void;
}

export function FriendPickerSheet({ visible, onClose, onCreated }: FriendPickerSheetProps) {
  const { colors } = useTheme();
  const ownUid = useAuthStore((s) => s.user?.uid ?? '');
  const { data: friendUids = [] } = useMutualFriends(visible ? ownUid : null);
  const { data: profiles = {} } = useAuthorProfiles(friendUids);
  const createThread = useCreateDmThread();
  const [selected, setSelected] = useState<string[]>([]);

  const rows = useMemo(
    () =>
      friendUids
        .map((uid) => ({ uid, name: profiles[uid]?.name ?? 'Traveler', avatarUrl: profiles[uid]?.avatarUrl ?? null }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [friendUids, profiles],
  );

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected([]);
    onClose();
  }, [onClose]);

  const toggleUid = useCallback((uid: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelected((prev) => (prev.includes(uid) ? prev.filter((u) => u !== uid) : [...prev, uid]));
  }, []);

  const handleStart = useCallback(() => {
    if (selected.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createThread.mutate(selected, {
      onSuccess: (result) => {
        setSelected([]);
        onCreated(result.threadId);
      },
    });
  }, [selected, createThread, onCreated]);

  const sheetContent = (
    <View style={styles.content}>
      <View style={styles.handle} />
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.brand.purple }]}>NEW MESSAGE</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>
            {selected.length > 1 ? 'Start a group' : 'Message a friend'}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
          <X size={20} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <UsersThree size={22} color={colors.text.disabled} weight="duotone" />
          <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>
            You can message mutual friends — people who follow you and you follow back.
          </Text>
        </View>
      ) : (
        <FlashList
          data={rows}
          keyExtractor={(r) => r.uid}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const isSelected = selected.includes(item.uid);
            return (
              <TouchableOpacity
                style={[styles.row, { borderColor: colors.background.cardBorder }]}
                onPress={() => toggleUid(item.uid)}
                accessibilityLabel={`${isSelected ? 'Remove' : 'Add'} ${item.name}`}
              >
                <Avatar uri={item.avatarUrl} name={item.name} size="sm" />
                <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
                  {item.name}
                </Text>
                {isSelected && (
                  <View style={[styles.checkCircle, { backgroundColor: colors.brand.purple }]}>
                    <Check size={12} color="#ffffff" weight="bold" />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {selected.length > 0 && (
        <TouchableOpacity
          onPress={handleStart}
          disabled={createThread.isPending}
          style={[styles.startBtn, { backgroundColor: colors.text.primary }]}
        >
          <Text style={[styles.startBtnText, { color: colors.background.primary }]}>
            {selected.length === 1 ? 'Message' : `Start group (${selected.length})`}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheetWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint="dark" style={styles.fill}>
              {sheetContent}
            </BlurView>
          ) : (
            <View style={[styles.fill, styles.androidBg]}>{sheetContent}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: {
    height: SHEET_HEIGHT,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.97)' },
  content: { flex: 1, padding: Spacing['5'], gap: Spacing['3'] },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignSelf: 'center',
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  headerText: { gap: 2 },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold, letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.semiBold },
  emptyRow: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing['3'], paddingHorizontal: Spacing['6'] },
  emptyText: { fontSize: FontSize.sm, textAlign: 'center' },
  listContent: { paddingBottom: Spacing['4'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingVertical: Spacing['3'], borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  checkCircle: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  startBtn: { paddingVertical: Spacing['4'], borderRadius: BorderRadius.full, alignItems: 'center' },
  startBtnText: { fontSize: FontSize.sm, fontWeight: FontWeight.bold },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/messages/FriendPickerSheet.tsx
git commit -m "feat(dm): add FriendPickerSheet for starting new DM threads"
```

---

### Task 16: Chat screen (`app/messages/[threadId].tsx`)

**Files:**
- Create: `app/messages/[threadId].tsx`

**Interfaces:**
- Consumes: `useDmThread` (Task 10), `useDmMessages`/`useSendDmMessage` (Task 11), `useAuthorProfiles` (existing), `MessageBubble` (Task 14), `formatGroupName` (Task 2).
- Produces: the route `app/messages/[threadId]` — consumed by Task 19 (Messages tab row tap) and Task 20 (profile Message button).

- [ ] **Step 1: Write the screen**

Create `app/messages/[threadId].tsx`:

```tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList, FlashListRef } from '@shopify/flash-list';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PaperPlaneRight } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useDmThread } from '@/hooks/useDmThreads';
import { useDmMessages, useSendDmMessage } from '@/hooks/useDmMessages';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { MessageBubble } from '@/components/messages/MessageBubble';
import { Avatar } from '@/components/ui/Avatar';
import { formatGroupName } from '@/utils/dm';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { DmMessage } from '@/types';

export default function DmThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const myUid = useAuthStore((s) => s.user?.uid ?? '');

  const { data: thread } = useDmThread(threadId ?? null);
  const { messages, loading } = useDmMessages(threadId ?? null);
  const sendMessage = useSendDmMessage(threadId ?? null);
  const [text, setText] = useState('');
  const listRef = useRef<FlashListRef<DmMessage>>(null);

  const otherUids = useMemo(
    () => (thread ? thread.participants.filter((uid) => uid !== myUid) : []),
    [thread, myUid],
  );
  const { data: profiles = {} } = useAuthorProfiles(otherUids);

  const headerName = useMemo(() => {
    if (!thread) return '';
    if (thread.type === 'direct') return profiles[otherUids[0]]?.name ?? 'Traveler';
    return formatGroupName(otherUids.map((uid) => profiles[uid]?.name ?? 'Traveler'));
  }, [thread, otherUids, profiles]);

  // Mark my read cursor for this thread whenever it's open/focused.
  useFocusEffect(
    useCallback(() => {
      if (!threadId || !myUid) return;
      setDoc(doc(db, 'dmThreads', threadId, 'reads', myUid), { lastReadAt: serverTimestamp() }, { merge: true }).then(
        () => {
          queryClient.invalidateQueries({ queryKey: ['dmThreads'] });
          queryClient.invalidateQueries({ queryKey: ['hasUnreadActivity'] });
        },
      );
    }, [threadId, myUid, queryClient]),
  );

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleSend = useCallback(() => {
    if (!text.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    sendMessage(text);
    setText('');
  }, [text, sendMessage]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.top}
    >
      <View style={[styles.header, { paddingTop: insets.top + Spacing['3'], borderBottomColor: colors.background.cardBorder }]}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        {thread?.type === 'direct' ? (
          <Avatar uri={profiles[otherUids[0]]?.avatarUrl} name={headerName} size="sm" />
        ) : (
          <View style={[styles.groupAvatar, { backgroundColor: colors.background.sunken }]}>
            <Text style={{ color: colors.text.secondary, fontSize: FontSize.xs, fontWeight: FontWeight.bold }}>
              {otherUids.length}
            </Text>
          </View>
        )}
        <Text style={[styles.headerName, { color: colors.text.primary }]} numberOfLines={1}>
          {headerName}
        </Text>
        <View style={styles.backBtn} />
      </View>

      {!loading && (
        <FlashList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingVertical: Spacing['3'] }}
          renderItem={({ item }) => (
            <MessageBubble
              message={item}
              isMine={item.senderUid === myUid}
              senderName={thread?.type === 'group' ? profiles[item.senderUid]?.name : undefined}
            />
          )}
        />
      )}

      <View style={[styles.composer, { borderTopColor: colors.background.cardBorder, paddingBottom: insets.bottom + Spacing['3'] }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor={colors.text.tertiary}
          style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.sunken }]}
          multiline
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!text.trim()}
          style={[styles.sendBtn, { backgroundColor: text.trim() ? colors.text.primary : colors.background.sunken }]}
          accessibilityLabel="Send message"
        >
          <PaperPlaneRight size={18} color={text.trim() ? colors.background.primary : colors.text.disabled} weight="fill" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: { width: 32, minHeight: 32, alignItems: 'flex-start', justifyContent: 'center' },
  groupAvatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headerName: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.xl,
    fontSize: FontSize.sm,
  },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors. `PaperPlaneRight` and `FlashListRef` are both
confirmed valid exports of the installed `phosphor-react-native` and
`@shopify/flash-list@2.0.2` versions respectively.

- [ ] **Step 3: Commit**

```bash
git add app/messages/\[threadId\].tsx
git commit -m "feat(dm): add DM chat screen"
```

---

### Task 17: Extend `app/notifications.tsx` — Activity/Messages tabs

**Files:**
- Modify: `app/notifications.tsx`

**Interfaces:**
- Consumes: `useMarkNotificationsRead` (Task 12), `useDmThreads` (Task 10), `useMarkMessagesSeen` (Task 13), `useAuthorProfiles` (existing), `FriendPickerSheet` (Task 15), `formatGroupName` (Task 2).

- [ ] **Step 1: Add the segmented control and Messages tab**

Modify `app/notifications.tsx`. Add these imports alongside the existing ones:

```ts
import { useState, useCallback, useEffect } from 'react';
import { ChatCircleDots, Plus } from 'phosphor-react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMarkNotificationsRead } from '@/hooks/useNotifications';
import { useDmThreads } from '@/hooks/useDmThreads';
import { useMarkMessagesSeen } from '@/hooks/useUnreadActivity';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { FriendPickerSheet } from '@/components/messages/FriendPickerSheet';
import { formatGroupName } from '@/utils/dm';
```

(`useState`/`useCallback` are likely already imported — merge rather than duplicate.)

Inside `NotificationsScreen`, add state and the two new hooks near the top,
alongside the existing `useNotifications()` call:

```ts
const [tab, setTab] = useState<'Activity' | 'Messages'>('Activity');
const [pickerVisible, setPickerVisible] = useState(false);
const myUid = useAuthStore((s) => s.user?.uid ?? '');
const markRead = useMarkNotificationsRead();
const { data: threads = [], isLoading: threadsLoading } = useDmThreads();
const markMessagesSeen = useMarkMessagesSeen();

const allOtherUids = Array.from(
  new Set(threads.flatMap((t) => t.participants.filter((uid) => uid !== myUid))),
);
const { data: profiles = {} } = useAuthorProfiles(allOtherUids);

// Batch-mark unread notifications read once they've actually loaded and
// been shown, not on every render.
useEffect(() => {
  if (tab === 'Activity' && notifications.some((n) => !n.read)) {
    markRead.mutate();
  }
}, [tab, notifications]); // eslint-disable-line react-hooks/exhaustive-deps

useEffect(() => {
  if (tab === 'Messages') {
    markMessagesSeen.mutate();
  }
}, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

const handleThreadPress = useCallback((threadId: string) => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  router.push(`/messages/${threadId}`);
}, []);

const handleOpenPicker = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  setPickerVisible(true);
}, []);

const handleThreadCreated = useCallback((threadId: string) => {
  setPickerVisible(false);
  router.push(`/messages/${threadId}`);
}, []);
```

Add two new render branches to the existing `renderItem` callback's switch —
for `post_like` and `post_comment` — right after the `trip_invite` branch and
before the final `trip_invite_accepted` fallback:

```tsx
if (item.type === 'post_like') {
  return (
    <TouchableOpacity
      style={[styles.row, { borderColor: colors.background.cardBorder }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/post/${item.postId}`);
      }}
      activeOpacity={0.7}
    >
      <Avatar uri={item.likerAvatarUrl} name={item.likerName} size="sm" />
      <View style={styles.rowText}>
        <Text style={[styles.rowBody, { color: colors.text.primary }]}>
          <Text style={styles.rowBold}>{item.likerName}</Text> liked your post
        </Text>
        <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
          {timeAgo(item.createdAt.toDate())}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

if (item.type === 'post_comment') {
  return (
    <TouchableOpacity
      style={[styles.row, { borderColor: colors.background.cardBorder }]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push(`/post/${item.postId}`);
      }}
      activeOpacity={0.7}
    >
      <Avatar uri={item.commenterAvatarUrl} name={item.commenterName} size="sm" />
      <View style={styles.rowText}>
        <Text style={[styles.rowBody, { color: colors.text.primary }]}>
          <Text style={styles.rowBold}>{item.commenterName}</Text> commented: {item.commentText}
        </Text>
        <Text style={[styles.rowTime, { color: colors.text.tertiary }]}>
          {timeAgo(item.createdAt.toDate())}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
```

Replace the screen's top-level return to add the segmented control and swap
content by tab. The existing header `Text` (`"Activity"`) and everything
below it in the `return` block becomes:

```tsx
return (
  <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
    <View style={[styles.header, { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder }]}>
      <TouchableOpacity onPress={handleBack} style={styles.backBtn} hitSlop={8} accessibilityLabel="Back">
        <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
      </TouchableOpacity>
      <Text style={[styles.title, { color: colors.text.primary }]}>Activity</Text>
      {tab === 'Messages' ? (
        <TouchableOpacity onPress={handleOpenPicker} style={styles.backBtn} hitSlop={8} accessibilityLabel="New message">
          <Plus size={20} color={colors.text.primary} weight="bold" />
        </TouchableOpacity>
      ) : (
        <View style={styles.backBtn} />
      )}
    </View>

    <View style={styles.tabRow}>
      {(['Activity', 'Messages'] as const).map((t) => (
        <TouchableOpacity
          key={t}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            setTab(t);
          }}
          style={[
            styles.tabPill,
            {
              backgroundColor: tab === t ? colors.brand.purple + '1A' : 'transparent',
              borderColor: tab === t ? colors.brand.purple : colors.background.cardBorder,
            },
          ]}
        >
          <Text style={[styles.tabPillText, { color: tab === t ? colors.brand.purple : colors.text.tertiary }]}>
            {t}
          </Text>
        </TouchableOpacity>
      ))}
    </View>

    {tab === 'Activity' ? (
      isLoading ? (
        <View style={styles.list}>
          {[0, 1, 2].map((i) => <SkeletonListRow key={i} />)}
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.empty}>
          <EmptyState
            icon={Bell}
            title="Your activity lives here"
            description="Likes, comments, and trip invites from other travelers will appear here."
            actionLabel="Find travelers to follow"
            actionIcon={Compass}
            onAction={() => router.navigate('/(tabs)/explore')}
            actionHaptic="light"
          />
        </View>
      ) : (
        <FlashList
          data={notifications}
          keyExtractor={(n) => n.id}
          renderItem={renderItem}
          contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: insets.bottom + Spacing['6'] }}
        />
      )
    ) : threadsLoading ? (
      <View style={styles.list}>
        {[0, 1, 2].map((i) => <SkeletonListRow key={i} />)}
      </View>
    ) : threads.length === 0 ? (
      <View style={styles.empty}>
        <EmptyState
          icon={ChatCircleDots}
          title="No messages yet"
          description="Start a conversation with a friend who follows you back."
          actionLabel="New message"
          onAction={handleOpenPicker}
          actionHaptic="light"
        />
      </View>
    ) : (
      <FlashList
        data={threads}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: insets.bottom + Spacing['6'] }}
        renderItem={({ item }) => {
          const otherUids = item.participants.filter((uid) => uid !== myUid);
          const name =
            item.type === 'direct'
              ? profiles[otherUids[0]]?.name ?? 'Traveler'
              : formatGroupName(otherUids.map((uid) => profiles[uid]?.name ?? 'Traveler'));
          return (
            <TouchableOpacity
              style={[styles.row, { borderColor: colors.background.cardBorder }]}
              onPress={() => handleThreadPress(item.id)}
              activeOpacity={0.7}
            >
              <Avatar uri={item.type === 'direct' ? profiles[otherUids[0]]?.avatarUrl : null} name={name} size="sm" />
              <View style={styles.rowText}>
                <Text style={[styles.rowBody, { color: colors.text.primary, fontWeight: item.unread ? FontWeight.bold : FontWeight.regular }]} numberOfLines={1}>
                  {name}
                </Text>
                <Text style={[styles.rowTime, { color: colors.text.tertiary }]} numberOfLines={1}>
                  {item.lastMessageText ?? 'Say hello'}
                </Text>
              </View>
              {item.unread && <View style={[styles.unreadDot, { backgroundColor: colors.brand.purple }]} />}
            </TouchableOpacity>
          );
        }}
      />
    )}

    <FriendPickerSheet visible={pickerVisible} onClose={() => setPickerVisible(false)} onCreated={handleThreadCreated} />
  </View>
);
```

Add these styles to the existing `StyleSheet.create` call:

```ts
tabRow: {
  flexDirection: 'row',
  gap: Spacing['2'],
  paddingHorizontal: Spacing['4'],
  paddingVertical: Spacing['3'],
},
tabPill: {
  paddingHorizontal: Spacing['4'],
  paddingVertical: Spacing['2'],
  borderRadius: BorderRadius.full,
  borderWidth: StyleSheet.hairlineWidth,
},
tabPillText: {
  fontSize: FontSize.sm,
  fontWeight: FontWeight.semiBold,
},
unreadDot: {
  width: 8,
  height: 8,
  borderRadius: 4,
  alignSelf: 'center',
},
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the app and exercise both tabs manually**

Run: `npx expo start --dev-client` (or the EAS dev-client workflow this
project uses — see the memory note on local Xcode being too old for a plain
simulator build), open the app, sign in, tap the heart icon.
Verify: the segmented control shows Activity/Messages; Activity shows
existing trip-invite rows without errors; Messages shows the empty state
(no threads exist yet — later tasks create them) with a working "+"/empty
state action that opens `FriendPickerSheet`.

Run the `supernova-design` skill's pre-ship checklist against this screen's
changes before considering the task done.

- [ ] **Step 4: Commit**

```bash
git add app/notifications.tsx
git commit -m "feat(dm): add Activity/Messages tabs to the notifications screen"
```

---

### Task 18: "Message" button on `app/user/[uid].tsx`

**Files:**
- Modify: `app/user/[uid].tsx`

**Interfaces:**
- Consumes: `useIsFriend` (Task 9), `useCreateDmThread` (Task 10).

- [ ] **Step 1: Add the button**

Add imports:

```ts
import { useIsFriend } from '@/hooks/useIsFriend';
import { useCreateDmThread } from '@/hooks/useDmThreads';
import { ChatCircleDots } from 'phosphor-react-native';
```

Add hooks and a handler inside `UserProfileScreen`, near the existing
`usePublicProfile`/`useFollow` calls:

```ts
const { data: isFriend = false } = useIsFriend(uid ?? null);
const createThread = useCreateDmThread();

const handleMessage = useCallback(() => {
  if (!uid) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  createThread.mutate([uid], {
    onSuccess: (result) => router.push(`/messages/${result.threadId}`),
  });
}, [uid, createThread]);
```

In the action-row JSX (`app/user/[uid].tsx:250-264`), the `Follow`/`Following`
branch for non-own profiles — wrap it to add the Message button alongside,
only rendered when `isFriend` is true (no disabled state for non-friends, it
simply doesn't render):

```tsx
) : (
  <View style={{ flexDirection: 'row', gap: Spacing['3'], justifyContent: 'center' }}>
    {isFollowing ? (
      <Button label="Following" variant="secondary" size="md" onPress={handleUnfollow} />
    ) : (
      <Button label="Follow" variant="primary" size="md" onPress={handleFollow} />
    )}
    {isFriend && (
      <Button label="Message" variant="secondary" size="md" icon={ChatCircleDots} onPress={handleMessage} />
    )}
  </View>
)}
```

(This replaces the existing `isFollowing ? <Button .../> : <Button .../>`
two-branch structure at that location with the wrapped version above —
same two buttons, now inside a shared row `View` alongside the new one.)

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the app and verify manually**

Sign in as two different mutual-follow test accounts (or one account viewing
a profile it already mutually follows). Verify: the "Message" button appears
only when mutual-follow is true, not for one-way follows or strangers; tapping
it navigates to a new (or existing) DM thread.

- [ ] **Step 4: Commit**

```bash
git add app/user/\[uid\].tsx
git commit -m "feat(dm): add Message button to public profiles for mutual friends"
```

---

### Task 19: Heart-icon badge on the feed header

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes: `useHasUnreadActivity` (Task 13).

- [ ] **Step 1: Add the badge**

Add the import:

```ts
import { useHasUnreadActivity } from '@/hooks/useUnreadActivity';
```

Add the hook call inside `FeedScreen`, near the existing `useFeed` call:

```ts
const { data: hasUnread = false } = useHasUnreadActivity();
```

Wrap the existing Heart `TouchableOpacity` (`app/(tabs)/index.tsx`, inside
the header, currently ending with `<Heart size={24} .../>`) to add a badge
dot positioned over it:

```tsx
<TouchableOpacity
  style={styles.headerBtn}
  onPress={handleNotificationsPress}
  activeOpacity={0.7}
  hitSlop={6}
  accessibilityLabel="Notifications"
>
  <View>
    <Heart size={24} color={hasContent ? '#fff' : colors.text.primary} weight="bold" />
    {hasUnread && <View style={styles.unreadBadge} />}
  </View>
</TouchableOpacity>
```

Add to the existing `StyleSheet.create` call:

```ts
unreadBadge: {
  position: 'absolute',
  top: -1,
  right: -1,
  width: 9,
  height: 9,
  borderRadius: 4.5,
  backgroundColor: '#f472b6',
  borderWidth: 1.5,
  borderColor: 'rgba(0,0,0,0.3)',
},
```

(The border uses a fixed translucent-black value rather than a theme color
deliberately — this badge always sits on the header's dark photo scrim or
the light empty-state canvas, same reasoning as the rest of this header's
hardcoded white/dark icon colors a few lines up, which already don't read
from `useTheme()` for the icon fills either.)

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the app and verify manually**

With an unread notification or DM present, confirm the dot appears on the
heart icon; open the Activity screen, confirm it clears (may need a
foreground refetch — `staleTime` is 30s, pull-to-refresh or re-navigate if
it doesn't clear immediately).

- [ ] **Step 4: Commit**

```bash
git add app/\(tabs\)/index.tsx
git commit -m "feat(dm): add unread badge dot to the feed's heart icon"
```

---

### Task 20: Full app smoke test

**Files:** none (verification only)

- [ ] **Step 1: Run the full typecheck and existing test suite**

Run: `npx tsc --noEmit && npx jest`
Expected: no errors, all tests pass (including the new `__tests__/utils/dm.test.ts`).

- [ ] **Step 2: Manually exercise the full flow end to end**

Using two test accounts that mutually follow each other:
1. From account A, open account B's profile, tap "Message", send a message.
2. Confirm account B receives a push (or, if testing in a simulator without
   push credentials, confirm the message appears in account B's Messages tab
   and the heart-icon badge lights up).
3. From account B, open the thread, reply, confirm account A sees it appear
   in real time without a manual refresh (this is the one `onSnapshot` path
   in this feature — if it doesn't update live, something in Task 11 is wrong).
4. From account B's Messages tab, tap "+", select 2+ friends, start a group,
   confirm the auto-generated name and that all members can see/send messages.
5. Have a third account like and comment on account A's post; confirm both
   show up as separate rows in account A's Activity tab, and the post's
   like/comment count client-side behavior is unaffected (this feature only
   adds a notification, it doesn't touch `FeedActions.tsx`'s existing
   like/comment logic).
6. Confirm a non-mutual-follow account does NOT see a "Message" button on
   either account A or B's profile, and cannot be selected in the friend
   picker.

Run the `supernova-design` skill's pre-ship checklist against every new/changed
screen in this plan (`app/notifications.tsx`, `app/messages/[threadId].tsx`,
`app/user/[uid].tsx`, `app/(tabs)/index.tsx`) before considering this task done.

- [ ] **Step 3: No commit** — this task is verification only.

---

### Task 21: Deploy (requires explicit user confirmation)

**Files:** none (deployment only)

This task deploys everything committed in Tasks 3, 4, 6, 7, and 8 to the live
`supernova-a2125` Firebase project. Per this project's operating rules,
**stop and get explicit confirmation from the user before running this task**
— do not deploy automatically just because earlier tasks passed their checks.

- [ ] **Step 1: Validate rules syntax one more time**

Use `mcp__plugin_firebase_firebase__firebase_validate_security_rules` with
`type: "firestore"` and `source_file: "firestore.rules"`.
Expected: `OK: No errors detected.`

- [ ] **Step 2: Confirm with the user, then deploy**

Ask the user to confirm before proceeding. Once confirmed:

Use `mcp__plugin_firebase_firebase__firebase_deploy` with `only: "firestore"`
(covers both rules and indexes), then again with `only: "functions"`.

For each, poll `mcp__plugin_firebase_firebase__firebase_deploy_status` with
the returned `jobId` until `status: "success"`.

- [ ] **Step 3: Verify live state matches the local files**

Use `mcp__plugin_firebase_firebase__firebase_get_security_rules` with
`type: "firestore"` and diff the output against the local `firestore.rules`
— confirm the `dmThreads` block and the updated `notifications` rule are
both present. (This project has a documented precedent for the deploy tool's
`only` parameter silently no-op'ing on a malformed target string — always
re-fetch and diff live rules after deploying, never trust the "success"
status alone.)

- [ ] **Step 4: No commit** — deployment only, nothing to commit (Tasks 3/4/6/7/8 are already committed).

---

## Self-Review Notes

**Spec coverage:** every Design Decisions row and every Data Model / Rules /
Cloud Functions / Screens & Hooks subsection of the spec maps to a task above
— mutual-friend gating (Tasks 3, 6, 9), server-side thread creation (Task 6),
direct vs. group thread ID scheme (Task 6), fixed group membership (Task 6,
no add/remove endpoint exists anywhere in this plan), auto-generated group
names (Task 2's `formatGroupName`, used in Tasks 16 and 17), real-time
messages (Task 11), inbox as `getDocs` (Task 10), push-only DM delivery
(Task 7), post like/comment notifications (Task 8), single-dot badge (Tasks
13, 19), the three-tier read-tracking split (`reads/{uid}` in Task 10/16,
`notifications.read` in Task 12, `lastMessagesSeenAt` in Task 13), text-only
≤4000 chars (enforced in the Task 3 rule and implicitly by the composer UI
in Task 16 — no separate length-limit UI was in the spec, so none was added).

**Type consistency:** `DmThread`/`DmMessage`/`AppNotification` (Task 1) are
used with identical field names throughout Tasks 6–19 — checked
`participants`, `lastMessageText`/`lastMessageAt`/`lastMessageSenderUid`,
`senderUid`/`text`/`createdAt` for exact match between the Firestore rules
(Task 3), the Cloud Functions writing these fields (Tasks 6–7), and every
client read site (Tasks 10, 11, 16, 17).

**No placeholders:** every step has complete, real code — no TBD/TODO, no
"add appropriate error handling" hand-waving, no "similar to Task N"
shortcuts (Task 17 reuses `InviteFriendsSheet`'s chrome but Task 15 writes
`FriendPickerSheet`'s full code from scratch since it's a genuinely different
component, not a copy-paste-and-modify note).
