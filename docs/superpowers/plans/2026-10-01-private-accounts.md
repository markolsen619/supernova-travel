# Private accounts and follow requests — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A traveler can make their account private: non-followers see only who they are and a Request to follow button; the owner accepts or declines; private trips and posts stop reaching non-followers.

**Architecture:** Privacy lives in the existing `users/{uid}.settings.privacy`. Going private flips the account's public trips and posts to `followers` (remembering `publicWhenAccountPublic`) — a visibility the rules, Explore, search and profiles already enforce for trips — and going public restores them and approves pending requests. Follow requests are their own collection, answered through a callable that writes the follow with the Admin SDK. Every decision is a pure, tested function (`utils/privacy.ts`, `functions/src/privacy.ts`).

**Tech Stack:** Expo SDK 54, Expo Router v6, TanStack Query, Firestore + rules, Cloud Functions v2 (onDocumentWritten/Created, onCall), Jest.

**Spec:** `docs/superpowers/specs/2026-10-01-private-accounts-design.md`

## Global Constraints

- Two-step rollout for posts: **do not tighten the posts read rule** in this plan. 1.0.1/1.0.2 feeds query without a visibility filter and would be rejected.
- Followers keep following when an account goes private; going public approves every pending request.
- A private account's `public` trips/posts become `followers` with `publicWhenAccountPublic: true` and are restored on going public. A trip or post the owner set to `followers`/`private` themselves is never touched.
- Notification types `follow_request` and `follow_accepted` carry `profileUid`; add the type to `utils/notificationRoute.ts` **and** `profileUid` to `functions/src/pushData.ts` `ID_KEYS` (separate projects).
- Every new surface showing someone else's content filters it with `useModeration()`; blocked users can't request.
- Design rules: no emoji, one primary action per screen, empty states icon + title + description + action, house spring `tension 65 / friction 11`, Light haptic on select/nav and Medium on create/accept, 44pt targets, `useTheme()` colours, sentence case.
- `where()` + `orderBy()` on different fields needs a declared composite index, deployed in the same change.
- Deploy only the functions this plan adds or changes (`--only functions:a,functions:b`).

## Review Focus

1. **Racing requests and follows.** Someone requests, then the owner goes public before answering → they become a follower exactly once, counts +1 once (not twice when the callable and the auto-approve overlap). → `privacyTransition`/`approveAll` idempotency test (Task 1) and transaction checks for an existing follow (Task 2).
2. **A trip the owner deliberately made followers-only before going private** must stay followers-only after going public again. → `privacyTransition` test (Task 1).
3. **An old app creating a post or a public trip while the author is private.** Posts get `followers` from `onPostCreatedVisibility`; a public trip is refused by the rules. → `postVisibilityOnCreate` test (Task 1).
4. **Blocking someone with a pending request** (either direction) removes the request; they can't request again. → rules + `onBlockCreated` (Task 2), `followButtonState` test (Task 1).
5. **Viewing your own private profile, or one you follow**, shows everything; only non-followers are locked. → `profileAccess` test (Task 1).

---

### Task 1: Pure privacy rules

**Files:**
- Create: `utils/privacy.ts`, `functions/src/privacy.ts`
- Test: `__tests__/utils/privacy.test.ts`, `__tests__/functions/privacy.test.ts`

**Interfaces — Produces:**
- `utils/privacy.ts`
  - `isPrivateAccount(user: { settings?: { privacy?: string } } | null | undefined): boolean`
  - `profileAccess(a: { viewerUid: string; ownerUid: string; isPrivate: boolean; viewerFollows: boolean }): 'full' | 'locked'`
  - `followButtonState(a: { isSelf: boolean; isFollowing: boolean; hasRequested: boolean; targetPrivate: boolean }): 'self' | 'following' | 'requested' | 'request' | 'follow'`
  - `publicAllowed(isPrivate: boolean): boolean` (trip visibility pickers)
- `functions/src/privacy.ts`
  - `followRequestId(requesterUid: string, targetUid: string): string` → `${requesterUid}_${targetUid}`
  - `privacyTransition(toPrivate: boolean, docs: { id: string; visibility?: string; publicWhenAccountPublic?: boolean }[]): { id: string; visibility: 'public' | 'followers'; publicWhenAccountPublic: boolean }[]`
  - `postVisibilityOnCreate(post: { visibility?: unknown }, authorPrivate: boolean): 'public' | 'followers' | null` (null = leave as is)

