# Trip Invite Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Invite people to a trip by a single-use text/email link (web page → store → sign-up → on the trip), make inviting free, keep budget splitting Pro, and offer Invite from Home and Profile trip cards.

**Architecture:** Server-only `tripInviteLinks/{token}` docs created/accepted by callables (pure rules in `functions/src/tripInviteLinks.ts`); Hosting `/join/**` → `joinPage` renders the web invite; universal/App Links open `app/join/[token]`, which previews and joins. A pending token in AsyncStorage (saved by the join screen when signed out, by the Android Play install referrer, or by a Home Paste card) is claimed by a tabs-layout hook once signed in: auto-join for accounts < 24 h old, otherwise the join screen asks.

**Tech Stack:** Expo Router v6, React Native, Firebase Functions v2 (TypeScript), Firestore, Firebase Hosting, AsyncStorage, `expo-application` (`getInstallReferrerAsync`), `expo-clipboard`, RN `Share`, Jest.

**Spec:** `docs/superpowers/specs/2026-10-30-trip-invite-links-design.md`

## Global Constraints

- Token: 16 × `a-z0-9`, from `crypto.randomBytes`; never readable by clients (no Firestore rule for `tripInviteLinks` = denied).
- Link: single use, expires 30 days after creation, cancellable; inviter must still be owner/collaborator when used; blocks respected both ways.
- Limits: ≤ 20 open unexpired links per trip; ≤ 50 created per inviter per UTC day.
- URL: `https://supernova-a2125.web.app/join/{token}`. Message: `{First name} invited you to {trip title} on Supernova. Join the trip: {url}`.
- Play link: `https://play.google.com/store/apps/details?id=com.supernovatravel.app&referrer=invite%3D{token}`; App Store: `https://apps.apple.com/app/id6810490710`.
- Page and preview show only inviter first name, trip title, dates, key-less cover. Everything HTML-escaped. `Cache-Control: no-store`.
- Inviting is free (remove `inviteToTrip`'s Pro check). Budget chip → `requirePro`. Paywall "Travel together" → "Split a trip budget" / "Track a shared budget and split costs with your group".
- Copy voice: sentence case, no "!", no "please/successfully". No emoji. Touch targets ≥ 44 pt, icon buttons have `accessibilityLabel`. Colors via `useTheme()`; `StyleSheet.create` has no theme colors.
- Clipboard read only on the user's tap.
- Run the supernova-design pre-ship checklist on UI tasks.

## Review Focus

1. Cold start from a universal link while signed in: the auth listener's `router.replace('/(tabs)')` discards `/join/{token}` — the token must survive (join screen saves it before auth settles; claim hook re-opens it). Test: `claimRoute` returns the confirm route for an old account.
2. Two people race the same link — exactly one joins (transaction). Test: `linkDecision` on a `used` link → `expired`; accept runs in `db.runTransaction`.
3. Someone already on the trip opens a link — opens the trip, link stays usable for the real invitee. Test: `linkDecision` → `member` before status checks.
4. Inviter left the trip or the trip was deleted — link reads as expired, never adds anyone. Test: `linkDecision` with `inviterOnTrip: false` / `tripExists: false`.
5. A pasted string that isn't our link (other host, `/trip/…`, wrong token length, query junk) is ignored. Test: `parseInviteToken` cases.

---

### Task 1: Pure invite-link rules and the web page

**Files:**
- Create: `functions/src/tripInviteLinks.ts`
- Test: `__tests__/functions/tripInviteLinks.test.ts`

**Interfaces:**
- Produces:
  - `INVITE_TTL_MS = 30 * 86_400_000`, `MAX_OPEN_PER_TRIP = 20`, `MAX_PER_DAY = 50`
  - `makeToken(bytes: Uint8Array): string | null` (16 chars a-z0-9 using bytes < 252 → `b % 36`; null if too few usable bytes)
  - `isToken(s: unknown): s is string` (`/^[a-z0-9]{16}$/`)
  - `inviteUrl(token: string): string`, `playStoreUrl(token: string): string`, `APP_STORE_URL`
  - `firstName(full: unknown): string` (first word, else `'A friend'`)
  - `inviteMessage(inviterFirst: string, tripTitle: string, url: string): string`
  - `type InviteLink = { tripId: string; inviterUid: string; status: 'open' | 'used' | 'cancelled'; expiresAtMs: number }`
  - `linkDecision(i: { link: InviteLink | null; nowMs: number; tripExists: boolean; inviterOnTrip: boolean; callerUid: string; callerIsMember: boolean; blocked: boolean }): 'join' | 'member' | 'expired' | 'self' | 'blocked'`
  - `canCreateLink(openForTrip: number, createdToday: number): boolean`
  - `utcDay(ms: number): string` (`YYYY-MM-DD`)
  - `tokenFromJoinPath(path: string): string | null` (`/join/{token}` with optional trailing slash)
  - `renderJoinPage(invite: { token: string; inviterFirst: string; tripTitle: string; dates: string | null; coverUrl: string | null } | null, opts: { inviterFirst?: string | null }): string`
  - `formatTripDates(start: Date | null, end: Date | null): string | null` (`MAY 3 – 9`, `MAY 30 – JUN 2`, uppercase, UTC)

- [ ] **Step 1: Write the failing tests**

```ts
import {
  makeToken, isToken, inviteUrl, playStoreUrl, firstName, inviteMessage, linkDecision, canCreateLink,
  utcDay, tokenFromJoinPath, renderJoinPage, formatTripDates, INVITE_TTL_MS,
} from '../../functions/src/tripInviteLinks';

const link = (o: Partial<{ status: 'open' | 'used' | 'cancelled'; expiresAtMs: number }> = {}) =>
  ({ tripId: 't1', inviterUid: 'inviter', status: 'open' as const, expiresAtMs: 2_000, ...o });
const base = { link: link(), nowMs: 1_000, tripExists: true, inviterOnTrip: true, callerUid: 'friend', callerIsMember: false, blocked: false };

describe('makeToken', () => {
  it('makes 16 lowercase letters/digits and skips biased bytes', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i === 0 ? 255 : i));
    const t = makeToken(bytes)!;
    expect(t).toMatch(/^[a-z0-9]{16}$/);
    expect(t[0]).toBe('1'); // byte 255 skipped, byte 1 → '1'
  });
  it('returns null when there are not enough usable bytes', () => {
    expect(makeToken(new Uint8Array(16).fill(253))).toBeNull();
  });
});

describe('isToken / tokenFromJoinPath', () => {
  it('accepts exactly 16 lowercase alphanumerics', () => {
    expect(isToken('abcdefgh12345678')).toBe(true);
    expect(isToken('ABCDEFGH12345678')).toBe(false);
    expect(isToken('abc')).toBe(false);
    expect(isToken(42)).toBe(false);
  });
  it('reads /join/{token} only', () => {
    expect(tokenFromJoinPath('/join/abcdefgh12345678')).toBe('abcdefgh12345678');
    expect(tokenFromJoinPath('/join/abcdefgh12345678/')).toBe('abcdefgh12345678');
    expect(tokenFromJoinPath('/join/<script>')).toBeNull();
    expect(tokenFromJoinPath('/trip/abcdefgh12345678')).toBeNull();
  });
});

describe('urls and message', () => {
  it('builds the join, Play and message text', () => {
    expect(inviteUrl('abcdefgh12345678')).toBe('https://supernova-a2125.web.app/join/abcdefgh12345678');
    expect(playStoreUrl('abcdefgh12345678')).toBe('https://play.google.com/store/apps/details?id=com.supernovatravel.app&referrer=invite%3Dabcdefgh12345678');
    expect(inviteMessage('Mark', 'Lisbon', 'https://x/join/a')).toBe('Mark invited you to Lisbon on Supernova. Join the trip: https://x/join/a');
  });
  it('uses the first word of a name, else A friend', () => {
    expect(firstName('Mark Olsen')).toBe('Mark');
    expect(firstName('  ')).toBe('A friend');
    expect(firstName(null)).toBe('A friend');
  });
});

describe('linkDecision', () => {
  it('joins an open, unexpired link', () => expect(linkDecision(base)).toBe('join'));
  it('a member just opens the trip, before any link check', () => {
    expect(linkDecision({ ...base, callerIsMember: true, link: link({ status: 'used' }) })).toBe('member');
  });
  it('used, cancelled, expired, missing link → expired', () => {
    expect(linkDecision({ ...base, link: link({ status: 'used' }) })).toBe('expired');
    expect(linkDecision({ ...base, link: link({ status: 'cancelled' }) })).toBe('expired');
    expect(linkDecision({ ...base, nowMs: 2_000 })).toBe('expired');
    expect(linkDecision({ ...base, link: null })).toBe('expired');
  });
  it('inviter left or trip gone → expired', () => {
    expect(linkDecision({ ...base, inviterOnTrip: false })).toBe('expired');
    expect(linkDecision({ ...base, tripExists: false, callerIsMember: false })).toBe('expired');
  });
  it('the inviter themself, and blocks', () => {
    expect(linkDecision({ ...base, callerUid: 'inviter' })).toBe('self');
    expect(linkDecision({ ...base, blocked: true })).toBe('blocked');
  });
});

describe('limits and days', () => {
  it('allows up to 20 open per trip and 50 a day', () => {
    expect(canCreateLink(19, 49)).toBe(true);
    expect(canCreateLink(20, 0)).toBe(false);
    expect(canCreateLink(0, 50)).toBe(false);
  });
  it('utcDay and the ttl', () => {
    expect(utcDay(Date.UTC(2026, 9, 30, 23, 59))).toBe('2026-10-30');
    expect(INVITE_TTL_MS).toBe(30 * 86_400_000);
  });
});

describe('formatTripDates', () => {
  it('same month, across months, none', () => {
    expect(formatTripDates(new Date(Date.UTC(2026, 4, 3)), new Date(Date.UTC(2026, 4, 9)))).toBe('MAY 3 – 9');
    expect(formatTripDates(new Date(Date.UTC(2026, 4, 30)), new Date(Date.UTC(2026, 5, 2)))).toBe('MAY 30 – JUN 2');
    expect(formatTripDates(null, null)).toBeNull();
  });
});

describe('renderJoinPage', () => {
  it('escapes everything and links both stores with the referrer', () => {
    const html = renderJoinPage({ token: 'abcdefgh12345678', inviterFirst: '<b>Mark', tripTitle: 'Lisbon & "Porto"', dates: 'MAY 3 – 9', coverUrl: 'https://img/x.jpg' }, {});
    expect(html).toContain('&lt;b&gt;Mark invited you');
    expect(html).toContain('Lisbon &amp; &quot;Porto&quot;');
    expect(html).toContain('referrer=invite%3Dabcdefgh12345678');
    expect(html).toContain('https://apps.apple.com/app/id6810490710');
    expect(html).toContain('href="https://supernova-a2125.web.app/join/abcdefgh12345678"');
    expect(html).toContain('After installing, come back and tap Open in Supernova');
    expect(html).not.toContain('<b>Mark');
  });
  it('expired page names the inviter when known and has no join link', () => {
    const html = renderJoinPage(null, { inviterFirst: 'Mark' });
    expect(html).toContain('This invite has expired. Ask Mark for a new one.');
    expect(html).not.toContain('/join/');
    expect(renderJoinPage(null, {})).toContain('Ask your friend for a new one.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/functions/tripInviteLinks.test.ts`
Expected: FAIL — cannot find module `tripInviteLinks`.

- [ ] **Step 3: Implement `functions/src/tripInviteLinks.ts`**

```ts
/**
 * Trip invite links (spec 2026-10-30-trip-invite-links-design.md). Pure: no firebase-admin, so it is unit-tested;
 * `tripInviteLinkFunctions.ts` does the reads and writes. A link adds at most one person, once, within 30 days,
 * and only while its inviter is still on the trip.
 */
import { escapeHtml } from './tripPreview';

export const INVITE_TTL_MS = 30 * 86_400_000;
export const MAX_OPEN_PER_TRIP = 20;
export const MAX_PER_DAY = 50;
const HOST = 'https://supernova-a2125.web.app';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6810490710';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 16 × a-z0-9 from random bytes; bytes ≥ 252 are skipped so every character is equally likely. */
export function makeToken(bytes: Uint8Array): string | null {
  let out = '';
  for (const b of bytes) {
    if (b >= 252) continue;
    out += ALPHABET[b % 36];
    if (out.length === 16) return out;
  }
  return null;
}

export const isToken = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{16}$/.test(s);
export const inviteUrl = (token: string) => `${HOST}/join/${token}`;
export const playStoreUrl = (token: string) =>
  `https://play.google.com/store/apps/details?id=com.supernovatravel.app&referrer=${encodeURIComponent(`invite=${token}`)}`;

export function firstName(full: unknown): string {
  const w = typeof full === 'string' ? full.trim().split(/\s+/)[0] : '';
  return w || 'A friend';
}

export const inviteMessage = (inviterFirst: string, tripTitle: string, url: string) =>
  `${inviterFirst} invited you to ${tripTitle} on Supernova. Join the trip: ${url}`;

export type InviteLink = { tripId: string; inviterUid: string; status: 'open' | 'used' | 'cancelled'; expiresAtMs: number };

export function linkDecision(i: {
  link: InviteLink | null; nowMs: number; tripExists: boolean; inviterOnTrip: boolean;
  callerUid: string; callerIsMember: boolean; blocked: boolean;
}): 'join' | 'member' | 'expired' | 'self' | 'blocked' {
  if (i.tripExists && i.callerIsMember) return 'member';
  if (!i.link || !i.tripExists || i.link.status !== 'open' || i.nowMs >= i.link.expiresAtMs || !i.inviterOnTrip) return 'expired';
  if (i.callerUid === i.link.inviterUid) return 'self';
  if (i.blocked) return 'blocked';
  return 'join';
}

export const canCreateLink = (openForTrip: number, createdToday: number) =>
  openForTrip < MAX_OPEN_PER_TRIP && createdToday < MAX_PER_DAY;

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function tokenFromJoinPath(path: string): string | null {
  const m = /^\/join\/([a-z0-9]{16})\/?$/.exec(path);
  return m ? m[1] : null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function formatTripDates(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const s = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  if (!end) return s;
  const e = end.getUTCMonth() === start.getUTCMonth() ? `${end.getUTCDate()}` : `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${s} – ${e}`;
}

const STYLES = `
  :root { --canvas:#FBF9F5; --hairline:#E5DDD2; --text:#1F1C19; --secondary:#6B6157; --muted:#9A8F82; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--canvas); color:var(--text); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width:560px; margin:0 auto; padding:24px 20px 48px; }
  .brand { font-size:13px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); margin:0 0 20px; }
  .cover { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:20px; display:block; background:#F0EAE0; }
  .eyebrow { margin:20px 0 6px; font-size:11px; font-weight:500; letter-spacing:0.08em; color:var(--muted); }
  h1 { margin:0; font-size:28px; line-height:1.15; font-weight:600; letter-spacing:-0.02em; }
  .lede { color:var(--secondary); margin:8px 0 0; }
  .cta { display:block; margin-top:28px; padding:15px 20px; border-radius:12px; text-align:center; background:var(--text); color:var(--canvas); text-decoration:none; font-weight:600; }
  .store { display:block; margin-top:12px; padding:14px 20px; border-radius:12px; text-align:center; border:0.5px solid var(--hairline); color:var(--text); text-decoration:none; font-weight:600; }
  .note { margin-top:16px; color:var(--muted); font-size:13px; text-align:center; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body><main>
<p class="brand">Supernova</p>
${body}
</main></body>
</html>`;
}

export function renderJoinPage(
  invite: { token: string; inviterFirst: string; tripTitle: string; dates: string | null; coverUrl: string | null } | null,
  opts: { inviterFirst?: string | null },
): string {
  if (!invite) {
    const who = opts.inviterFirst ? escapeHtml(opts.inviterFirst) : 'your friend';
    return page('Invite expired · Supernova', `
<h1>This invite has expired. Ask ${who} for a new one.</h1>
<p class="lede">Supernova plans trips together: one itinerary, a shared packing list and every booking in one place.</p>
<a class="store" href="${APP_STORE_URL}">Download on the App Store</a>
<a class="store" href="https://play.google.com/store/apps/details?id=com.supernovatravel.app">Get it on Google Play</a>`);
  }
  const who = escapeHtml(invite.inviterFirst);
  const title = escapeHtml(invite.tripTitle);
  const cover = invite.coverUrl ? `<img class="cover" src="${escapeHtml(invite.coverUrl)}" alt="">` : '';
  const dates = invite.dates ? `<p class="eyebrow">${escapeHtml(invite.dates)}</p>` : '<p class="eyebrow">TRIP INVITE</p>';
  return page(`${who} invited you to ${title} · Supernova`, `
${cover}
${dates}
<h1>${who} invited you to ${title}</h1>
<p class="lede">Join the trip on Supernova to plan it together.</p>
<a class="cta" href="${escapeHtml(inviteUrl(invite.token))}">Open in Supernova</a>
<a class="store" href="${APP_STORE_URL}">Download on the App Store</a>
<a class="store" href="${escapeHtml(playStoreUrl(invite.token))}">Get it on Google Play</a>
<p class="note">On iPhone? After installing, come back and tap Open in Supernova.</p>`);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/functions/tripInviteLinks.test.ts`
Expected: PASS (all describe blocks).

- [ ] **Step 5: Commit**

```bash
git add functions/src/tripInviteLinks.ts __tests__/functions/tripInviteLinks.test.ts
git commit -m "feat(invites): pure rules and web page for trip invite links"
```

---

### Task 2: Invite-link functions, Hosting rewrite, free in-app invites, account deletion

**Files:**
- Create: `functions/src/tripInviteLinkFunctions.ts`
- Modify: `functions/src/tripPreviewFunction.ts` (export `publishableCover`)
- Modify: `functions/src/index.ts` (exports)
- Modify: `functions/src/tripInvites.ts` (remove the Pro check and the `isPaidTier` import; keep reading `inviterDoc` for the name)
- Modify: `functions/src/deleteAccount.ts` (delete caller's `tripInviteLinks`, next to the `calendarFeeds` cleanup)
- Modify: `firebase.json` (rewrite `/join/**` → `joinPage`, before `/trip/**`)
- Test: build + full suite

**Interfaces:**
- Consumes: Task 1 exports.
- Produces callables (all `region: 'us-central1'`):
  - `createTripInviteLink({ tripId }) → { token, url, message }`
  - `cancelTripInviteLinks({ tripId }) → { cancelled: number }`
  - `openTripInviteLinks({ tripId }) → { open: number }`
  - `previewTripInviteLink({ token }) → { status: 'open', inviterFirst, tripTitle, dates: string | null, coverUrl: string | null } | { status: 'expired', inviterFirst: string | null } | { status: 'member', tripId }`
  - `acceptTripInviteLink({ token }) → { status: 'joined' | 'member', tripId, inviterFirst, tripTitle }`; throws `failed-precondition` (`expired`), `permission-denied` (blocked), `invalid-argument` (self / bad token)
  - onRequest `joinPage`

- [ ] **Step 1: Write `functions/src/tripInviteLinkFunctions.ts`**

```ts
import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { notifyUser } from './notify';
import { isBlockedBetween } from './moderationEvents';
import { publishableCover } from './tripPreviewFunction';
import {
  INVITE_TTL_MS, canCreateLink, firstName, formatTripDates, inviteMessage, inviteUrl, isToken, linkDecision,
  makeToken, renderJoinPage, tokenFromJoinPath, utcDay, type InviteLink,
} from './tripInviteLinks';

const db = admin.firestore();
const onTrip = (trip: FirebaseFirestore.DocumentData | undefined, uid: string) =>
  !!trip && (trip.authorUid === uid || (trip.collaborators ?? []).includes(uid));
const toDate = (v: unknown) => (v instanceof admin.firestore.Timestamp ? v.toDate() : null);

function newToken(): string {
  for (;;) { const t = makeToken(randomBytes(32)); if (t) return t; }
}

export const createTripInviteLink = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const tripId = (req.data as { tripId?: unknown })?.tripId;
  if (typeof tripId !== 'string' || !tripId) throw new HttpsError('invalid-argument', 'tripId is required');
  const [tripSnap, userSnap] = await Promise.all([db.doc(`trips/${tripId}`).get(), db.doc(`users/${uid}`).get()]);
  const trip = tripSnap.data();
  if (!onTrip(trip, uid)) throw new HttpsError('permission-denied', "You aren't on this trip");

  const now = Date.now();
  const token = newToken();
  const counterRef = db.doc(`usage_quotas/${uid}/inviteLinks/${utcDay(now)}`);
  await db.runTransaction(async (tx) => {
    const open = await tx.get(db.collection('tripInviteLinks')
      .where('tripId', '==', tripId).where('inviterUid', '==', uid).where('status', '==', 'open'));
    const openCount = open.docs.filter((d) => (d.data().expiresAtMs ?? 0) > now).length;
    const today = (await tx.get(counterRef)).data()?.count ?? 0;
    if (!canCreateLink(openCount, today)) throw new HttpsError('resource-exhausted', 'You have made a lot of invite links. Try again tomorrow.');
    tx.set(db.doc(`tripInviteLinks/${token}`), {
      tripId, inviterUid: uid, status: 'open', createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAtMs: now + INVITE_TTL_MS, usedBy: null, usedAt: null,
    });
    tx.set(counterRef, { count: today + 1 }, { merge: true });
  });
  const url = inviteUrl(token);
  const user = userSnap.data() ?? {};
  return { token, url, message: inviteMessage(firstName(user.fullName ?? user.displayName), String(trip?.title ?? 'a trip'), url) };
});

export const cancelTripInviteLinks = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const tripId = (req.data as { tripId?: unknown })?.tripId;
  if (typeof tripId !== 'string' || !tripId) throw new HttpsError('invalid-argument', 'tripId is required');
  const open = await db.collection('tripInviteLinks')
    .where('tripId', '==', tripId).where('inviterUid', '==', uid).where('status', '==', 'open').get();
  const batch = db.batch();
  open.docs.forEach((d) => batch.update(d.ref, { status: 'cancelled' }));
  await batch.commit();
  return { cancelled: open.size };
});

export const openTripInviteLinks = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const tripId = (req.data as { tripId?: unknown })?.tripId;
  if (typeof tripId !== 'string' || !tripId) throw new HttpsError('invalid-argument', 'tripId is required');
  const now = Date.now();
  const open = await db.collection('tripInviteLinks')
    .where('tripId', '==', tripId).where('inviterUid', '==', uid).where('status', '==', 'open').get();
  return { open: open.docs.filter((d) => (d.data().expiresAtMs ?? 0) > now).length };
});

/** Everything a decision needs, read once. */
async function loadInvite(token: string, callerUid: string) {
  const linkSnap = await db.doc(`tripInviteLinks/${token}`).get();
  const link = (linkSnap.data() as InviteLink | undefined) ?? null;
  const tripSnap = link ? await db.doc(`trips/${link.tripId}`).get() : null;
  const trip = tripSnap?.data();
  const inviter = link ? (await db.doc(`users/${link.inviterUid}`).get()).data() : undefined;
  const blocked = link && link.inviterUid !== callerUid ? await isBlockedBetween(link.inviterUid, callerUid) : false;
  const decision = linkDecision({
    link, nowMs: Date.now(), tripExists: !!trip, inviterOnTrip: !!link && onTrip(trip, link.inviterUid),
    callerUid, callerIsMember: onTrip(trip, callerUid), blocked,
  });
  return { link, trip, inviter, decision, inviterFirst: inviter ? firstName(inviter.fullName ?? inviter.displayName) : null };
}

export const previewTripInviteLink = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const token = (req.data as { token?: unknown })?.token;
  if (!isToken(token)) return { status: 'expired', inviterFirst: null };
  const { link, trip, decision, inviterFirst } = await loadInvite(token, uid);
  if (decision === 'member') return { status: 'member', tripId: link!.tripId };
  if (decision !== 'join') return { status: 'expired', inviterFirst };
  const cover = await publishableCover(link!.tripId, trip!.coverImageUrl);
  return {
    status: 'open', inviterFirst: inviterFirst ?? 'A friend', tripTitle: String(trip!.title ?? 'a trip'),
    dates: formatTripDates(toDate(trip!.startDate), toDate(trip!.endDate)), coverUrl: cover?.url ?? null,
  };
});

