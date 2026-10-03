# Share a trip — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Share button on every shareable trip: send it to mutual friends as a trip card in messages, or share a web link that opens the trip in the app (universal link) or a preview page.

**Architecture:** Pure rules in `utils/tripShare.ts` (client) and `functions/src/tripPreview.ts` (server, HTML rendering). Messages gain an optional `trip` snapshot; `text` stays required so 1.0.2 shows a readable fallback. A Hosting rewrite sends `/trip/**` to an `onRequest` function; Hosting also serves the Apple app-site-association file; `app.json` gets `associatedDomains`.

**Tech Stack:** Expo SDK 54 / Expo Router v6, Firestore rules, Cloud Functions v2 (`onRequest`), Firebase Hosting rewrites, React Native `Share`, Jest.

**Spec:** `docs/superpowers/specs/2026-10-02-share-trips-design.md`

## Global Constraints

- Private trips and moderation-hidden trips are never shareable.
- The web preview shows trip details **only** for a public trip by a public account that isn't moderation-hidden; everything else gets the generic page with no trip details.
- Every value interpolated into the preview HTML is escaped.
- A trip message always has non-empty `text` (old apps read only `text`); `trip.note` is true only when the sender wrote a note.
- Messaging stays limited to mutual friends (`createDmThread` enforces it).
- URL: `https://supernova-a2125.web.app/trip/{tripId}`; App Store: `https://apps.apple.com/app/id6810490710`; Team ID `R47484PAGA`.
- Design rules: no emoji, one primary action per screen, house spring, Light/Medium haptics, 44pt targets, `useTheme()` colours, sentence case.
- Deploy only the functions this plan adds (`--only functions:tripPreview,hosting,firestore:rules`).

## Review Focus

1. **A title or note containing `<script>`, quotes or `&`** — rendered as text in the preview page and OG tags, never markup. → `renderTripPreview` escaping test (Task 2).
2. **Sharing a followers-only trip by link** — the web page must not show its title, cover or stops. → `previewEligibility` test (Task 2).
3. **A recipient on 1.0.2** — sees `Shared a trip: {title} — {url}`, not an empty bubble. → `tripMessagePayload` test (Task 1).
4. **Sending to 3 friends when one send fails** — the other two still go out, and the sheet says who failed. → `summarizeSends` test (Task 3).
5. **The same friend appearing as both an existing thread and a mutual friend** — listed once. → `shareRecipients` test (Task 1).

---

### Task 1: Client share rules

**Files:** Create `utils/tripShare.ts`, `__tests__/utils/tripShare.test.ts`; modify `types/index.ts` (`DmMessage.trip?: DmTripSnapshot`).

**Produces:**
- `canShareTrip(trip: { visibility: TripVisibility; moderationHidden?: boolean }): boolean`
- `tripShareUrl(tripId: string): string`
- `interface DmTripSnapshot { tripId: string; title: string; coverImageUrl: string | null; placeLabel: string; dateRange: string | null; note: boolean }`
- `tripMessagePayload(a: { trip: { id; title; coverImageUrl; destination; additionalDestinations?; regionName?; startDate?; endDate? }; note: string; senderUid: string }): { senderUid; text; trip: DmTripSnapshot }` (createdAt added by the caller)
- `shareRecipients(threads: { id; type; participants: string[]; lastMessageAt?: { toMillis(): number } | null }[], mutualFriendUids: string[], me: string, blocked: Set<string>): { uid: string; threadId: string | null }[]`