- [ ] **Step 1: Write the failing tests**

`__tests__/utils/privacy.test.ts`:
```ts
import { isPrivateAccount, profileAccess, followButtonState, publicAllowed } from '@/utils/privacy';

describe('isPrivateAccount', () => {
  it('reads settings.privacy, defaulting to public', () => {
    expect(isPrivateAccount({ settings: { privacy: 'private' } })).toBe(true);
    expect(isPrivateAccount({ settings: { privacy: 'public' } })).toBe(false);
    expect(isPrivateAccount({})).toBe(false);
    expect(isPrivateAccount(null)).toBe(false);
  });
});

describe('profileAccess', () => {
  const base = { viewerUid: 'me', ownerUid: 'them', isPrivate: true, viewerFollows: false };
  it('locks a private account to a non-follower', () => expect(profileAccess(base)).toBe('locked'));
  it('opens it to a follower, to its owner, and when it is public', () => {
    expect(profileAccess({ ...base, viewerFollows: true })).toBe('full');
    expect(profileAccess({ ...base, viewerUid: 'them' })).toBe('full');
    expect(profileAccess({ ...base, isPrivate: false })).toBe('full');
  });
});

describe('followButtonState', () => {
  const b = { isSelf: false, isFollowing: false, hasRequested: false, targetPrivate: false };
  it('is Follow on a public account and Request on a private one', () => {
    expect(followButtonState(b)).toBe('follow');
    expect(followButtonState({ ...b, targetPrivate: true })).toBe('request');
  });
  it('shows Requested while a request is pending, and Following once accepted', () => {
    expect(followButtonState({ ...b, targetPrivate: true, hasRequested: true })).toBe('requested');
    expect(followButtonState({ ...b, targetPrivate: true, isFollowing: true, hasRequested: true })).toBe('following');
  });
  it('has nothing to show on your own profile', () => expect(followButtonState({ ...b, isSelf: true, isFollowing: true })).toBe('self'));
});

describe('publicAllowed', () => {
  it('turns off Public in visibility pickers while the account is private', () => {
    expect(publicAllowed(true)).toBe(false);
    expect(publicAllowed(false)).toBe(true);
  });
});
```

`__tests__/functions/privacy.test.ts`:
```ts
import { followRequestId, privacyTransition, postVisibilityOnCreate } from '../../functions/src/privacy';

describe('followRequestId', () => {
  it('is requester_target', () => expect(followRequestId('a', 'b')).toBe('a_b'));
});

describe('privacyTransition', () => {
  const docs = [
    { id: 'pub', visibility: 'public' },
    { id: 'fol', visibility: 'followers' },               // owner chose followers-only
    { id: 'prv', visibility: 'private' },
    { id: 'old' },                                          // a post from before posts had visibility
  ];
  it('going private: public (or unset) becomes followers, remembering it was public', () => {
    expect(privacyTransition(true, docs)).toEqual([
      { id: 'pub', visibility: 'followers', publicWhenAccountPublic: true },
      { id: 'old', visibility: 'followers', publicWhenAccountPublic: true },
    ]);
  });
  it('going public: restores only what it flipped', () => {
    const flipped = [
      { id: 'pub', visibility: 'followers', publicWhenAccountPublic: true },
      { id: 'fol', visibility: 'followers' },
      { id: 'prv', visibility: 'private' },
    ];
    expect(privacyTransition(false, flipped)).toEqual([{ id: 'pub', visibility: 'public', publicWhenAccountPublic: false }]);
  });
  it('is idempotent — running it twice changes nothing the second time', () => {
    const once = privacyTransition(true, docs);
    const after = docs.map((d) => once.find((u) => u.id === d.id) ?? d);
    expect(privacyTransition(true, after)).toEqual([]);
  });
});

describe('postVisibilityOnCreate', () => {
  it('fills in visibility for posts from older apps', () => {
    expect(postVisibilityOnCreate({}, false)).toBe('public');
    expect(postVisibilityOnCreate({}, true)).toBe('followers');
  });
  it('makes a public post followers-only when its author is private, and leaves the rest', () => {
    expect(postVisibilityOnCreate({ visibility: 'public' }, true)).toBe('followers');
    expect(postVisibilityOnCreate({ visibility: 'public' }, false)).toBeNull();
    expect(postVisibilityOnCreate({ visibility: 'followers' }, false)).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx jest __tests__/utils/privacy.test.ts __tests__/functions/privacy.test.ts` → FAIL (modules missing).