export const acceptTripInviteLink = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const token = (req.data as { token?: unknown })?.token;
  if (!isToken(token)) throw new HttpsError('invalid-argument', 'This invite link is not valid');
  const blockedCheck = await loadInvite(token, uid); // blocks need reads outside the transaction
  if (blockedCheck.decision === 'blocked') throw new HttpsError('permission-denied', "You can't join this trip");
  if (blockedCheck.decision === 'self') throw new HttpsError('invalid-argument', 'This is your own invite link');

  const linkRef = db.doc(`tripInviteLinks/${token}`);
  const result = await db.runTransaction(async (tx) => {
    const link = ((await tx.get(linkRef)).data() as InviteLink | undefined) ?? null;
    const tripRef = link ? db.doc(`trips/${link.tripId}`) : null;
    const trip = tripRef ? (await tx.get(tripRef)).data() : undefined;
    const decision = linkDecision({
      link, nowMs: Date.now(), tripExists: !!trip, inviterOnTrip: !!link && onTrip(trip, link.inviterUid),
      callerUid: uid, callerIsMember: onTrip(trip, uid), blocked: false,
    });
    if (decision === 'member') return { status: 'member' as const, tripId: link!.tripId, title: String(trip!.title ?? 'a trip'), inviterUid: link!.inviterUid };
    if (decision !== 'join') throw new HttpsError('failed-precondition', 'expired');
    tx.update(tripRef!, { collaborators: admin.firestore.FieldValue.arrayUnion(uid) });
    tx.set(tripRef!.collection('invites').doc(uid), {
      inviterUid: link!.inviterUid, status: 'accepted', via: 'link',
      createdAt: admin.firestore.FieldValue.serverTimestamp(), respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(linkRef, { status: 'used', usedBy: uid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { status: 'joined' as const, tripId: link!.tripId, title: String(trip!.title ?? 'a trip'), inviterUid: link!.inviterUid };
  });

  if (result.status === 'joined') {
    const me = (await db.doc(`users/${uid}`).get()).data() ?? {};
    const name: string = me.fullName ?? me.displayName ?? 'A traveler';
    await notifyUser(result.inviterUid, {
      notification: { type: 'trip_invite_accepted', tripId: result.tripId, tripTitle: result.title, accepterUid: uid, accepterName: name, accepterAvatarUrl: me.avatarUrl ?? null },
      push: { title: 'Trip invite accepted', body: `${name} joined ${result.title}` },
    }).catch((e) => console.warn('acceptTripInviteLink notify failed', e));
  }
  return { status: result.status, tripId: result.tripId, inviterFirst: blockedCheck.inviterFirst ?? 'A friend', tripTitle: result.title };
});

/** Hosting `/join/**`: the invite when the app isn't installed. Never cached, so a used link reads as used at once. */
export const joinPage = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  const token = tokenFromJoinPath(req.path);
  try {
    if (!token) { res.status(200).send(renderJoinPage(null, {})); return; }
    const link = ((await db.doc(`tripInviteLinks/${token}`).get()).data() as InviteLink | undefined) ?? null;
    const trip = link ? (await db.doc(`trips/${link.tripId}`).get()).data() : undefined;
    const inviter = link ? (await db.doc(`users/${link.inviterUid}`).get()).data() : undefined;
    const inviterFirst = inviter ? firstName(inviter.fullName ?? inviter.displayName) : null;
    const decision = linkDecision({
      link, nowMs: Date.now(), tripExists: !!trip, inviterOnTrip: !!link && onTrip(trip, link.inviterUid),
      callerUid: '', callerIsMember: false, blocked: false,
    });
    if (decision !== 'join') { res.status(200).send(renderJoinPage(null, { inviterFirst })); return; }
    const cover = await publishableCover(link!.tripId, trip!.coverImageUrl);
    res.status(200).send(renderJoinPage({
      token, inviterFirst: inviterFirst ?? 'A friend', tripTitle: String(trip!.title ?? 'a trip'),
      dates: formatTripDates(toDate(trip!.startDate), toDate(trip!.endDate)), coverUrl: cover?.url ?? null,
    }, {}));
  } catch (err) {
    console.error('joinPage failed', err);
    res.status(200).send(renderJoinPage(null, {}));
  }
});
```

- [ ] **Step 2: Wire it up**

- `functions/src/tripPreviewFunction.ts`: change `async function publishableCover(` to `export async function publishableCover(`.
- `functions/src/index.ts`: add `export { createTripInviteLink, cancelTripInviteLinks, openTripInviteLinks, previewTripInviteLink, acceptTripInviteLink, joinPage } from './tripInviteLinkFunctions';`
- `functions/src/tripInvites.ts`: delete the block from `// Travelling together — and with it…` through the `throw` (keep `const inviterDoc = await db.doc(\`users/${inviterUid}\`).get();`), remove `import { isPaidTier } from './flightPolling';`, and update the inviterData comment to "Reuses the inviter's document for their name."
- `functions/src/deleteAccount.ts`: after the `calendarFeeds` cleanup add
  ```ts
  const inviteLinks = await db.collection('tripInviteLinks').where('inviterUid', '==', uid).get();
  await Promise.all(inviteLinks.docs.map((d) => d.ref.delete()));
  ```
  (match the surrounding style — if that block uses a batch, use the same).
- `firebase.json` `hosting.rewrites`: insert before the `/trip/**` entry
  ```json
  { "source": "/join/**", "function": { "functionId": "joinPage", "region": "us-central1" } },
  ```
- `firestore.indexes.json`: add composite index on `tripInviteLinks` (`tripId` ASC, `inviterUid` ASC, `status` ASC) — equality-only queries usually don't need one, but declare it per [[firestore-index-discipline]] if the build/emulator asks; otherwise skip and note it in the ledger.

- [ ] **Step 3: Build and run the suite**

Run: `(cd functions && npm run build) && npx jest --watchAll=false 2>&1 | tail -5`
Expected: build clean; all suites pass (if a test pinned `inviteToTrip`'s Pro refusal, update it to expect no refusal and ledger a ruling).

- [ ] **Step 4: Commit**

```bash
git add functions/src firebase.json firestore.indexes.json
git commit -m "feat(invites): invite-link callables, join page, free in-app invites"
```

---

### Task 3: App-side pure rules

**Files:**
- Create: `utils/inviteLinks.ts`
- Test: `__tests__/utils/inviteLinks.test.ts`

**Interfaces:**
- Produces:
  - `parseInviteToken(text: string | null | undefined): string | null` — finds `https://supernova-a2125.web.app/join/{16 a-z0-9}` (optionally `/`, `?…`, `#…`) anywhere in the text (a pasted message), or a `supernova://join/{token}` URL; nothing else.
  - `parseInstallReferrer(ref: string | null | undefined): string | null` — `invite=TOKEN` among `&`-separated pairs, decoded.
  - `showPasteInviteCard(i: { createdAtMs: number | null; nowMs: number; tripCount: number }): boolean` — account < 7 days old and no trips.
  - `claimMode(i: { createdAtMs: number | null; nowMs: number }): 'auto' | 'confirm'` — `auto` when the account is < 24 h old.
  - `inviteErrorCopy(code: string | undefined, inviterFirst?: string | null): string` — `failed-precondition` → `This invite has expired. Ask {name|your friend} for a new one.`; `permission-denied` → `You can't join this trip.`; `invalid-argument` → `This invite link isn't valid.`; `unavailable`/`deadline-exceeded`/`internal` → `Couldn't reach Supernova. Check your connection and try again.`; else `Something went wrong joining this trip. Try again.`

- [ ] **Step 1: Write the failing tests**

```ts
import { parseInviteToken, parseInstallReferrer, showPasteInviteCard, claimMode, inviteErrorCopy } from '@/utils/inviteLinks';

const T = 'abcdefgh12345678';
const DAY = 86_400_000;

describe('parseInviteToken', () => {
  it('finds our link inside a pasted message', () => {
    expect(parseInviteToken(`Mark invited you to Lisbon on Supernova. Join the trip: https://supernova-a2125.web.app/join/${T}`)).toBe(T);
    expect(parseInviteToken(`https://supernova-a2125.web.app/join/${T}/`)).toBe(T);
    expect(parseInviteToken(`https://supernova-a2125.web.app/join/${T}?x=1`)).toBe(T);
    expect(parseInviteToken(`supernova://join/${T}`)).toBe(T);
  });
  it('ignores anything else', () => {
    expect(parseInviteToken(`https://evil.example/join/${T}`)).toBeNull();
    expect(parseInviteToken(`https://supernova-a2125.web.app/trip/${T}`)).toBeNull();
    expect(parseInviteToken('https://supernova-a2125.web.app/join/short')).toBeNull();
    expect(parseInviteToken(`https://supernova-a2125.web.app/join/${T}extra`)).toBeNull();
    expect(parseInviteToken('')).toBeNull();
    expect(parseInviteToken(null)).toBeNull();
  });
});