- [ ] **Step 1: tests (RED)**
```ts
import { canShareTrip, tripShareUrl, tripMessagePayload, shareRecipients } from '@/utils/tripShare';

describe('canShareTrip', () => {
  it('shares public and followers-only trips, never private or hidden ones', () => {
    expect(canShareTrip({ visibility: 'public' })).toBe(true);
    expect(canShareTrip({ visibility: 'followers' })).toBe(true);
    expect(canShareTrip({ visibility: 'private' })).toBe(false);
    expect(canShareTrip({ visibility: 'public', moderationHidden: true })).toBe(false);
  });
});

describe('tripShareUrl', () => {
  it('is the web path the app also routes', () => {
    expect(tripShareUrl('abc123')).toBe('https://supernova-a2125.web.app/trip/abc123');
  });
});

describe('tripMessagePayload', () => {
  const trip = { id: 't1', title: 'Paris in Spring', coverImageUrl: 'https://x/c.jpg', destination: { name: 'Paris' }, additionalDestinations: [], regionName: null, startDate: null, endDate: null };
  it('without a note, the text is a readable fallback with the link (for older apps)', () => {
    const p = tripMessagePayload({ trip: trip as never, note: '  ', senderUid: 'me' });
    expect(p.text).toBe('Shared a trip: Paris in Spring — https://supernova-a2125.web.app/trip/t1');
    expect(p.trip).toEqual({ tripId: 't1', title: 'Paris in Spring', coverImageUrl: 'https://x/c.jpg', placeLabel: 'Paris', dateRange: null, note: false });
  });
  it('with a note, the text is the note and trip.note is true', () => {
    const p = tripMessagePayload({ trip: trip as never, note: ' You have to see this ', senderUid: 'me' });
    expect(p.text).toBe('You have to see this');
    expect(p.trip.note).toBe(true);
  });
});

describe('shareRecipients', () => {
  const t = (id: string, other: string, ms: number) => ({ id, type: 'direct', participants: ['me', other], lastMessageAt: { toMillis: () => ms } });
  it('lists recent conversations first, then friends without one, each person once, minus blocked', () => {
    const r = shareRecipients([t('a', 'ana', 1), t('b', 'ben', 5)], ['ana', 'cal', 'dee', 'eve'], 'me', new Set(['eve']));
    expect(r).toEqual([
      { uid: 'ben', threadId: 'b' },
      { uid: 'ana', threadId: 'a' },
      { uid: 'cal', threadId: null },
      { uid: 'dee', threadId: null },
    ]);
  });
  it('skips group threads', () => {
    expect(shareRecipients([{ id: 'g', type: 'group', participants: ['me', 'x', 'y'], lastMessageAt: null }], [], 'me', new Set())).toEqual([]);
  });
});
```
- [ ] **Step 2:** run → FAIL (module missing).
- [ ] **Step 3: implement**
```ts
import type { TripVisibility } from '@/types';
import { tripPlaceLabel } from '@/utils/tripRegion';
import { formatRangeLabel } from '@/utils/dateRange';

export interface DmTripSnapshot {
  tripId: string; title: string; coverImageUrl: string | null; placeLabel: string; dateRange: string | null;
  /** True when the message text is the sender's own note (not the fallback). */
  note: boolean;
}

/** Private and moderation-hidden trips can't be shared — nobody else could open them. */
export function canShareTrip(trip: { visibility: TripVisibility; moderationHidden?: boolean }): boolean {
  return trip.visibility !== 'private' && !trip.moderationHidden;
}

/** Same path as the app route, so a universal link opens app/trip/[id]. */
export function tripShareUrl(tripId: string): string {
  return `https://supernova-a2125.web.app/trip/${tripId}`;
}

export function tripMessagePayload(a: { trip: any; note: string; senderUid: string }) {
  const note = a.note.trim();
  const dateRange = a.trip.startDate && a.trip.endDate ? formatRangeLabel(a.trip.startDate.toDate(), a.trip.endDate.toDate()) : null;
  return {
    senderUid: a.senderUid,
    // Older apps only read text: without a note, say what it is and link it.
    text: note || `Shared a trip: ${a.trip.title} — ${tripShareUrl(a.trip.id)}`,
    trip: {
      tripId: a.trip.id, title: a.trip.title, coverImageUrl: a.trip.coverImageUrl ?? null,
      placeLabel: tripPlaceLabel(a.trip), dateRange, note: !!note,
    } satisfies DmTripSnapshot,
  };
}

export function shareRecipients(threads: any[], mutualFriendUids: string[], me: string, blocked: Set<string>) {
  const out: { uid: string; threadId: string | null }[] = [];
  const seen = new Set<string>();
  const direct = threads
    .filter((t) => t.type === 'direct')
    .sort((a, b) => (b.lastMessageAt?.toMillis() ?? 0) - (a.lastMessageAt?.toMillis() ?? 0));
  for (const t of direct) {
    const other = t.participants.find((p: string) => p !== me);
    if (!other || seen.has(other) || blocked.has(other)) continue;
    seen.add(other); out.push({ uid: other, threadId: t.id });
  }
  for (const uid of mutualFriendUids) {
    if (seen.has(uid) || blocked.has(uid) || uid === me) continue;
    seen.add(uid); out.push({ uid, threadId: null });
  }
  return out;
}
```
(`Trip.startDate`/`endDate` are Firestore `Timestamp | null`; `formatRangeLabel(start: Date, end: Date)` lives in `utils/dateRange.ts`. Type the `any`s with the real `Trip`/`DmThread` types.)
- [ ] **Step 4:** run → PASS. **Step 5:** commit `feat: trip share rules`.

---

### Task 2: Server — preview page, rules, hosting, universal links

**Files:** Create `functions/src/tripPreview.ts` (pure), `functions/src/tripPreviewFunction.ts` (onRequest), `__tests__/functions/tripPreview.test.ts`, `hosting/.well-known/apple-app-site-association`; modify `functions/src/index.ts`, `firebase.json`, `firestore.rules`, `app.json`.

**Produces:** `previewEligibility(trip, author): boolean`; `renderTripPreview(trip | null, stops: string[]): string`; `escapeHtml(s): string`.

- [ ] **Step 1: tests (RED)**
```ts
import { previewEligibility, renderTripPreview, escapeHtml } from '../../functions/src/tripPreview';