- [ ] **Step 3: Implement**

`utils/privacy.ts`:
```ts
/** Private accounts — the app's rules, pure and tested. Server side: functions/src/privacy.ts. */
export function isPrivateAccount(user: { settings?: { privacy?: string } } | null | undefined): boolean {
  return user?.settings?.privacy === 'private';
}

/** A private account is locked to everyone but its owner and its followers. */
export function profileAccess(a: { viewerUid: string; ownerUid: string; isPrivate: boolean; viewerFollows: boolean }): 'full' | 'locked' {
  if (!a.isPrivate || a.viewerFollows || (a.viewerUid && a.viewerUid === a.ownerUid)) return 'full';
  return 'locked';
}

export type FollowButtonState = 'self' | 'following' | 'requested' | 'request' | 'follow';

export function followButtonState(a: { isSelf: boolean; isFollowing: boolean; hasRequested: boolean; targetPrivate: boolean }): FollowButtonState {
  if (a.isSelf) return 'self';
  if (a.isFollowing) return 'following';
  if (a.targetPrivate) return a.hasRequested ? 'requested' : 'request';
  return 'follow';
}

/** While private, trips can't be made Public (the rules refuse it too). */
export function publicAllowed(isPrivate: boolean): boolean {
  return !isPrivate;
}
```

`functions/src/privacy.ts`:
```ts
/** Private accounts — pure server rules, unit-tested; I/O in privacyFunctions.ts. */
export function followRequestId(requesterUid: string, targetUid: string): string {
  return `${requesterUid}_${targetUid}`;
}

type Vis = { id: string; visibility?: string; publicWhenAccountPublic?: boolean };

/**
 * Trips and posts to change when an account changes privacy. Going private,
 * public ones (and posts from before posts had a visibility) become
 * followers-only, remembering it. Going public, only those come back — a
 * trip the owner chose to keep followers-only stays that way.
 */
export function privacyTransition(toPrivate: boolean, docs: Vis[]): { id: string; visibility: 'public' | 'followers'; publicWhenAccountPublic: boolean }[] {
  if (toPrivate) {
    return docs
      .filter((d) => d.visibility === 'public' || d.visibility === undefined)
      .map((d) => ({ id: d.id, visibility: 'followers' as const, publicWhenAccountPublic: true }));
  }
  return docs
    .filter((d) => d.publicWhenAccountPublic === true && d.visibility === 'followers')
    .map((d) => ({ id: d.id, visibility: 'public' as const, publicWhenAccountPublic: false }));
}

/** What a newly created post's visibility should become; null leaves it. */
export function postVisibilityOnCreate(post: { visibility?: unknown }, authorPrivate: boolean): 'public' | 'followers' | null {
  if (post.visibility === undefined || post.visibility === null) return authorPrivate ? 'followers' : 'public';
  if (post.visibility === 'public' && authorPrivate) return 'followers';
  return null;
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat: private account rules (pure)"`

---

### Task 2: Server — requests, privacy changes, rules, backfill

**Files:**
- Create: `functions/src/privacyFunctions.ts`
- Modify: `functions/src/index.ts`, `functions/src/pushData.ts` (`ID_KEYS` + `'profileUid'`), `functions/src/moderationEvents.ts` (`onBlockCreated`), `functions/src/deleteAccount.ts`, `firestore.rules`, `firestore.indexes.json`
- Test: `__tests__/functions/pushData.test.ts` (one case)

**Interfaces — Consumes:** Task 1 `followRequestId`, `privacyTransition`, `postVisibilityOnCreate`. **Produces:** callable `respondToFollowRequest({ requesterUid: string; accept: boolean }) → { status: 'accepted' | 'declined' | 'gone' }`; notifications `follow_request { profileUid, requesterName, requesterAvatarUrl }` and `follow_accepted { profileUid, accepterName, accepterAvatarUrl }`.

- [ ] **Step 1: pushData test (RED)** — add to `__tests__/functions/pushData.test.ts`:
```ts
it('carries profileUid so a follow request opens the right profile', () => {
  expect(pushDataFor({ type: 'follow_request', profileUid: 'u1', requesterName: 'Ana' })).toEqual({ type: 'follow_request', profileUid: 'u1' });
});
```
Run → FAIL. Add `'profileUid'` to `ID_KEYS` → PASS.

- [ ] **Step 2: `functions/src/privacyFunctions.ts`**