describe('parseInstallReferrer', () => {
  it('reads invite= from the Play referrer', () => {
    expect(parseInstallReferrer(`invite=${T}`)).toBe(T);
    expect(parseInstallReferrer(`utm_source=x&invite=${T}`)).toBe(T);
    expect(parseInstallReferrer(`invite%3D${T}`)).toBe(T);
  });
  it('ignores organic installs and bad tokens', () => {
    expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parseInstallReferrer('invite=BAD')).toBeNull();
    expect(parseInstallReferrer(null)).toBeNull();
  });
});

describe('showPasteInviteCard / claimMode', () => {
  it('shows the paste card to accounts under 7 days with no trips', () => {
    expect(showPasteInviteCard({ createdAtMs: 0, nowMs: 6 * DAY, tripCount: 0 })).toBe(true);
    expect(showPasteInviteCard({ createdAtMs: 0, nowMs: 7 * DAY, tripCount: 0 })).toBe(false);
    expect(showPasteInviteCard({ createdAtMs: 0, nowMs: DAY, tripCount: 1 })).toBe(false);
    expect(showPasteInviteCard({ createdAtMs: null, nowMs: DAY, tripCount: 0 })).toBe(false);
  });
  it('joins automatically only for an account under a day old', () => {
    expect(claimMode({ createdAtMs: 0, nowMs: DAY - 1 })).toBe('auto');
    expect(claimMode({ createdAtMs: 0, nowMs: DAY })).toBe('confirm');
    expect(claimMode({ createdAtMs: null, nowMs: 0 })).toBe('confirm');
  });
});