describe('previewEligibility', () => {
  const trip = { visibility: 'public', moderationHidden: false };
  const author = { settings: { privacy: 'public' } };
  it('only a public trip by a public account, not hidden', () => {
    expect(previewEligibility(trip, author)).toBe(true);
    expect(previewEligibility({ ...trip, visibility: 'followers' }, author)).toBe(false);
    expect(previewEligibility({ ...trip, moderationHidden: true }, author)).toBe(false);
    expect(previewEligibility(trip, { settings: { privacy: 'private' } })).toBe(false);
    expect(previewEligibility(null, author)).toBe(false);
  });
});

describe('renderTripPreview', () => {
  const trip = { id: 't1', title: 'Paris <script>alert(1)</script> & "co"', coverImageUrl: 'https://x/c.jpg?a=1&b=2', placeLabel: 'Paris', days: 5, authorName: 'Supernova' };
  it('escapes everything, in the page and in the share tags', () => {
    const html = renderTripPreview(trip, ['Louvre <b>']);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('Paris &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;');
    expect(html).toContain('Louvre &lt;b&gt;');
    expect(html).toContain('<meta property="og:image" content="https://x/c.jpg?a=1&amp;b=2"');
  });
  it('links into the app and the App Store', () => {
    const html = renderTripPreview(trip, []);
    expect(html).toContain('href="supernova://trip/t1"');
    expect(html).toContain('href="https://apps.apple.com/app/id6810490710"');
  });
  it('the generic page shows no trip details', () => {
    const html = renderTripPreview(null, []);
    expect(html).toContain('Supernova');
    expect(html).not.toContain('og:image');
    expect(html).toContain('href="https://apps.apple.com/app/id6810490710"');
  });
});
```
- [ ] **Step 2:** run → FAIL.
- [ ] **Step 3: implement** `functions/src/tripPreview.ts`: `escapeHtml` (`& < > " '`), `previewEligibility`, and `renderTripPreview` returning a full HTML document: `<meta name="viewport">`, `<title>`, OG/Twitter tags (`og:title`, `og:description` = `"{placeLabel} · {days} days on Supernova"`, `og:image` when cover), light styles inline (canvas `#FBF9F5`, text `#1F1C19`, CTA `#1F1C19` / `#FBF9F5`, 20px margins, 16px radius), cover image, eyebrow `PARIS · 5 DAYS`, title, "by {authorName}", up to 5 stops, primary button **Open in Supernova** (`supernova://trip/{id}`), text link **Get the app**. Generic page: star wordmark text, "Plan your next trip with Supernova", same two links with the open link going to `supernova://`.
  `functions/src/tripPreviewFunction.ts`: `onRequest` — parse `/trip/{id}` from `req.path` (`/^\/trip\/([A-Za-z0-9]+)$/`), read the trip and its author (Admin SDK), `previewEligibility` → render with up to 5 stop titles from day 1..n (stop at 5), else `renderTripPreview(null, [])`; `res.set('Cache-Control','public, max-age=300')`; any error → generic page with 200.
- [ ] **Step 4:** run → PASS.
- [ ] **Step 5: config**
  - `firebase.json` hosting: `"rewrites": [{ "source": "/trip/**", "function": { "functionId": "tripPreview", "region": "us-central1" } }]`, and `"headers"` for `/.well-known/apple-app-site-association` → `Content-Type: application/json`.
  - `hosting/.well-known/apple-app-site-association`:
    `{"applinks":{"details":[{"appIDs":["R47484PAGA.com.supernovatravel.app"],"components":[{"/":"/trip/*"}]}]}}`
  - `firebase.json` hosting `ignore` currently contains `"**/.*"`, which would skip `.well-known` — change to keep `.well-known` (e.g. ignore `"**/.!(well-known)*"` or list explicit ignores) and verify with `firebase hosting:channel:deploy` dry run or `curl` after deploy.
  - `app.json` → `ios.associatedDomains: ["applinks:supernova-a2125.web.app"]`.
  - `firestore.rules` message create: keep the text checks; add
    `&& (!request.resource.data.keys().hasAny(['trip']) || (request.resource.data.trip.keys().hasOnly(['tripId','title','coverImageUrl','placeLabel','dateRange','note']) && request.resource.data.trip.tripId is string && request.resource.data.trip.title is string && request.resource.data.trip.title.size() <= 200))`
    and `&& request.resource.data.keys().hasOnly(['senderUid','text','createdAt','trip'])`.