```ts
import * as admin from 'firebase-admin';
import { onDocumentCreated, onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { notifyUser } from './notify';
import { followRequestId, privacyTransition, postVisibilityOnCreate } from './privacy';

const db = admin.firestore();
const isPrivate = (u: FirebaseFirestore.DocumentData | undefined) => u?.settings?.privacy === 'private';

/** Creates follower→followee once (no-op if it exists), keeping both counts right. */
async function createFollow(followerUid: string, followeeUid: string): Promise<boolean> {
  return db.runTransaction(async (tx) => {
    const followRef = db.doc(`follows/${followerUid}_${followeeUid}`);
    const [follow, follower, followee] = await Promise.all([
      tx.get(followRef), tx.get(db.doc(`users/${followerUid}`)), tx.get(db.doc(`users/${followeeUid}`)),
    ]);
    tx.delete(db.doc(`followRequests/${followRequestId(followerUid, followeeUid)}`));
    if (follow.exists || !follower.exists || !followee.exists) return false;
    tx.set(followRef, { followerUid, followeeUid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    tx.update(follower.ref, { followingCount: (follower.data()?.followingCount ?? 0) + 1 });
    tx.update(followee.ref, { followersCount: (followee.data()?.followersCount ?? 0) + 1 });
    return true;
  });
}

async function notifyAccepted(requesterUid: string, targetUid: string) {
  const t = (await db.doc(`users/${targetUid}`).get()).data() ?? {};
  const name = t.fullName ?? t.displayName ?? 'A traveler';
  await notifyUser(requesterUid, {
    notification: { type: 'follow_accepted', profileUid: targetUid, accepterName: name, accepterAvatarUrl: t.avatarUrl ?? null },
    push: { title: 'Request accepted', body: `${name} accepted your follow request` },
  });
}

export const onFollowRequestCreated = onDocumentCreated('followRequests/{id}', async (event) => {
  const r = event.data?.data();
  if (!r) return;
  await notifyUser(r.targetUid, {
    notification: { type: 'follow_request', profileUid: r.requesterUid, requesterName: r.requesterName ?? 'A traveler', requesterAvatarUrl: r.requesterAvatarUrl ?? null },
    push: { title: 'Follow request', body: `${r.requesterName ?? 'Someone'} wants to follow you` },
  });
});

export const respondToFollowRequest = onCall(async (req) => {
  const targetUid = req.auth?.uid;
  if (!targetUid) throw new HttpsError('unauthenticated', 'Sign in first.');
  const { requesterUid, accept } = (req.data ?? {}) as { requesterUid?: string; accept?: boolean };
  if (typeof requesterUid !== 'string' || !requesterUid || typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'requesterUid and accept are required.');
  const reqRef = db.doc(`followRequests/${followRequestId(requesterUid, targetUid)}`);
  if (!(await reqRef.get()).exists) return { status: 'gone' };
  // The request notification is answered either way.
  const notes = await db.collection(`users/${targetUid}/notifications`).where('type', '==', 'follow_request').where('profileUid', '==', requesterUid).get();
  await Promise.all(notes.docs.map((d) => d.ref.delete()));
  if (!accept) { await reqRef.delete(); return { status: 'declined' }; }
  if (await createFollow(requesterUid, targetUid)) await notifyAccepted(requesterUid, targetUid);
  return { status: 'accepted' };
});

/** Going private flips public trips/posts to followers; going public restores them and approves every pending request. */
export const onUserPrivacyChanged = onDocumentWritten('users/{uid}', async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!after || isPrivate(before) === isPrivate(after)) return;
  const { uid } = event.params;
  const toPrivate = isPrivate(after);
  for (const [col, field] of [['trips', 'authorUid'], ['posts', 'authorUid']] as const) {
    const snap = await db.collection(col).where(field, '==', uid).get();
    const changes = privacyTransition(toPrivate, snap.docs.map((d) => ({ id: d.id, ...d.data() } as never)));
    const w = db.bulkWriter();
    changes.forEach((c) => w.update(db.doc(`${col}/${c.id}`), { visibility: c.visibility, publicWhenAccountPublic: c.publicWhenAccountPublic }));
    await w.close();
  }
  if (!toPrivate) {
    const pending = await db.collection('followRequests').where('targetUid', '==', uid).get();
    for (const p of pending.docs) {
      if (await createFollow(p.data().requesterUid, uid)) await notifyAccepted(p.data().requesterUid, uid);
    }
  }
});

/** Posts from apps up to 1.0.2 have no visibility; a private author's posts start followers-only. */
export const onPostCreatedVisibility = onDocumentCreated('posts/{postId}', async (event) => {
  const post = event.data?.data();
  if (!post) return;
  const author = (await db.doc(`users/${post.authorUid}`).get()).data();
  const next = postVisibilityOnCreate(post, isPrivate(author));
  if (next) await event.data!.ref.update({ visibility: next, ...(next === 'followers' && post.visibility !== 'followers' ? { publicWhenAccountPublic: true } : {}) });
});
```
Export the four from `functions/src/index.ts`. In `onBlockCreated` (moderationEvents.ts) after removing follows, delete `followRequests/${followRequestId(a,b)}` and `${followRequestId(b,a)}`. In `deleteAccount.ts`, add `db.collection('followRequests').where('requesterUid','==',uid)` and `where('targetUid','==',uid)` to the owned-docs deletes. `npm run build` → OK; `npx jest __tests__/functions` → PASS.