describe('inviteErrorCopy', () => {
  it('says what happened and what to do', () => {
    expect(inviteErrorCopy('failed-precondition', 'Mark')).toBe('This invite has expired. Ask Mark for a new one.');
    expect(inviteErrorCopy('functions/failed-precondition')).toBe('This invite has expired. Ask your friend for a new one.');
    expect(inviteErrorCopy('permission-denied')).toBe("You can't join this trip.");
    expect(inviteErrorCopy('unavailable')).toBe("Couldn't reach Supernova. Check your connection and try again.");
    expect(inviteErrorCopy(undefined)).toBe('Something went wrong joining this trip. Try again.');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx jest __tests__/utils/inviteLinks.test.ts`
Expected: FAIL — cannot find module `@/utils/inviteLinks`.

- [ ] **Step 3: Implement `utils/inviteLinks.ts`**

```ts
/**
 * Trip invite links on the phone (spec 2026-10-30-trip-invite-links-design.md): which strings are our invite
 * links, the Play install referrer, when to offer Paste, and whether a claimed invite joins at once. Pure.
 */
const WEB = /https:\/\/supernova-a2125\.web\.app\/join\/([a-z0-9]{16})(?=$|[/?#\s])/;
const APP = /supernova:\/\/join\/([a-z0-9]{16})(?=$|[/?#\s])/;
const TOKEN = /^[a-z0-9]{16}$/;
const DAY = 86_400_000;

export function parseInviteToken(text: string | null | undefined): string | null {
  if (!text) return null;
  return WEB.exec(text)?.[1] ?? APP.exec(text)?.[1] ?? null;
}

export function parseInstallReferrer(ref: string | null | undefined): string | null {
  if (!ref) return null;
  let decoded = ref;
  try { decoded = decodeURIComponent(ref); } catch { /* keep raw */ }
  for (const pair of decoded.split('&')) {
    const [k, v] = pair.split('=');
    if (k === 'invite' && v && TOKEN.test(v)) return v;
  }
  return null;
}

export const showPasteInviteCard = (i: { createdAtMs: number | null; nowMs: number; tripCount: number }) =>
  i.createdAtMs !== null && i.tripCount === 0 && i.nowMs - i.createdAtMs < 7 * DAY;

export const claimMode = (i: { createdAtMs: number | null; nowMs: number }): 'auto' | 'confirm' =>
  i.createdAtMs !== null && i.nowMs - i.createdAtMs < DAY ? 'auto' : 'confirm';

export function inviteErrorCopy(code: string | undefined, inviterFirst?: string | null): string {
  const c = (code ?? '').replace(/^functions\//, '');
  if (c === 'failed-precondition') return `This invite has expired. Ask ${inviterFirst || 'your friend'} for a new one.`;
  if (c === 'permission-denied') return "You can't join this trip.";
  if (c === 'invalid-argument') return "This invite link isn't valid.";
  if (c === 'unavailable' || c === 'deadline-exceeded' || c === 'internal') return "Couldn't reach Supernova. Check your connection and try again.";
  return 'Something went wrong joining this trip. Try again.';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx jest __tests__/utils/inviteLinks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add utils/inviteLinks.ts __tests__/utils/inviteLinks.test.ts
git commit -m "feat(invites): app rules for invite links, referrer and paste"
```

---

### Task 4: Services, pending invite, deep-link config

**Files:**
- Create: `services/inviteLinks.ts`, `services/pendingInvite.ts`, `hooks/useInviteLinks.ts`
- Modify: `hosting/.well-known/apple-app-site-association`, `app.json` (Android intent filter), `types/index.ts` (if a type file for callable results is preferred — otherwise types live in `services/inviteLinks.ts`)
- Test: `npx tsc --noEmit -p .` + full jest

**Interfaces:**
- Consumes: Task 2 callables; Task 3 `parseInstallReferrer`.
- Produces:
  - `services/inviteLinks.ts`: `createInviteLink(tripId): Promise<{ token: string; url: string; message: string }>`, `cancelInviteLinks(tripId): Promise<number>`, `openInviteLinkCount(tripId): Promise<number>`, `previewInvite(token): Promise<InvitePreview>`, `acceptInvite(token): Promise<{ status: 'joined' | 'member'; tripId: string; inviterFirst: string; tripTitle: string }>`, type `InvitePreview` (union from Task 2).
  - `services/pendingInvite.ts`: `savePendingInvite(token): Promise<void>`, `readPendingInvite(): Promise<string | null>`, `clearPendingInvite(): Promise<void>`, `checkInstallReferrerOnce(): Promise<void>` (Android only; key `installReferrerChecked`; saves the parsed token). All never throw.
  - `hooks/useInviteLinks.ts`: `useInviteLinks(tripId: string, enabled: boolean)` → `{ openCount: number, shareLink: () => Promise<void>, cancelAll: () => Promise<void>, sharing: boolean }` (query key `['inviteLinks', tripId]`; `shareLink` creates a link then `Share.share({ message })` — on iOS also `url` is omitted so the message carries it once).

- [ ] **Step 1: Write the services and hook**

```ts
// services/inviteLinks.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

export type InvitePreview =
  | { status: 'open'; inviterFirst: string; tripTitle: string; dates: string | null; coverUrl: string | null }
  | { status: 'expired'; inviterFirst: string | null }
  | { status: 'member'; tripId: string };
export type AcceptResult = { status: 'joined' | 'member'; tripId: string; inviterFirst: string; tripTitle: string };

const call = <I, O>(name: string) => (data: I) => httpsCallable<I, O>(functions, name)(data).then((r) => r.data);

export const createInviteLink = (tripId: string) =>
  call<{ tripId: string }, { token: string; url: string; message: string }>('createTripInviteLink')({ tripId });
export const cancelInviteLinks = (tripId: string) =>
  call<{ tripId: string }, { cancelled: number }>('cancelTripInviteLinks')({ tripId }).then((r) => r.cancelled);
export const openInviteLinkCount = (tripId: string) =>
  call<{ tripId: string }, { open: number }>('openTripInviteLinks')({ tripId }).then((r) => r.open);
export const previewInvite = (token: string) => call<{ token: string }, InvitePreview>('previewTripInviteLink')({ token });
export const acceptInvite = (token: string) => call<{ token: string }, AcceptResult>('acceptTripInviteLink')({ token });
```

```ts
// services/pendingInvite.ts
/** One invite waiting for the account to exist (spec 2026-10-30): from a link opened signed out, the Play install referrer, or Paste. */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Application from 'expo-application';
import { parseInstallReferrer } from '@/utils/inviteLinks';

const KEY = 'pendingInvite';
const REFERRER_KEY = 'installReferrerChecked';

export async function savePendingInvite(token: string): Promise<void> {
  try { await AsyncStorage.setItem(KEY, token); } catch { /* best effort */ }
}
export async function readPendingInvite(): Promise<string | null> {
  try { return await AsyncStorage.getItem(KEY); } catch { return null; }
}
export async function clearPendingInvite(): Promise<void> {
  try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ }
}

/** Android: Google Play hands the invite through the install. Read once per install. */
export async function checkInstallReferrerOnce(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    if (await AsyncStorage.getItem(REFERRER_KEY)) return;
    await AsyncStorage.setItem(REFERRER_KEY, '1');
    const token = parseInstallReferrer(await Application.getInstallReferrerAsync());
    if (token) await savePendingInvite(token);
  } catch { /* no referrer service: nothing to do */ }
}
```

```ts
// hooks/useInviteLinks.ts
import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelInviteLinks, createInviteLink, openInviteLinkCount } from '@/services/inviteLinks';

export function useInviteLinks(tripId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const { data: openCount = 0 } = useQuery({
    queryKey: ['inviteLinks', tripId],
    queryFn: () => openInviteLinkCount(tripId),
    enabled: enabled && !!tripId,
    staleTime: 30_000,
  });
  const [sharing, setSharing] = useState(false);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['inviteLinks', tripId] }), [queryClient, tripId]);

  const shareLink = useCallback(async () => {
    setSharing(true);
    try {
      const { message } = await createInviteLink(tripId);
      await Share.share({ message });
    } finally {
      setSharing(false);
      refresh();
    }
  }, [tripId, refresh]);

  const cancelAll = useCallback(async () => {
    await cancelInviteLinks(tripId);
    refresh();
  }, [tripId, refresh]);

  return { openCount, shareLink, cancelAll, sharing };
}
```

- [ ] **Step 2: Deep-link config**

- `hosting/.well-known/apple-app-site-association` components → `[{"/":"/trip/*"},{"/":"/post/*"},{"/":"/join/*"}]`.
- `app.json` `android.intentFilters[0].data`: add `{ "scheme": "https", "host": "supernova-a2125.web.app", "pathPrefix": "/join/" }`.

- [ ] **Step 3: Typecheck and test**

Run: `npx tsc --noEmit -p . 2>&1 | tail -5 && npx jest --watchAll=false 2>&1 | tail -4`
Expected: no type errors; suite passes.

- [ ] **Step 4: Commit**

```bash
git add services/inviteLinks.ts services/pendingInvite.ts hooks/useInviteLinks.ts hosting/.well-known/apple-app-site-association app.json
git commit -m "feat(invites): invite-link services, pending invite and /join deep links"
```

---

### Task 5: Join screen and claiming a pending invite

**Files:**
- Create: `app/join/[token].tsx`, `hooks/usePendingInviteClaim.ts`
- Modify: `app/_layout.tsx` (`<Stack.Screen name="join/[token]" options={{ presentation: 'modal' }} />` after `pro-gift`), `app/(tabs)/_layout.tsx` (call `usePendingInviteClaim()` next to `useOfflinePrefetch()`)
- Test: tsc + full jest

**Interfaces:**
- Consumes: Task 3 `claimMode`, `inviteErrorCopy`; Task 4 services.
- Produces: route `/join/{token}` with optional `?auto=1`.

Behaviour:
- `usePendingInviteClaim`: when `useAuthStore` has a user, runs once per mount: `await checkInstallReferrerOnce()`, then `readPendingInvite()`; if a token: `clearPendingInvite()`, mode = `claimMode({ createdAtMs: Date.parse(user.metadata.creationTime ?? '') || null, nowMs: Date.now() })`, `router.push(\`/join/${token}${mode === 'auto' ? '?auto=1' : ''}\` as never)`. Guard with a ref so it doesn't push twice.
- `app/join/[token].tsx` (theme colors, light editorial):
  - Reads `token`, `auto` params; `user` + `initialized` from `useAuthStore`.
  - `!initialized` → `savePendingInvite(token)` (once) and render a centered `ActivityIndicator` — the auth listener may replace this route; the claim hook reopens it.
  - `initialized && !user` → `savePendingInvite(token)` then `router.replace('/(auth)/welcome')`.
  - `initialized && user` → `clearPendingInvite()` if the saved token equals this one; then:
    - `auto` → call `acceptInvite(token)` on mount; show the result.
    - else `previewInvite(token)` (TanStack `useQuery` key `['invitePreview', token]`, no retries): `open` → cover (expo-image, 4:3, radius 20), eyebrow = `dates ?? 'TRIP INVITE'`, title `{inviterFirst} invited you to {tripTitle}`, body "Join the trip to plan it together: stops, packing and bookings in one place.", primary `Button` "Join trip" (Medium haptic → `acceptInvite`), secondary text button "Not now" (`router.back()` if `canGoBack` else `router.replace('/(tabs)')`); `member` → "You're already on this trip" + "Open trip"; `expired` → empty state (icon `LinkBreak` duotone, title from `inviteErrorCopy('failed-precondition', inviterFirst)`, description "Invite links work once and last 30 days.", action "Go home").
  - After a successful accept: invalidate `['trips']`, `['trip', tripId]`; success state: `CheckCircle` duotone, title `You joined ${inviterFirst}'s trip`, description `tripTitle`, primary "Open trip" → `if (router.canDismiss()) router.dismissAll(); router.push(\`/trip/${tripId}\`)`.
  - Errors: message via `inviteErrorCopy(err.code, inviterFirst)`; network codes show "Try again" (re-run accept).
  - Header row: close X (44 pt, `accessibilityLabel="Close"`). Margins 20. Motion: content fades/springs in (`Animated.spring`, tension 65, friction 11).

- [ ] **Step 1: Write `hooks/usePendingInviteClaim.ts`**

```ts
/** Opens an invite that was waiting for this account (spec 2026-10-30): a new account joins at once, others confirm. */
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { checkInstallReferrerOnce, clearPendingInvite, readPendingInvite } from '@/services/pendingInvite';
import { claimMode } from '@/utils/inviteLinks';

export function usePendingInviteClaim(): void {
  const user = useAuthStore((s) => s.user);
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (!user || ran.current === user.uid) return;
    ran.current = user.uid;
    (async () => {
      await checkInstallReferrerOnce();
      const token = await readPendingInvite();
      if (!token) return;
      await clearPendingInvite();
      const created = Date.parse(user.metadata?.creationTime ?? '');
      const mode = claimMode({ createdAtMs: Number.isNaN(created) ? null : created, nowMs: Date.now() });
      router.push(`/join/${token}${mode === 'auto' ? '?auto=1' : ''}` as never);
    })();
  }, [user]);
}
```

- [ ] **Step 2: Write `app/join/[token].tsx`** per the behaviour above, using `useTheme()`, `Button` (`components/ui/Button`, variant `primary`), `EmptyState` (the component used by Profile — import from where profile imports it), `Image` from `expo-image`, Phosphor `X`, `CheckCircle`, `LinkBreak`. Keep all logic in the screen thin: data from `previewInvite`/`acceptInvite`, copy from `inviteErrorCopy`.

- [ ] **Step 3: Register the route and the hook** (edits listed under Files).

- [ ] **Step 4: Typecheck and test**

Run: `npx tsc --noEmit -p . 2>&1 | tail -5 && npx jest --watchAll=false 2>&1 | tail -4`
Expected: clean; suite passes.

- [ ] **Step 5: Commit**

```bash
git add app/join hooks/usePendingInviteClaim.ts app/_layout.tsx "app/(tabs)/_layout.tsx"
git commit -m "feat(invites): join screen and claiming a waiting invite after sign-up"
```

---

### Task 6: Invite sheet, entry points, Pro changes, Paste card

**Files:**
- Modify: `components/trip/InviteFriendsSheet.tsx` (link section on top)
- Create: `components/trip/InviteButton.tsx` (icon button + owns the sheet), `components/home/PasteInviteCard.tsx`
- Modify: `components/home/TodayCard.tsx`, `components/home/NextTripCard.tsx`, `app/(tabs)/profile.tsx` (own upcoming/current trips), `app/(tabs)/index.tsx` (Paste card), `app/trip/[id].tsx` (Invite chip: drop `requirePro` + Pro badge; Budget chip: wrap push in `requirePro`), `constants/icons.ts` (paywall line)
- Test: tsc + full jest

**Interfaces:**
- Consumes: `useInviteLinks` (Task 4), `parseInviteToken`, `showPasteInviteCard` (Task 3), `acceptInvite` via the join route.
- Produces: `InviteButton({ trip }: { trip: Trip })` — renders a 44 pt round button (`UserPlus` bold 18, `colors.background.sunken`, `accessibilityLabel={\`Invite to ${trip.title}\`}`) and the `InviteFriendsSheet` it opens; only renders when the viewer is the owner or a collaborator. `PasteInviteCard()`.

- [ ] **Step 1: Sheet** — in `InviteFriendsSheet`, add `const links = useInviteLinks(tripId, visible);` and above the friends list:
  - Primary full-width button "Invite with a link" (`Link` icon, near-black-equivalent primary on the dark sheet: white fill, `#1F1C19` text) → Medium haptic → `links.shareLink()`; while `links.sharing` show a spinner; on error show inline "Couldn't make a link. Check your connection and try again."
  - Caption under it: "Works once, for one person, for 30 days."
  - When `links.openCount > 0`: row `{n} link(s) waiting · Cancel` — Cancel → `Alert.alert('Cancel invite links?', 'Anyone who hasn't joined yet won't be able to.', [{ text: 'Keep' }, { text: 'Cancel links', style: 'destructive', onPress: links.cancelAll }])`.
  - Section label above the list: eyebrow `FRIENDS ON SUPERNOVA`.
  - Title stays "Bring a friend along". Empty friends state text: "Follow people to invite them here, or send a link."
- [ ] **Step 2: `InviteButton`** — wraps `useState(visible)`, Light haptic on open, `stopPropagation`-safe: render as a sibling `Pressable` positioned top-right over the cover (`position:absolute, top: Spacing['3'], right: Spacing['3']`, `rgba(0,0,0,0.5)` circle on the photo, white icon) so taps don't open the card. Shown only when `uid === trip.authorUid || trip.collaborators?.includes(uid)`.
- [ ] **Step 3: Cards** — `TodayCard` and `NextTripCard`: add `<InviteButton trip={trip} />` inside the cover `View`. Profile: in the Trips `renderItem`, when `tripFilter !== 'Past'`, wrap `TripCard` in a `View` with `position:'relative'` and overlay `<InviteButton trip={item} />` (same top-right placement; `TripCard`'s own top-left pill stays clear).
- [ ] **Step 4: Trip page** — Invite chip: `onPress={() => setInviteVisible(true)}`, label `"Invite friends"`, remove `<Badge variant="pro" />`. Budget chip: `onPress={() => { Haptics…; requirePro(() => router.push({ pathname: '/trip/budget', params: { id: trip.id } })); }}`, `accessibilityLabel={isPro ? 'Trip budget' : 'Trip budget. Pro feature'}`, show `<Badge variant="pro" />` when `!isPro`.
- [ ] **Step 5: Paywall copy** — `constants/icons.ts`: `{ Icon: UsersThree, color: '#f472b6', label: 'Split a trip budget', description: 'Track a shared budget and split costs with your group' }`.
- [ ] **Step 6: Paste card** — `PasteInviteCard`: card (surface, radius 20, padding 20) with eyebrow `GOT AN INVITE?`, title "Joining a friend's trip?", body "Copy the invite link from your messages, then paste it here.", secondary `Button` "Paste invite link" → `Clipboard.getStringAsync()` → `parseInviteToken` → token ? `router.push(\`/join/${token}\`)` : inline "That isn't a Supernova invite link. Copy the whole link and try again." Home: render above `PlanCard` when `showPasteInviteCard({ createdAtMs: Date.parse(user?.metadata.creationTime ?? '') || null, nowMs: Date.now(), tripCount: trips.length })` (use whatever Home already holds as the trip list — `h.isEmpty` alone doesn't cover past trips; pass the full own-trips length).
- [ ] **Step 7: Typecheck, test, design checklist**

Run: `npx tsc --noEmit -p . 2>&1 | tail -5 && npx jest --watchAll=false 2>&1 | tail -4`
Expected: clean; suite passes. Then run the supernova-design pre-ship checklist on the sheet, join screen, cards and Paste card and note results in the ledger.

- [ ] **Step 8: Commit**

```bash
git add components app constants
git commit -m "feat(invites): invite by link from Home, Profile and the trip; budget split is Pro"
```

---

### Task 7: Docs and privacy policy

**Files:**
- Modify: `CLAUDE.md` (Cloud Functions bullet **Trip invite links**; routing tree `join/[token].tsx`), `hosting/privacy.html` (invite links: what the page shows — inviter's first name, trip title and dates, cover; links expire after 30 days and are deleted with the account)
- Modify: memory `outside-trip-invites.md` → mark built on `feat/trip-invite-links`

- [ ] **Step 1:** Write the CLAUDE.md bullet (one paragraph, same density as neighbours: collection, callables, rules, page, pending invite, Android referrer, Paste card, `claimMode`, free invites, budget Pro, `deleteAccount`).
- [ ] **Step 2:** Privacy policy paragraph.
- [ ] **Step 3:** Full suite: `npx jest --watchAll=false 2>&1 | tail -4` → pass.
- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md hosting/privacy.html
git commit -m "docs(invites): trip invite links in CLAUDE.md and the privacy policy"
```

---

## Deploy (after review, with the owner's OK)

`(cd functions && npm run build) && firebase deploy --only functions:createTripInviteLink,functions:cancelTripInviteLinks,functions:openTripInviteLinks,functions:previewTripInviteLink,functions:acceptTripInviteLink,functions:joinPage,functions:inviteToTrip,functions:deleteAccount,hosting` — then iOS + Android builds.