- [ ] **Step 6:** functions build, tests, rules dry-run; deploy `firestore:rules,functions:tripPreview,hosting`; `curl -sI https://supernova-a2125.web.app/.well-known/apple-app-site-association` (200, JSON) and `curl -s https://supernova-a2125.web.app/trip/<a public editorial trip id> | grep og:title`. Commit `feat: trip preview page, universal links, trip messages allowed`.

---

### Task 3: App — Share button, share sheet, trip cards

**Files:** Create `components/trip/ShareTripSheet.tsx`, `components/messages/TripMessageCard.tsx`, `hooks/useShareTrip.ts`; modify `app/trip/[id].tsx` (Share header button), `components/messages/MessageBubble.tsx`, `utils/tripShare.ts` (+ `summarizeSends`), tests.

**Consumes:** Task 1 everything; `useDmThreads`, `useMutualFriends`, `useCreateDmThread`, `useAuthorProfiles`, `useModeration`.

- [ ] **Step 1: `summarizeSends` test (RED → GREEN)** in `__tests__/utils/tripShare.test.ts`:
```ts
it('summarizes partial failures by name', () => {
  expect(summarizeSends([{ name: 'Ana', ok: true }, { name: 'Ben', ok: false }, { name: 'Cal', ok: true }]))
    .toEqual({ sent: 2, failedNames: ['Ben'], message: "Sent to 2 people. Couldn't send to Ben." });
  expect(summarizeSends([{ name: 'Ana', ok: true }]).message).toBe('Sent to Ana');
});
```
Implement in `utils/tripShare.ts`:
```ts
export function summarizeSends(results: { name: string; ok: boolean }[]) {
  const sent = results.filter((r) => r.ok);
  const failedNames = results.filter((r) => !r.ok).map((r) => r.name);
  const head = sent.length === 1 && !failedNames.length ? `Sent to ${sent[0].name}` : `Sent to ${sent.length} ${sent.length === 1 ? 'person' : 'people'}.`;
  return { sent: sent.length, failedNames, message: failedNames.length ? `${head} Couldn't send to ${failedNames.join(', ')}.` : head };
}
```
- [ ] **Step 2: `hooks/useShareTrip.ts`** — `send(recipients, trip, note)`: for each recipient (sequentially), `threadId ?? (await createDmThread.mutateAsync([uid])).threadId`, then `addDoc(collection(db,'dmThreads',threadId,'messages'), { ...tripMessagePayload({ trip, note, senderUid: me }), createdAt: serverTimestamp() })`; collect `{ name, ok }`; invalidate `['dmThreads']`; return `summarizeSends(results)`.
- [ ] **Step 3: `ShareTripSheet`** — RN `Modal` page sheet (light chrome): title "Share trip", trip mini-card (cover, title, place), section **Send in Supernova**: FlashList of `shareRecipients(...)` rows (Avatar, name, check circle; multi-select; Light haptic), note `TextInput` (placeholder "Add a note", `keyboardDismissMode="on-drag"` on the list), primary **Send** (disabled until someone's selected; Medium haptic; spinner while sending; then `summarizeSends` message inline and close after 1.2s on full success). Empty state when no mutual friends: icon `UsersThree`, "No one to message yet", "You can message people who follow you back.", action **Share link instead** (opens the share sheet). Secondary row at the top: **Share link** (`Export` icon) → `Share.share({ message: `${trip.title} on Supernova`, url: tripShareUrl(trip.id) })`.
- [ ] **Step 4: header button** in `app/trip/[id].tsx`: when `canShareTrip(trip)`, a third header circle (`Export` icon, `accessibilityLabel="Share trip"`) left of the map button (`right: Spacing['4'] + (44 + Spacing['2']) * 2`), Light haptic, opens the sheet.
- [ ] **Step 5: `TripMessageCard`** — in `MessageBubble`, when `message.trip` exists render a card (cover 16:9 with rounded top, eyebrow `placeLabel · dateRange`, title, "Open trip" affordance) aligned like the bubble; tap → Light haptic → `router.push(`/trip/${tripId}`)`; render `message.text` under it only when `trip.note`. Card colours from `useTheme()`; mine vs theirs uses `bubbleColors` for the note bubble only.
- [ ] **Step 6:** `npx tsc --noEmit`, `npx jest`, `npm run lint` clean; regenerate typed routes if needed (start Metro briefly). Commit `feat: share a trip — in messages or as a link`.

---

### Task 4: Docs, review, ship

- [ ] CLAUDE.md: trip sharing (message `trip` snapshot + text fallback, `tripPreview` + hosting rewrite, AASA, associatedDomains).
- [ ] Final whole-branch review (fresh reviewer; Review Focus above); fix pass with tests.
- [ ] Merge to main, bump `app.json` version to 1.0.3, push, production build → TestFlight. Note for the user: universal links only work in a build that contains `associatedDomains` (1.0.3+); older apps open the link in Safari, which shows the preview page.