- [ ] **Step 3: Rules** (`firestore.rules`)
```
    function isPrivateAccount(uid) {
      return get(/databases/$(database)/documents/users/$(uid)).data.get('settings', {}).get('privacy', 'public') == 'private';
    }
```
  - `follows` create: append `&& !isPrivateAccount(request.resource.data.followeeUid)`.
  - New block:
```
    match /followRequests/{id} {
      allow read: if isAuthed() && (resource.data.requesterUid == request.auth.uid || resource.data.targetUid == request.auth.uid);
      allow create: if isAuthed()
        && request.resource.data.requesterUid == request.auth.uid
        && request.resource.data.targetUid is string
        && request.resource.data.targetUid != request.auth.uid
        && id == request.auth.uid + '_' + request.resource.data.targetUid
        && isPrivateAccount(request.resource.data.targetUid)
        && !exists(/databases/$(database)/documents/follows/$(request.auth.uid + '_' + request.resource.data.targetUid))
        && !hasBlocked(request.resource.data.targetUid, request.auth.uid)
        && !hasBlocked(request.auth.uid, request.resource.data.targetUid);
      allow delete: if isAuthed() && (resource.data.requesterUid == request.auth.uid || resource.data.targetUid == request.auth.uid);
      allow update: if false;
    }
```
  - `trips` create and update: append `&& !(request.resource.data.visibility == 'public' && isPrivateAccount(request.resource.data.authorUid))`.
  - `posts` create/update: append `&& (!request.resource.data.keys().hasAny(['visibility']) || request.resource.data.visibility in ['public', 'followers'])`.
  - Index: `posts(visibility ASC, createdAt DESC)` in `firestore.indexes.json`.
  - `npx firebase deploy --only firestore:rules --dry-run` → compiled.

- [ ] **Step 4: Backfill, deploy, commit**
  - Admin script: every `posts` doc without `visibility` gets `'public'` (no user is private yet). Report count.
  - `npx firebase deploy --only firestore:rules,firestore:indexes,functions:onFollowRequestCreated,functions:respondToFollowRequest,functions:onUserPrivacyChanged,functions:onPostCreatedVisibility,functions:onBlockCreated,functions:deleteAccount`
  - Commit: `feat: follow requests and private accounts — server`.

---

### Task 3: App data layer

**Files:**
- Modify: `types/index.ts` (`UserProfile.settings?: { privacy?: 'public' | 'private' }`, `Post.visibility?`, notification types `FollowRequestNotification`/`FollowAcceptedNotification`), the profile mappers (`usePublicProfile`/`useUserProfile` — pass `settings` through), `hooks/useFollow.ts`, `hooks/useFeed.ts`, `components/profile/PostsGrid.tsx`, `utils/notificationRoute.ts`, `hooks/useCreatePost.ts` (write `visibility`)
- Create: `hooks/useFollowRequests.ts`
- Test: `__tests__/utils/notificationRoute.test.ts`

**Interfaces — Produces:** `useFollowRequest(targetUid): { hasRequested: boolean; request(): Promise<void>; cancel(): Promise<void> }`; `useRespondToFollowRequest()` mutation `{ requesterUid, accept }`.

- [ ] **Step 1: Route test (RED)**
```ts
describe('follow notifications', () => {
  it('open the profile', () => {
    expect(resolveNotificationRoute({ type: 'follow_request', profileUid: 'u1' })).toBe('/user/u1');
    expect(resolveNotificationRoute({ type: 'follow_accepted', profileUid: 'u1' })).toBe('/user/u1');
  });
});
```
→ add both to `ROUTES` with `idKey: 'profileUid'` → PASS.

- [ ] **Step 2: `hooks/useFollowRequests.ts`**
```ts
// useFollowRequest(targetUid): reads followRequests/{me}_{target} (getDoc; queryKey ['followRequest', me, target]);
// request() → setDoc with { requesterUid: me, targetUid, requesterName, requesterAvatarUrl, createdAt: serverTimestamp() }
//   (name/avatar from useUserStore's cached profile); cancel() → deleteDoc; both invalidate the key.
// useRespondToFollowRequest(): httpsCallable(functions, 'respondToFollowRequest'); onSuccess invalidates
//   ['notifications'], ['userProfile', me], ['connections', me, 'followers'].
```
- [ ] **Step 3:** `useFeed` both queries add `where('visibility', '==', 'public')` before `orderBy('createdAt', 'desc')` (index from Task 2). `useCreatePost` writes `visibility: isPrivateAccount(myProfile) ? 'followers' : 'public'` (+ `publicWhenAccountPublic: true` when followers). `PostsGrid` takes `access: 'own' | 'follower' | 'public'`: own → current query; follower → two queries (`visibility in public` and `followers`, each with `authorUid` + `orderBy createdAt`, merged by date) — add index `posts(authorUid, visibility, createdAt desc)`; public → `visibility == 'public'` only.
- [ ] **Step 4:** `npx tsc --noEmit`, `npx jest` → clean/pass. Commit `feat: follow requests and private posts — app data`.

---

### Task 4: App screens

**Files:** `app/settings/privacy.tsx`, `app/user/[uid].tsx`, `components/explore/UserSuggestion.tsx`, `app/notifications.tsx`, `app/connections/[uid].tsx`, `components/trip/EditTripSheet.tsx`, `components/trip/AiPromptForm.tsx`, `app/trip/new.tsx`, `CLAUDE.md`

- [ ] **Settings → Privacy:** a "Private account" row with a `Switch` (`trackColor` brand purple) and the line "Only followers you approve see your trips and posts. People who already follow you keep following." Toggling on: `Alert` confirm ("Make your account private?" / "Your public trips and posts become visible to followers only."), then `updateDoc(users/{me}, { 'settings.privacy': 'private' })`; off: confirm "Anyone waiting to follow you will be approved." Medium haptic on confirm; optimistic with revert on error.
- [ ] **Profile (`app/user/[uid].tsx`):** compute `access = profileAccess(...)` with `isPrivateAccount(profile)`. Locked: keep header (avatar, name, @username, bio, counts — the counts' onPress disabled), replace the tabs with a card: `LockSimple` duotone 28 in `text.disabled`, title "This account is private", body "Follow {firstName} to see their trips and posts.", and the follow button. Follow button label from `followButtonState`: Follow / Request to follow (primary) / Requested (secondary; tap → cancel with Light haptic) / Following (existing unfollow). Also skip the trips/posts queries while locked.
- [ ] **UserSuggestion:** same state machine for its button (Follow / Request / Requested).
- [ ] **Notifications:** `follow_request` row like `trip_invite` (avatar, "**{name}** wants to follow you", Accept primary + Decline; result text "You accepted" / "Declined"); `follow_accepted` row ("**{name}** accepted your follow request", tap → profile). `canDeleteNotification` keeps a pending `follow_request` like a pending trip invite.
- [ ] **Connections screen:** when the profile is private and locked for you, show `EmptyState` (`LockSimple`, "This account is private", "Follow {name} to see who they follow and who follows them.", action "Back").
- [ ] **Visibility pickers** (EditTripSheet, AiPromptForm, trip/new): when `!publicAllowed(isPrivateAccount(me))`, Public is disabled with the hint "Your account is private — trips are visible to followers"; a new trip's default becomes Followers.
- [ ] **CLAUDE.md:** private accounts section (data, functions, the step-2 posts rule TODO).
- [ ] `npx tsc --noEmit`, `npx jest`, `npm run lint` → clean. Commit `feat: private accounts — settings, locked profiles, follow requests`.

---

### Task 5: Review, merge, TestFlight

- [ ] Whole-branch review (fresh reviewer, plan Review Focus), fix pass with tests.
- [ ] Merge `fix/privacy-and-polish` to `main`, push; build iOS production (1.0.2, next build number), submit to TestFlight.
