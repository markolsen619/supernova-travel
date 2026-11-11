# Save places from screenshots: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Save wish-list places from up to 5 screenshots (shared or picked). Gemini reads the place names server-side, and the result is an ordinary wish-list save with the first screenshot as its cover.

**Architecture:**
- **Upload.** The app re-encodes the images (JPEG, ≤ 1600 px, no metadata) and uploads them to private `wish_shots/{uid}/{saveId}/{i}.jpg`.
- **Read.** The callable `readScreenshots` checks consent and the shared monthly quota. It then reads the images with the Admin SDK and makes one Gemini call with inline image parts. Its output goes through the existing `cleanPlaces` and Mapbox `placeAll`.
- **Save.** The app saves `users/{uid}/wishlist/{saveId}` with `platform: 'screenshot'` and `shots`.
- **Share extension.** It accepts images. Shared files are parked like links.

**Tech Stack:** Expo Router 6 / React Native, expo-share-intent 5.1, expo-image-picker, expo-image-manipulator, Firebase JS SDK (Firestore, Storage, Functions), Firebase Functions v2 (Node 22), Gemini 2.5 Flash, Jest (pure-function tests only).

**Spec:** `docs/superpowers/specs/2026-11-11-wishlist-screenshots-design.md`

## Global Constraints

**Images and storage**
- At most 5 images per save. Each is JPEG with the long side ≤ 1600 px, quality 0.8, and no EXIF or location. An image that can't be re-encoded fails; the original is never uploaded.
- The storage path is `wish_shots/{uid}/{saveId}/{i}.jpg`, where `i` is 0–4. `saveId` is `s` + a 20-character Firestore auto-id and matches `^s[A-Za-z0-9]{20}$`.
- Storage rules: owner read and delete; create only for `[0-4]\.jpg`, `image/jpeg`, `< 2 MB`; no update.

**The callable**
- `readScreenshots({ saveId, count })` checks, in order:
  1. Signed in.
  2. Consent `hasAiConsent(user, 'screenshots')`, which is version ≥ 4.
  3. The quota, claimed in a transaction with the existing `wishQuota` on `usage_quotas/{uid}/wishlist/{YYYY-MM}`, counting `saveId`. The limits are 20 a month free, unlimited for Pro, and ≤ 30 an hour.
- **Gemini:** one call, `gemini-2.5-flash`, thinking 0, `PLACES_SCHEMA`, inline JPEG parts.
- **Placement:** `cleanPlaces`, then `placeAll`.
- **After the read:** nothing is cached across users. An AI failure gives the quota claim back and answers `unavailable`. Image contents are never logged.

**Data and consent**
- **Wish-list doc for screenshots:** `platform: 'screenshot'`, `videoId: saveId`, `postUrl: ''`, `author: ''`, `authorHandle: ''`, `caption: ''`, and `shots` (1–5 paths inside `wish_shots/{uid}/{saveId}/`). Link saves are unchanged.
- **Consent:** `AI_CONSENT_VERSION` becomes 4 on both sides. The new purpose `screenshots` has minimum 4, and the other purposes keep their minimums.
- **Account deletion:** `deleteAccount` adds `wish_shots/{uid}/` to `userStoragePrefixes`.

**Copy** (sentence case, no emoji, no "!")
- The wish list leads with **Add screenshots** (primary) and the text link **or paste a link**.
- Empty state: **Save places you see online** / "Screenshot a TikTok, Reel or post and share it to Supernova. We'll find the places." / **Add screenshots**.
- The sheet heading becomes **Save places** in both modes.
- No places in screenshot mode: "No places in these screenshots. Add the places you saw and they're saved with them."
- AI failure: "Couldn't read these screenshots. Try again".
- The creator line for screenshot saves: **Screenshots**.

**UI rules**
- `useTheme()` colors inline.
- Touch targets ≥ 44 pt with `accessibilityLabel`.
- Haptics: Light on select, Medium on add.
- Every handler passed as a prop is wrapped in `useCallback`.
- Writes use `requireOnline()`.

**Native and tests**
- The share extension accepts images: iOS `NSExtensionActivationSupportsImageWithMaxCount: 5`; Android `androidIntentFilters` adds `image/*` and `androidMultiIntentFilters: ["image/*"]`. Native changes need a store build.
- Tests are pure functions only. Run `npx jest <path>`; the whole suite is `npx jest`. Typecheck with `npx tsc --noEmit -p .` and `(cd functions && npx tsc --noEmit)`.

## Review Focus

1. **More than 5 images shared, or a mix with non-images** (a PDF, a video): keep the first 5 images and ignore the rest, never fail the share. Pinned in Task 4 (`shareKind`).
2. **A screenshot share made while signed out, or on a cold start:** it must survive sign-in and open the sheet afterwards, like links do. Old plain-string parked links must still parse. Pinned in Task 4 (`parsePendingShare`).
3. **A Gemini failure after the quota claim:** the save must not be charged. Pinned in Task 1 (`releaseQuota`).
4. **A save whose `shots` point outside the user's own folder, or more than 5:** `screenshotSaveDoc` must refuse to build it (the rules would refuse it anyway). Pinned in Task 4.
5. **The consent bump must not re-ask existing users for trips, imports or Nova.** `hasAiConsent(3, 'agent')` stays true while `'screenshots'` needs 4. Pinned in Task 2.

---

### Task 1: Server rules for reading screenshots (pure), plus image parts in Gemini requests

**Files:**
- Create: `functions/src/screenshotPlaces.ts`
- Modify: `functions/src/agentModel.ts:10-16`: `ModelTurn` gains optional `images`.
- Modify: `functions/src/socialPost.ts`: add `releaseQuota`.
- Test: `__tests__/functions/screenshotPlaces.test.ts`, and add to `__tests__/functions/agentModel.test.ts`.

**Interfaces:**
- Produces:
  - `validShotsRequest(data: unknown): { saveId: string; count: number } | null`
  - `shotPaths(uid: string, saveId: string, count: number): string[]`
  - `SHOTS_SYSTEM: string`
  - `SHOTS_PROMPT: string`
  - `ModelTurn = { role: 'user' | 'model'; text: string; images?: { mimeType: string; data: string }[] }`
  - `releaseQuota(doc: QuotaDoc, id: string): QuotaDoc`, which removes `id` from `doc.videos` and gives back one hourly use for the current hour key.

- [ ] **Step 1: Write the failing tests.** Create `__tests__/functions/screenshotPlaces.test.ts`:

```ts
import { SHOTS_PROMPT, SHOTS_SYSTEM, shotPaths, validShotsRequest } from '../../functions/src/screenshotPlaces';
import { releaseQuota, wishQuota } from '../../functions/src/socialPost';

describe('validShotsRequest', () => {
  it('accepts an s-prefixed 21-char id and 1–5 images', () => {
    expect(validShotsRequest({ saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 3 })).toEqual({ saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 3 });
  });
  it('refuses bad ids and counts', () => {
    for (const d of [{ saveId: 'AbCdEfGhIjKlMnOpQrStU', count: 1 }, { saveId: 's../x', count: 1 }, { saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 0 },
      { saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 6 }, { saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 2.5 }, null, 'x']) {
      expect(validShotsRequest(d)).toBeNull();
    }
  });
});

describe('shotPaths', () => {
  it('lists 0.jpg… in the user\'s own folder', () => {
    expect(shotPaths('u1', 'sAbCdEfGhIjKlMnOpQrSt', 2)).toEqual(['wish_shots/u1/sAbCdEfGhIjKlMnOpQrSt/0.jpg', 'wish_shots/u1/sAbCdEfGhIjKlMnOpQrSt/1.jpg']);
  });
});

describe('prompts', () => {
  it('asks only for places shown or named, never guessed', () => {
    expect(SHOTS_SYSTEM).toMatch(/never guess/i);
    expect(SHOTS_SYSTEM).toMatch(/at most 10/i);
    expect(SHOTS_PROMPT.length).toBeGreaterThan(10);
  });
});

describe('releaseQuota (review focus 3: a failed read is not charged)', () => {
  it('gives back a claim made by wishQuota', () => {
    const now = Date.parse('2026-11-11T10:00:00Z');
    const claim = wishQuota({}, 'sAbCdEfGhIjKlMnOpQrSt', false, now);
    if (!claim.ok) throw new Error('claim');
    const back = releaseQuota(claim.patch, 'sAbCdEfGhIjKlMnOpQrSt');
    expect(back.videos).toEqual([]);
    expect(wishQuota(back, 'sNewNewNewNewNewNewNe', false, now).ok).toBe(true);
  });
});
```

Add to `__tests__/functions/agentModel.test.ts`, inside `describe('geminiRequestBody', …)`:

```ts
  it('sends images as inline parts before the turn text', () => {
    const body = geminiRequestBody({ system: 'S', schema: {}, thinkingBudget: 0,
      turns: [{ role: 'user', text: 'find places', images: [{ mimeType: 'image/jpeg', data: 'QUJD' }] }] }) as any;
    expect(body.contents[0].parts).toEqual([{ inlineData: { mimeType: 'image/jpeg', data: 'QUJD' } }, { text: 'find places' }]);
  });
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/functions/screenshotPlaces.test.ts __tests__/functions/agentModel.test.ts`
  - Expected: FAIL. `Cannot find module …screenshotPlaces`, `releaseQuota is not a function`, and the inline-parts assertion fails.

- [ ] **Step 3: Implement.**

Write `functions/src/screenshotPlaces.ts`:

```ts
/**
 * Save places from screenshots (spec 2026-11-11): the server's pure rules — the request, the images' paths, and the
 * prompt. TikTok stopped sharing post details on 2026-11-10; screenshots work for any app and can't be switched off.
 */
export function validShotsRequest(data: unknown): { saveId: string; count: number } | null {
  const d = data as { saveId?: unknown; count?: unknown } | null;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.saveId !== 'string' || !/^s[A-Za-z0-9]{20}$/.test(d.saveId)) return null;
  if (typeof d.count !== 'number' || !Number.isInteger(d.count) || d.count < 1 || d.count > 5) return null;
  return { saveId: d.saveId, count: d.count };
}

export const shotPaths = (uid: string, saveId: string, count: number) =>
  Array.from({ length: count }, (_, i) => `wish_shots/${uid}/${saveId}/${i}.jpg`);

export const SHOTS_SYSTEM = [
  'You read screenshots a traveler took of travel posts (captions, on-screen text, signs, menus, location tags, maps)',
  'and list the specific places they show or name: restaurants, bars, cafes, sights, hotels, activities, shops.',
  'Only places shown or named — never guess from the topic or the scenery. For each, its city when shown or clearly',
  'implied. Also the main city and country of the screenshots, or null. At most 10 places. Names exactly as written.',
].join(' ');

export const SHOTS_PROMPT = 'Find the places in these screenshots.';
```

In `functions/src/agentModel.ts`:
- Change `export interface ModelTurn { role: 'user' | 'model'; text: string }` to `export interface ModelTurn { role: 'user' | 'model'; text: string; images?: { mimeType: string; data: string }[] }`.
- In `geminiRequestBody`, change the `contents` mapping to:

```ts
    contents: a.turns.map((t) => ({ role: t.role, parts: [...(t.images ?? []).map((im) => ({ inlineData: { mimeType: im.mimeType, data: im.data } })), { text: t.text }] })),
```

In `functions/src/socialPost.ts`, after `wishQuota`. First check the hour key `wishQuota` uses:
- Run: `grep -n "hours\|const h =" functions/src/socialPost.ts`
- Use the same key expression. The code below assumes `new Date(nowMs).toISOString().slice(0, 13)`, as in `wishQuota`; if that differs, copy it.

```ts
/** Give back a claim from `wishQuota` (a read that failed after the claim — review focus 3). */
export function releaseQuota(doc: QuotaDoc, id: string, nowMs = Date.now()): QuotaDoc {
  const h = new Date(nowMs).toISOString().slice(0, 13);
  const hours = { ...(doc.hours ?? {}) };
  if (hours[h]) hours[h] = Math.max(0, hours[h] - 1);
  return { ...doc, videos: (doc.videos ?? []).filter((v) => v !== id), hours };
}
```

- [ ] **Step 4: Run them to verify they pass.**
  - Run: `npx jest __tests__/functions/screenshotPlaces.test.ts __tests__/functions/agentModel.test.ts __tests__/functions/socialPost.test.ts`
  - Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add functions/src/screenshotPlaces.ts functions/src/agentModel.ts functions/src/socialPost.ts __tests__/functions/screenshotPlaces.test.ts __tests__/functions/agentModel.test.ts
git commit -m "feat(wishlist): screenshot reading rules, image parts for Gemini, quota give-back"
```

---

### Task 2: Consent level for screenshots

**Files:**
- Modify: `functions/src/aiConsent.ts`, `utils/aiConsent.ts` (version 4, purpose `screenshots`).
- Modify: `components/ai/AiConsentSheet.tsx` (`LEAD.screenshots`).
- Test: `__tests__/utils/aiConsent.test.ts`

**Interfaces:**
- Produces: `AiPurpose` includes `'screenshots'` on both sides. `hasAiConsent(4, 'screenshots') === true`, `hasAiConsent(3, 'screenshots') === false`.

- [ ] **Step 1: Write the failing test.** In `__tests__/utils/aiConsent.test.ts`:
  - Change `expect(SERVER_VERSION).toBe(3);` to `expect(SERVER_VERSION).toBe(4);`.
  - Append:

```ts
describe('screenshots consent (spec 2026-11-11; review focus 5: nobody is asked again for other features)', () => {
  it('needs version 4 for screenshots, and leaves the other purposes at their old minimums', () => {
    expect(CLIENT_VERSION).toBe(4);
    expect(serverHas({ aiConsentVersion: 3 }, 'screenshots')).toBe(false);
    expect(serverHas({ aiConsentVersion: 4 }, 'screenshots')).toBe(true);
    expect(clientHas(3, 'screenshots')).toBe(false);
    expect(clientHas(4, 'screenshots')).toBe(true);
    expect(clientHas(3, 'agent')).toBe(true);
    expect(clientHas(1, 'trip')).toBe(true);
    expect(serverHas({ aiConsentVersion: 3 }, 'agentWallet')).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails.**
  - Run: `npx jest __tests__/utils/aiConsent.test.ts`
  - Expected: FAIL (the versions are 3, and `screenshots` is not a purpose).

- [ ] **Step 3: Implement.**
  - In both `functions/src/aiConsent.ts` and `utils/aiConsent.ts`, set `AI_CONSENT_VERSION = 4`.
  - Add `'screenshots'` to `AiPurpose`, and `screenshots: 4` to `AI_CONSENT_MIN`. Keep every other entry as it is.
  - In `components/ai/AiConsentSheet.tsx`, add to `LEAD`:

```ts
  screenshots: {
    title: 'Read screenshots with AI',
    sends: "The screenshots you add, to find the places in them. They're kept privately in your account and deleted with the save.",
  },
```

- [ ] **Step 4: Run it to verify it passes, then typecheck.**
  - Run: `npx jest __tests__/utils/aiConsent.test.ts && npx tsc --noEmit -p . && (cd functions && npx tsc --noEmit)`
  - Expected: PASS, with no TS errors. A `Record<AiPurpose, …>` elsewhere may now need a `screenshots` entry; add it with the same text as above.

- [ ] **Step 5: Commit.**

```bash
git add functions/src/aiConsent.ts utils/aiConsent.ts components/ai/AiConsentSheet.tsx __tests__/utils/aiConsent.test.ts
git commit -m "feat(ai-consent): version 4 with a screenshots purpose; other features unchanged"
```

---

### Task 3: The `readScreenshots` callable, rules and account deletion

**Files:**
- Modify: `functions/src/socialPostFunctions.ts`: `export` the `placeAll` function, and `export` `OutPlace`.
- Create: `functions/src/screenshotPlacesFunctions.ts`
- Modify: `functions/src/index.ts`: export after `wishCovers`.
- Modify: `functions/src/accountDeletion.ts:12-20`: add `wish_shots/${uid}/`.
- Modify: `__tests__/functions/accountDeletion.test.ts`: the expected list.
- Modify: `storage.rules`, `firestore.rules`.

**Interfaces:**
- Consumes:
  - `validShotsRequest`, `shotPaths`, `SHOTS_SYSTEM`, `SHOTS_PROMPT`, `releaseQuota` (Task 1);
  - `hasAiConsent(…, 'screenshots')` (Task 2);
  - `wishQuota`, `monthKey`, `cleanPlaces`, `parsePlacesAnswer`, `PLACES_SCHEMA` (existing);
  - `generateJson` (existing).
- Produces: callable `readScreenshots({ saveId, count }) → { saveId, city, country, cityLat, cityLng, places: OutPlace[] }`.

- [ ] **Step 1: Write the failing test.** In `__tests__/functions/accountDeletion.test.ts`, add `'wish_shots/abc/',` to the end of the expected `userStoragePrefixes('abc')` array.

- [ ] **Step 2: Run it to verify it fails.**
  - Run: `npx jest __tests__/functions/accountDeletion.test.ts`
  - Expected: FAIL (array mismatch).

- [ ] **Step 3: Add the prefix.** In `functions/src/accountDeletion.ts` `userStoragePrefixes`, add `` `wish_shots/${uid}/`, `` after `place_photos`. Then:
  - Run: `npx jest __tests__/functions/accountDeletion.test.ts`
  - Expected: PASS.

- [ ] **Step 4: Export the placement helper.** In `functions/src/socialPostFunctions.ts`, change `async function placeAll(` to `export async function placeAll(`, and `interface OutPlace` to `export interface OutPlace`.

- [ ] **Step 5: Write the callable.** Create `functions/src/screenshotPlacesFunctions.ts`:

```ts
/**
 * `readScreenshots` — the places in up to 5 screenshots (spec 2026-11-11). Order: the request, consent (screenshots),
 * the shared monthly wish-list limit (claimed before any cost, given back on failure), the images from the caller's
 * own folder, one Gemini call, then the link path's cleaning and Mapbox placement. Nothing is cached; images are never
 * logged or sent anywhere but Gemini.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { AI_CONSENT_REQUIRED_MESSAGE, hasAiConsent } from './aiConsent';
import { isPaidTier } from './flightPolling';
import { generateJson } from './agentModel';
import { PLACES_SCHEMA, cleanPlaces, monthKey, parsePlacesAnswer, releaseQuota, wishQuota, type QuotaDoc } from './socialPost';
import { SHOTS_PROMPT, SHOTS_SYSTEM, shotPaths, validShotsRequest } from './screenshotPlaces';
import { placeAll } from './socialPostFunctions';

const db = () => admin.firestore();
const MAX_BYTES = 2 * 1024 * 1024;

export const readScreenshots = onCall({ region: 'us-central1', timeoutSeconds: 60, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const ask = validShotsRequest(req.data);
  if (!ask) throw new HttpsError('invalid-argument', "Couldn't read these screenshots. Try again");

  const userSnap = await db().doc(`users/${uid}`).get();
  if (!hasAiConsent(userSnap.data(), 'screenshots')) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);
  const paid = isPaidTier(String(userSnap.get('tier') ?? 'free'));

  const now = Date.now();
  const quotaRef = db().doc(`usage_quotas/${uid}/wishlist/${monthKey(now)}`);
  let counted = false;
  await db().runTransaction(async (tx) => {
    const q = wishQuota(((await tx.get(quotaRef)).data() ?? {}) as QuotaDoc, ask.saveId, paid, now);
    if (!q.ok) {
      throw new HttpsError('resource-exhausted', q.reason === 'monthly'
        ? 'Free accounts save 20 places a month. Pro saves as many as you like.'
        : "That's a lot of saving. Try again in a few minutes.", { reason: q.reason });
    }
    counted = q.counted;
    if (q.counted) tx.set(quotaRef, q.patch, { merge: true });
  });
  const giveBack = async () => {
    if (!counted) return;
    await db().runTransaction(async (tx) => {
      tx.set(quotaRef, releaseQuota(((await tx.get(quotaRef)).data() ?? {}) as QuotaDoc, ask.saveId, now));
    }).catch(() => {});
  };

  const bucket = admin.storage().bucket();
  let images: { mimeType: string; data: string }[];
  try {
    images = await Promise.all(shotPaths(uid, ask.saveId, ask.count).map(async (path) => {
      const file = bucket.file(path);
      const [meta] = await file.getMetadata();
      if (Number(meta.size) > MAX_BYTES) throw new Error('too big');
      const [buf] = await file.download();
      return { mimeType: 'image/jpeg', data: buf.toString('base64') };
    }));
  } catch {
    await giveBack();
    throw new HttpsError('not-found', "Couldn't find your screenshots. Try again");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { await giveBack(); throw new HttpsError('unavailable', "Couldn't read these screenshots. Try again"); }
  try {
    const result = await generateJson({
      system: SHOTS_SYSTEM, turns: [{ role: 'user', text: SHOTS_PROMPT, images }], schema: PLACES_SCHEMA, apiKey, thinkingBudget: 0,
      parse: parsePlacesAnswer, timeoutMs: 45_000,
    });
    const answer = cleanPlaces(result.json);
    const placed = await placeAll(answer);
    console.log('readScreenshots', { uid, saveId: ask.saveId, images: images.length, places: placed.places.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs });
    return { saveId: ask.saveId, city: answer.city, country: answer.country, cityLat: placed.cityLat, cityLng: placed.cityLng, places: placed.places };
  } catch (err) {
    console.warn('readScreenshots: AI failed', { saveId: ask.saveId, err: String(err).slice(0, 160) });
    await giveBack();
    throw new HttpsError('unavailable', "Couldn't read these screenshots. Try again");
  }
});
```

  Check that `generateJson`'s result has `json`, `inputTokens`, `outputTokens` and `latencyMs`, as `readSocialPost` uses them (`grep -n "result\\." functions/src/socialPostFunctions.ts`). Also check that `isPaidTier` and `monthKey` import from those modules there. If any name differs, match `readSocialPost`.

- [ ] **Step 6: Export it.** In `functions/src/index.ts`, after `export { wishCovers } from './wishCoverFunctions';`, add `export { readScreenshots } from './screenshotPlacesFunctions';`.

- [ ] **Step 7: Storage rules.** In `storage.rules`, after the `place_photos` block, add:

```
    // Wish-list screenshots (spec 2026-11-11) — private to the owner; 0.jpg…4.jpg caps a save at 5; JPEG under 2 MB; no update.
    match /wish_shots/{userId}/{saveId}/{file} {
      allow read, delete: if request.auth != null && request.auth.uid == userId;
      allow create: if request.auth != null && request.auth.uid == userId
        && file.matches('[0-4]\\.jpg')
        && request.resource.contentType == 'image/jpeg'
        && request.resource.size < 2 * 1024 * 1024;
    }
```

- [ ] **Step 8: Firestore rules.** Replace the `match /wishlist/{videoId}` create/update rule in `firestore.rules` with:

```
      match /wishlist/{videoId} {
        allow read, delete: if isOwner(uid);
        allow create, update: if isOwner(uid)
          && request.resource.data.keys().hasOnly(['platform', 'videoId', 'postUrl', 'author', 'authorHandle', 'caption', 'city', 'country', 'cityLat', 'cityLng', 'savedAt', 'places', 'shots'])
          && request.resource.data.platform in ['tiktok', 'screenshot'] && request.resource.data.videoId == videoId
          && request.resource.data.caption is string && request.resource.data.caption.size() <= 300
          && request.resource.data.places is list && request.resource.data.places.size() <= 10
          && (!('shots' in request.resource.data) || (
            request.resource.data.platform == 'screenshot'
            && request.resource.data.shots is list && request.resource.data.shots.size() >= 1 && request.resource.data.shots.size() <= 5
            && shotsInFolder(request.resource.data.shots, uid, videoId)));
      }
```

  Then add this helper function inside the `match /users/{uid}` block (or next to `isOwner`, matching where the other helpers live). `shots` can only hold paths in the owner's own folder:

```
      function shotIn(s, uid, id) { return s is string && s.matches('wish_shots/' + uid + '/' + id + '/[0-4][.]jpg'); }
      function shotsInFolder(shots, uid, id) {
        return shotIn(shots[0], uid, id)
          && (shots.size() < 2 || shotIn(shots[1], uid, id))
          && (shots.size() < 3 || shotIn(shots[2], uid, id))
          && (shots.size() < 4 || shotIn(shots[3], uid, id))
          && (shots.size() < 5 || shotIn(shots[4], uid, id));
      }
```

- [ ] **Step 9: Typecheck the functions, compile the rules, run the suite.**
  - Run: `(cd functions && npx tsc --noEmit) && npx firebase deploy --only firestore:rules,storage --dry-run 2>&1 | tail -4 && npx jest 2>&1 | grep -E "^Tests:"`
  - Expected: no TS errors; the dry-run ends with "compiled successfully" or "Dry run complete"; all tests pass. If the dry-run is denied by permissions, run `npx firebase deploy --only firestore:rules,storage --dry-run` and record a ledger ruling that the rules compile check is deferred to the owner's deploy step.

- [ ] **Step 10: Commit.**

```bash
git add functions/src/socialPostFunctions.ts functions/src/screenshotPlacesFunctions.ts functions/src/index.ts functions/src/accountDeletion.ts __tests__/functions/accountDeletion.test.ts storage.rules firestore.rules
git commit -m "feat(wishlist): readScreenshots callable, private screenshot storage rules, account deletion sweep"
```

---

### Task 4: App rules for screenshot saves and shares (pure)

**Files:**
- Create: `utils/wishShots.ts`
- Modify: `utils/wishlist.ts`: `WishSave.platform` becomes `'tiktok' | 'screenshot'`, with an optional `shots?: string[]`; `creatorLabel` returns `'Screenshots'` for screenshot saves.
- Modify: `utils/photoUpload.ts`: export `SHOT_MAX_PX = 1600`.
- Test: `__tests__/utils/wishShots.test.ts`, and add to `__tests__/utils/wishlist.test.ts`.

**Interfaces:**
- Produces:
  - `newShotSaveId(randomId: string): string` returns `'s' + randomId` (20 characters).
  - `screenshotSaveDoc(uid, saveId, read: { city; country; cityLat; cityLng; places: WishPlace[] }, keepIds: string[], extra: WishPlace[], shots: string[]): Omit<WishSave, 'savedAtMs'>`. It throws `Error('bad shots')` when `shots` is empty, has more than 5, or holds a path outside `wish_shots/{uid}/{saveId}/`.
  - `shareKind(share: { webUrl?: string | null; text?: string | null; files?: { path: string; mimeType: string }[] | null }): { kind: 'link'; url: string } | { kind: 'shots'; uris: string[] } | null`. Images win when present; the first 5 are kept.
  - `encodePendingShare(p): string` and `parsePendingShare(s: string | null): { kind: 'link'; url: string } | { kind: 'shots'; uris: string[] } | null`. A plain old string is a link.
  - `creatorLabel(save)` returns `'Screenshots'` when `platform === 'screenshot'`.

- [ ] **Step 1: Write the failing tests.** Create `__tests__/utils/wishShots.test.ts`:

```ts
import { encodePendingShare, newShotSaveId, parsePendingShare, screenshotSaveDoc, shareKind } from '@/utils/wishShots';

const read = { city: 'Tokyo', country: 'Japan', cityLat: 35.68, cityLng: 139.69, places: [
  { id: 'p0', name: 'Ichiran Shibuya', kind: 'restaurant' as const, city: 'Tokyo', countryCode: 'JP', lat: 35.66, lng: 139.7 },
  { id: 'p1', name: 'Shibuya Sky', kind: 'sight' as const, city: 'Tokyo', countryCode: 'JP', lat: 35.658, lng: 139.702 },
] };
const SID = 'sAbCdEfGhIjKlMnOpQrSt';

describe('screenshotSaveDoc', () => {
  it('builds the screenshot save shape, keeping the ticked places', () => {
    const doc = screenshotSaveDoc('u1', SID, read, ['p1'], [], [`wish_shots/u1/${SID}/0.jpg`]);
    expect(doc).toEqual({
      platform: 'screenshot', videoId: SID, postUrl: '', author: '', authorHandle: '', caption: '',
      city: 'Tokyo', country: 'Japan', cityLat: 35.68, cityLng: 139.69, places: [read.places[1]], shots: [`wish_shots/u1/${SID}/0.jpg`],
    });
  });
  it('refuses shots outside the user\'s folder, none, or more than 5 (review focus 4)', () => {
    expect(() => screenshotSaveDoc('u1', SID, read, [], [], [])).toThrow('bad shots');
    expect(() => screenshotSaveDoc('u1', SID, read, [], [], [`wish_shots/u2/${SID}/0.jpg`])).toThrow('bad shots');
    expect(() => screenshotSaveDoc('u1', SID, read, [], [], Array.from({ length: 6 }, (_, i) => `wish_shots/u1/${SID}/${i}.jpg`))).toThrow('bad shots');
  });
  it('caps places at 10 with extras', () => {
    const extra = Array.from({ length: 12 }, (_, i) => ({ ...read.places[0], id: `x${i}` }));
    expect(screenshotSaveDoc('u1', SID, read, [], extra, [`wish_shots/u1/${SID}/0.jpg`]).places).toHaveLength(10);
  });
});

describe('newShotSaveId', () => {
  it('is s + the 20-char random id', () => {
    expect(newShotSaveId('AbCdEfGhIjKlMnOpQrSt')).toBe(SID);
  });
});

describe('shareKind (review focus 1: >5 images or mixed files never fail the share)', () => {
  const img = (n: number) => ({ path: `file:///tmp/${n}.png`, mimeType: 'image/png' });
  it('images win, first 5 kept, non-images ignored', () => {
    expect(shareKind({ files: [img(1), { path: 'file:///a.pdf', mimeType: 'application/pdf' }, img(2), img(3), img(4), img(5), img(6)] }))
      .toEqual({ kind: 'shots', uris: ['file:///tmp/1.png', 'file:///tmp/2.png', 'file:///tmp/3.png', 'file:///tmp/4.png', 'file:///tmp/5.png'] });
  });
  it('a TikTok link when there are no images', () => {
    expect(shareKind({ text: 'look https://vm.tiktok.com/ZM8x/' })).toEqual({ kind: 'link', url: 'https://vm.tiktok.com/ZM8x/' });
  });
  it('null for anything else', () => {
    expect(shareKind({ text: 'hello' })).toBeNull();
    expect(shareKind({ files: [{ path: 'file:///v.mov', mimeType: 'video/quicktime' }] })).toBeNull();
  });
});

describe('pending shares (review focus 2: a share survives sign-in; old parked links still parse)', () => {
  it('round-trips both kinds', () => {
    for (const p of [{ kind: 'link' as const, url: 'https://vm.tiktok.com/x/' }, { kind: 'shots' as const, uris: ['file:///1.jpg'] }]) {
      expect(parsePendingShare(encodePendingShare(p))).toEqual(p);
    }
  });
  it('reads an old plain-string link, and null/garbage as nothing', () => {
    expect(parsePendingShare('https://vm.tiktok.com/x/')).toEqual({ kind: 'link', url: 'https://vm.tiktok.com/x/' });
    expect(parsePendingShare(null)).toBeNull();
    expect(parsePendingShare('{"kind":"shots","uris":[]}')).toBeNull();
  });
});
```

Add to `__tests__/utils/wishlist.test.ts`:

```ts
import { creatorLabel as creatorLabelS } from '@/utils/wishlist';
describe('creatorLabel for screenshot saves', () => {
  it('reads Screenshots', () => {
    expect(creatorLabelS({ author: '', authorHandle: '', platform: 'screenshot' })).toBe('Screenshots');
    expect(creatorLabelS({ author: '', authorHandle: 'a', platform: 'tiktok' })).toBe('@a');
  });
});
```

- [ ] **Step 2: Run them to verify they fail.**
  - Run: `npx jest __tests__/utils/wishShots.test.ts __tests__/utils/wishlist.test.ts`
  - Expected: FAIL (the module is missing, and `creatorLabel` returns 'TikTok post' for screenshot saves).

- [ ] **Step 3: Implement.** In `utils/wishlist.ts`:
  - Change `videoId: string; platform: 'tiktok';` in `WishSave` to `videoId: string; platform: 'tiktok' | 'screenshot';`, and add `shots?: string[];` at the end of `WishSave`.
  - Change `creatorLabel` to:

```ts
/** `@handle`, else the creator's name, else "TikTok post" — never a bare "@". Screenshot saves read "Screenshots". */
export const creatorLabel = (p: { author: string; authorHandle: string; platform?: string }) =>
  (p.platform === 'screenshot' ? 'Screenshots' : p.authorHandle.trim() ? `@${p.authorHandle.trim()}` : p.author.trim() || 'TikTok post');
```

  - Update `fromCreator` and `tiktokEyebrow` to accept and pass `platform?: string` (their parameter type becomes `{ author: string; authorHandle: string; platform?: string }`).
  - Make `fromCreator` return `'from your screenshots'` and `tiktokEyebrow` return `'SCREENSHOTS'` when `platform === 'screenshot'`.

In `utils/photoUpload.ts`, add `export const SHOT_MAX_PX = 1600;`.

Create `utils/wishShots.ts`:

```ts
/**
 * Save places from screenshots (spec 2026-11-11): the app's pure rules — the save's id and document, what a share is,
 * and how a share waits for sign-in. A screenshot save is an ordinary wish-list save keyed by `videoId` (= saveId).
 */
import { tiktokUrlFromShare, type WishPlace, type WishSave } from '@/utils/wishlist';

export const newShotSaveId = (randomId: string) => `s${randomId}`;

export function screenshotSaveDoc(
  uid: string, saveId: string,
  read: { city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; places: WishPlace[] },
  keepIds: string[], extra: WishPlace[], shots: string[],
): Omit<WishSave, 'savedAtMs'> {
  const folder = `wish_shots/${uid}/${saveId}/`;
  if (!shots.length || shots.length > 5 || shots.some((s) => !s.startsWith(folder) || !/^[0-4]\.jpg$/.test(s.slice(folder.length)))) throw new Error('bad shots');
  return {
    platform: 'screenshot', videoId: saveId, postUrl: '', author: '', authorHandle: '', caption: '',
    city: read.city, country: read.country, cityLat: read.cityLat, cityLng: read.cityLng,
    places: [...read.places.filter((p) => keepIds.includes(p.id)), ...extra].slice(0, 10), shots,
  };
}

export type ShareKind = { kind: 'link'; url: string } | { kind: 'shots'; uris: string[] };

/** What a share holds: up to 5 images (they win), else a TikTok link, else nothing. */
export function shareKind(share: { webUrl?: string | null; text?: string | null; files?: { path: string; mimeType: string }[] | null }): ShareKind | null {
  const images = (share.files ?? []).filter((f) => f.mimeType?.startsWith('image/') && !!f.path).map((f) => f.path).slice(0, 5);
  if (images.length) return { kind: 'shots', uris: images };
  const url = tiktokUrlFromShare([share.webUrl, share.text].filter(Boolean).join(' '));
  return url ? { kind: 'link', url } : null;
}

export const encodePendingShare = (p: ShareKind) => JSON.stringify(p);

/** A parked share; a plain string (parked by builds before screenshots) is a link. */
export function parsePendingShare(s: string | null): ShareKind | null {
  if (!s) return null;
  if (!s.startsWith('{')) return { kind: 'link', url: s };
  try {
    const p = JSON.parse(s) as Partial<ShareKind>;
    if (p.kind === 'link' && typeof (p as { url?: unknown }).url === 'string') return { kind: 'link', url: (p as { url: string }).url };
    if (p.kind === 'shots' && Array.isArray((p as { uris?: unknown }).uris) && (p as { uris: unknown[] }).uris.length) {
      return { kind: 'shots', uris: (p as { uris: unknown[] }).uris.filter((u): u is string => typeof u === 'string').slice(0, 5) };
    }
  } catch { /* garbage */ }
  return null;
}
```

- [ ] **Step 4: Run them to verify they pass, then typecheck.**
  - Run: `npx jest __tests__/utils/wishShots.test.ts __tests__/utils/wishlist.test.ts && npx tsc --noEmit -p .`
  - Expected: PASS, with no TS errors. If a caller of `creatorLabel` / `fromCreator` / `tiktokEyebrow` doesn't pass `platform`, nothing breaks (it's optional). Pass `save` objects as they are; they carry `platform`.

- [ ] **Step 5: Commit.**

```bash
git add utils/wishShots.ts utils/wishlist.ts utils/photoUpload.ts __tests__/utils/wishShots.test.ts __tests__/utils/wishlist.test.ts
git commit -m "feat(wishlist): screenshot save document, share kinds, parked shares"
```

---

### Task 5: Upload, read, delete and share plumbing (services, hooks, native config)

**Files:**
- Create: `services/wishShots.ts`
- Create: `services/shotDraft.ts`
- Create: `hooks/useShotUrls.ts`
- Modify: `hooks/useWishlist.ts`: `save` writes `shots` when present; `remove` deletes the images first.
- Modify: `services/pendingShare.ts`: store an encoded `ShareKind`.
- Modify: `hooks/useShareIntentRouting.ts`: use `shareKind`, and open screenshot mode.
- Modify: `app.json`: share-intent accepts images.

**Interfaces:**
- Consumes: `newShotSaveId`, `shareKind`, `encodePendingShare`, `parsePendingShare` (Task 4); `SHOT_MAX_PX`, `uploadResize`, `PHOTO_QUALITY` (`utils/photoUpload`).
- Produces:
  - `uploadShots(uid, saveId, uris): Promise<string[]>`, returning storage paths. It throws if any image can't be re-encoded.
  - `readScreenshots(saveId, count): Promise<{ city; country; cityLat; cityLng; places: WishPlace[] }>`
  - `deleteShots(paths: string[]): Promise<void>` (best effort)
  - `setShotDraft(uris: string[]): void` / `takeShotDraft(): string[]`
  - `useShotUrls(paths: string[]): Record<string, string>`
  - `setPendingShare(p: ShareKind)` / `takePendingShare(): Promise<ShareKind | null>`

- [ ] **Step 1: Write the services.** Create `services/wishShots.ts`:

```ts
/**
 * Screenshots for the wish list (spec 2026-11-11): re-encode (JPEG, ≤ 1600 px, no metadata — never the original),
 * upload to the user's private folder, ask the server to read them, and delete them with the save.
 */
import { ref, uploadBytes, deleteObject } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { functions, storage } from '@/services/firebase';
import { PHOTO_QUALITY, SHOT_MAX_PX, uploadResize } from '@/utils/photoUpload';
import type { WishPlace } from '@/utils/wishlist';

async function shotJpeg(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = uploadResize(original.width, original.height, SHOT_MAX_PX);
  const image = resize ? await ImageManipulator.manipulate(uri).resize(resize).renderAsync() : original;
  return (await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })).uri;
}

export async function uploadShots(uid: string, saveId: string, uris: string[]): Promise<string[]> {
  const paths: string[] = [];
  for (const [i, uri] of uris.slice(0, 5).entries()) {
    const jpeg = await shotJpeg(uri); // throws rather than uploading the original (it may carry a location)
    const blob = await fetch(jpeg).then((r) => r.blob());
    const path = `wish_shots/${uid}/${saveId}/${i}.jpg`;
    await uploadBytes(ref(storage, path), blob, { contentType: 'image/jpeg' });
    paths.push(path);
  }
  return paths;
}

export async function readScreenshots(saveId: string, count: number) {
  const { data } = await httpsCallable<{ saveId: string; count: number }, { city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; places: WishPlace[] }>(
    functions, 'readScreenshots', { timeout: 60_000 })({ saveId, count });
  return data;
}

export async function deleteShots(paths: string[]): Promise<void> {
  await Promise.allSettled(paths.map((p) => deleteObject(ref(storage, p))));
}
```

Create `services/shotDraft.ts`:

```ts
/** The screenshots handed to the save sheet (too long for URL params). Taken once. */
let draft: string[] = [];
export const setShotDraft = (uris: string[]) => { draft = uris.slice(0, 5); };
export const takeShotDraft = () => { const d = draft; draft = []; return d; };
```

Create `hooks/useShotUrls.ts`:

```ts
/** Download URLs for a save's screenshots (private folder; owner-only rules), resolved once per session. */
import { useEffect, useState } from 'react';
import { getDownloadURL, ref } from 'firebase/storage';
import { storage } from '@/services/firebase';

const cache = new Map<string, Promise<string | null>>();
const urlFor = (path: string) => {
  if (!cache.has(path)) cache.set(path, getDownloadURL(ref(storage, path)).catch(() => null));
  return cache.get(path)!;
};

export function useShotUrls(paths: string[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = paths.join('|');
  useEffect(() => {
    let live = true;
    Promise.all(paths.map(async (p) => [p, await urlFor(p)] as const)).then((pairs) => {
      if (!live) return;
      setUrls(Object.fromEntries(pairs.filter((x): x is readonly [string, string] => !!x[1])));
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}
```

- [ ] **Step 2: Wish-list writes.** In `hooks/useWishlist.ts` `save`:
  - Destructure `shots` too: `const { platform, videoId, postUrl, author, authorHandle, caption, city, country, cityLat, cityLng, places, shots } = merged;`.
  - Write `...(shots?.length ? { shots } : {})` into the `setDoc` object.

  In `remove`, before `deleteDoc`, add:

```ts
    const s = saves.find((x) => x.videoId === videoId);
    if (s?.shots?.length) await deleteShots(s.shots);
```

  Then import `deleteShots` from `@/services/wishShots`, and add `saves` to `remove`'s deps.

- [ ] **Step 3: Park both kinds of share.** Replace the body of `services/pendingShare.ts` (keep the header comment, and extend it with "links or screenshots"):

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { encodePendingShare, parsePendingShare, type ShareKind } from '@/utils/wishShots';

const KEY = 'pendingShare';
const listeners = new Set<() => void>();

export async function setPendingShare(p: ShareKind): Promise<void> {
  try { await AsyncStorage.setItem(KEY, encodePendingShare(p)); } catch { /* best effort */ }
  listeners.forEach((l) => l());
}

export async function takePendingShare(): Promise<ShareKind | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) await AsyncStorage.removeItem(KEY);
    return parsePendingShare(raw);
  } catch {
    return null;
  }
}

export function onPendingShare(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
```

- [ ] **Step 4: Route shares.** In `hooks/useShareIntentRouting.ts`:
  - Import `shareKind` from `@/utils/wishShots` and `setShotDraft` from `@/services/shotDraft`.
  - Remove the `tiktokUrlFromShare` import.
  - Replace the catcher's effect body:

```ts
    if (!hasShareIntent) return;
    const kind = shareKind({ webUrl: shareIntent.webUrl, text: shareIntent.text, files: shareIntent.files });
    if (kind?.kind === 'link') {
      // One sheet per share: the same link again within 10 s is the same share (it opened twice — device test).
      if (isDuplicateShare(lastShare, kind.url, Date.now())) { resetShareIntent(); return; }
      lastShare = { url: kind.url, at: Date.now() };
    }
    if (kind) setPendingShare(kind);
    else Alert.alert('Share screenshots or a TikTok link', 'Supernova finds the places in screenshots of any post, or in a TikTok link.');
    resetShareIntent();
```

  - Replace the opener's `open`:

```ts
    const open = async () => {
      if (opening) return; // the mount and the listener can race for the same pending share
      opening = true;
      const p = await takePendingShare().finally(() => { opening = false; });
      if (!live || !p) return;
      if (p.kind === 'link') router.push({ pathname: '/wishlist/save' as never, params: { url: p.url } });
      else { setShotDraft(p.uris); router.push({ pathname: '/wishlist/save' as never, params: { mode: 'shots' } }); }
    };
```

  - Update the header comment: "TikTok → Share → Supernova, or screenshots → Share → Supernova".

  Shared files live in the share extension's container, which survives until the app reads them. If on-device testing shows the URIs gone after sign-in, copy them into `FileSystem.cacheDirectory` in the catcher; record that as a ruling.

- [ ] **Step 5: Native config.** In `app.json`, replace the `expo-share-intent` options with:

```json
        "expo-share-intent",
        {
          "iosActivationRules": {
            "NSExtensionActivationSupportsWebURLWithMaxCount": 1,
            "NSExtensionActivationSupportsText": true,
            "NSExtensionActivationSupportsImageWithMaxCount": 5
          },
          "androidIntentFilters": ["text/*", "image/*"],
          "androidMultiIntentFilters": ["image/*"],
          "iosShareExtensionName": "Supernova Share"
        }
```

- [ ] **Step 6: Typecheck and test.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:"`
  - Expected: no TS errors; all tests pass. If any other caller still calls `setPendingShare(url: string)`, change it to `setPendingShare({ kind: 'link', url })`; find them with `grep -rn "setPendingShare" app components hooks services`.

- [ ] **Step 7: Commit.**

```bash
git add services/wishShots.ts services/shotDraft.ts hooks/useShotUrls.ts hooks/useWishlist.ts services/pendingShare.ts hooks/useShareIntentRouting.ts app.json
git commit -m "feat(wishlist): screenshot upload/read/delete, parked screenshot shares, share extension accepts images"
```

---

### Task 6: Screens

**Files:**
- Modify: `app/wishlist/save.tsx`: screenshot mode, the **Save places** heading, and **Add a screenshot** on an empty link read.
- Modify: `components/wishlist/WishlistGrid.tsx`: **Add screenshots** primary, **or paste a link**, and the new empty state.
- Modify: `components/wishlist/WishCard.tsx`: screenshot cover.
- Modify: `app/wishlist/[id].tsx`: a screenshot pager instead of the cover and "Watch on TikTok" for screenshot saves.

**Interfaces:**
- Consumes:
  - `uploadShots`, `readScreenshots`, `deleteShots`, `takeShotDraft`, `setShotDraft`, `useShotUrls` (Task 5);
  - `screenshotSaveDoc`, `newShotSaveId` (Task 4);
  - `useWishlist().save`;
  - `useAiConsentGate().requireConsent('screenshots', …)` (Task 2);
  - `expo-image-picker` `launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 1 })`.

- [ ] **Step 1: A shared picker helper.** Add to `services/wishShots.ts`:

```ts
import * as ImagePicker from 'expo-image-picker';
/** Pick up to 5 screenshots (the system picker; never full library access). [] when cancelled. */
export async function pickShots(): Promise<string[]> {
  const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: 5, quality: 1 });
  return r.canceled ? [] : r.assets.map((a) => a.uri).slice(0, 5);
}
```

  Check the picker API matches what the app already uses: `grep -rn "launchImageLibraryAsync" app components services | head -3`. Match its `mediaTypes` form.

- [ ] **Step 2: Grid entry points.** In `components/wishlist/WishlistGrid.tsx`:
  - Import `pickShots` from `@/services/wishShots`, `setShotDraft` from `@/services/shotDraft`, `Button` from `@/components/ui/Button`, and `ImagesSquare` from `phosphor-react-native`.
  - Add the state `const [showPaste, setShowPaste] = useState(false);`.
  - Add the handlers:

```tsx
  const addShots = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const uris = await pickShots();
    if (!uris.length) return;
    setShotDraft(uris);
    router.push({ pathname: '/wishlist/save' as never, params: { mode: 'shots' } });
  }, []);
  const revealPaste = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowPaste(true); }, []);
```

  - Replace the header block for when saves exist (`{pasteField}{chips…}`) with:

```tsx
              <Button label="Add screenshots" onPress={addShots} fullWidth />
              {showPaste ? pasteField : (
                <Pressable onPress={revealPaste} style={styles.pasteLink} accessibilityRole="button" accessibilityLabel="Or paste a link">
                  <Text style={[styles.pasteLinkText, { color: colors.text.secondary }]}>or paste a link</Text>
                </Pressable>
              )}
              {chips.length > 2 ? <View style={styles.chips}><FilterChips items={chips} selected={city} onSelect={setCity} label="Filter by city" /></View> : null}
```

  - Replace the empty state with:

```tsx
          <EmptyState icon={ImagesSquare} title="Save places you see online"
            description="Screenshot a TikTok, Reel or post and share it to Supernova. We'll find the places."
            actionLabel="Add screenshots" onAction={addShots} actionHaptic="light" />
          {showPaste ? pasteField : (
            <Pressable onPress={revealPaste} style={styles.pasteLink} accessibilityRole="button" accessibilityLabel="Or paste a link">
              <Text style={[styles.pasteLinkText, { color: colors.text.secondary }]}>or paste a link</Text>
            </Pressable>
          )}
```

  - Add the styles `pasteLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' }` and `pasteLinkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium }`. Import `FontWeight`, `Pressable` and `Text`.
  - Check `Button`'s props: `grep -n "fullWidth\|export function Button" components/ui/Button.tsx`.

- [ ] **Step 3: Covers on cards.** In `components/wishlist/WishCard.tsx`:
  - Accept the same `cover` prop.
  - In `WishlistGrid`, compute the screenshot covers: `const shotUrls = useShotUrls(shown.filter((s) => s.shots?.length).map((s) => s.shots![0]));`.
  - Pass `cover={item.shots?.length ? shotUrls[item.shots[0]] ?? null : covers[item.videoId] ?? null}`.
  - Have `useWishCovers` ask only for link saves: `useWishCovers(shown.filter((s) => s.platform !== 'screenshot').map((s) => s.videoId))`.

- [ ] **Step 4: The save sheet.** In `app/wishlist/save.tsx`:
  1. Params: `const { url, mode } = useLocalSearchParams<{ url?: string; mode?: string }>();`, with `const shotMode = mode === 'shots';`.
  2. State:

```ts
  const [shotUris, setShotUris] = useState<string[]>(() => (shotMode ? takeShotDraft() : []));
  const [saveId] = useState(() => newShotSaveId(doc(collection(db, '_')).id));
  const uploaded = useRef<string[]>([]);
  const saved = useRef(false);
```

     Import `doc` and `collection` from `firebase/firestore`, `db` from `@/services/firebase`, `requireOnline` from `@/services/offline`, and the Task 4/5 helpers.
  3. A reader for screenshot mode, beside `run`:

```ts
  const runShots = useCallback(async (uris: string[]) => {
    if (!uid || !uris.length) { setError("Couldn't read these screenshots. Try again"); setLoading(false); return; }
    if (!requireOnline()) { setError('Connect to read these screenshots, then try again.'); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      if (!uploaded.current.length) uploaded.current = await uploadShots(uid, saveId, uris);
      const r = await readScreenshots(saveId, uploaded.current.length);
      setPreview({ videoId: saveId, platform: 'screenshot', postUrl: '', author: '', authorHandle: '', caption: '', coverUrl: null, savedAtMs: 0, shots: uploaded.current, ...r });
      setKept(new Set(r.places.map((x) => x.id)));
    } catch (e) {
      const err = e as { code?: string; details?: { reason?: unknown } };
      if (err.code?.endsWith('resource-exhausted') && err.details?.reason === 'monthly') { openPaywall(); return; }
      if (err.code?.endsWith('failed-precondition')) { requireConsent('screenshots', () => runShots(uris), () => router.back()); return; }
      setError(err.code?.endsWith('resource-exhausted') ? "That's a lot of saving. Try again in a few minutes." : "Couldn't read these screenshots. Try again");
    } finally {
      setLoading(false);
    }
  }, [uid, saveId, requireConsent]); // eslint-disable-line react-hooks/exhaustive-deps
```

  4. The start effect: when `shotMode`, use `requireConsent('screenshots', () => runShots(shotUris), () => router.back())` instead of the link `run`. **Try again** calls `runShots(shotUris)` in screenshot mode.
  5. **Add a screenshot** on an empty link read. Under the "TikTok didn't share this post's details…" text (only when `!shotMode && !postHasDetails(preview)`), render:

```tsx
            <Button label="Add a screenshot" variant="secondary" onPress={useShotsInstead} />
```

     with:

```ts
  const useShotsInstead = useCallback(async () => {
    const uris = await pickShots();
    if (!uris.length) return;
    setShotUris(uris); setPreview(null); setLoading(true);
    requireConsent('screenshots', () => runShots(uris), () => setLoading(false));
  }, [requireConsent, runShots]);
```

     Check that `Button` has a `secondary` variant (CLAUDE.md lists `primary | secondary | ghost | danger`).
  6. Save: in `onSave`, when `preview.platform === 'screenshot'`, call `save(screenshotSaveDoc(uid!, saveId, preview, [...kept], extra, uploaded.current))` instead of `wishlistDoc(...)`. On success set `saved.current = true` before `router.back()`.
  7. No orphans:

```ts
  useEffect(() => () => { if (!saved.current && uploaded.current.length) deleteShots(uploaded.current); }, []);
```

  8. Copy:
     - Change the title text `Save to wish list` to `Save places`.
     - In screenshot mode, the post row shows the screenshot strip instead of the cover and creator: a horizontal `ScrollView` of 56×80 images from `shotUris`, first one with a 2px `colors.brand.purple` border.
     - The empty-places text in screenshot mode is "No places in these screenshots. Add the places you saw and they're saved with them.", and the place field gets `autoFocus` when there are no places.
     - The loading text in screenshot mode is "Reading your screenshots".
     - The footer label in screenshot mode is `count ? \`Save ${count} …\` : 'Save the screenshots'`.

- [ ] **Step 5: The saved-post screen.** In `app/wishlist/[id].tsx`:
  - Use `const shotUrls = useShotUrls(save?.shots ?? []);`.
  - When `save.platform === 'screenshot'`, replace the cover block with a horizontal paging `ScrollView` (`pagingEnabled`) of the screenshots at the same 4:5 cover size (`styles.cover`), with `accessibilityLabel={\`Screenshot ${i + 1} of ${n}\`}`.
  - Tapping a screenshot opens it full screen: an RN `Modal` (black background, `expo-image` with `contentFit="contain"`, a 44 pt close button labelled "Close"), as the spec asks. Don't render the **Watch on TikTok** `Button` for screenshot saves.
  - The eyebrow uses `tiktokEyebrow(save)`, which gives `SCREENSHOTS` from Task 4.
  - Keep `useWishCovers` for link saves only: `useWishCovers(save && save.platform !== 'screenshot' ? [save.videoId] : [])`.

- [ ] **Step 6: Typecheck, test, lint.**
  - Run: `npx tsc --noEmit -p . && npx jest 2>&1 | grep -E "^Tests:" && npx expo lint 2>&1 | grep problems`
  - Expected: no TS errors; all tests pass; `0 errors`.

- [ ] **Step 7: Commit.**

```bash
git add app/wishlist/save.tsx components/wishlist/WishlistGrid.tsx components/wishlist/WishCard.tsx "app/wishlist/[id].tsx" services/wishShots.ts
git commit -m "feat(wishlist): save places from screenshots — grid entry, sheet mode, link fallback, screenshot pager"
```

---

### Task 7: Privacy policy and docs

**Files:**
- Modify: `hosting/privacy.html`: a screenshots paragraph next to the existing AI / wish list text.
- Modify: `CLAUDE.md`: the Social wish list bullet.

- [ ] **Step 1: Find the AI paragraph.**
  - Run: `grep -n "Gemini\|wish list\|TikTok" hosting/privacy.html | head`
  - Expected: a section naming Google Gemini. Add after it, in the same markup style:

```html
<p><strong>Screenshots you save.</strong> When you add screenshots to your wish list, they're sent to our AI provider (Google Gemini) to find the places in them. We keep a reduced copy, with photo metadata removed, privately in your account so you can see what you saved; only you can see it. It's deleted when you delete the save or your account.</p>
```

- [ ] **Step 2: Update CLAUDE.md.** In the **Social wish list** bullet, after the TikTok-restriction sentence, add: "**Screenshots** (spec `2026-11-11-wishlist-screenshots-design.md`; pure `functions/src/screenshotPlaces.ts` + callable `readScreenshots` in `screenshotPlacesFunctions.ts`; app `utils/wishShots.ts`, `services/wishShots.ts`, `services/shotDraft.ts`, `hooks/useShotUrls.ts`): the main way in now — share up to 5 images to Supernova or **Add screenshots** on the wish list (link is the secondary **or paste a link**, and an empty link read offers **Add a screenshot**). Images are re-encoded (JPEG ≤ 1600 px, no metadata, never the original) to private `wish_shots/{uid}/{saveId}/0-4.jpg` (storage rules: owner only, `[0-4].jpg`, JPEG < 2 MB, no update), read by one Gemini call with inline image parts (`ModelTurn.images`), then `cleanPlaces` + `placeAll`; shared monthly quota (`wishQuota` on `saveId`, given back on failure by `releaseQuota`); nothing cached. Saves: `platform: 'screenshot'`, `videoId = saveId` (`s` + 20 chars), `shots` (rules: 1–5 paths in the owner's folder). Consent v4, purpose `screenshots` (others unchanged). `deleteAccount` sweeps `wish_shots/`. Share extension accepts images (native — needs a build). ~$0.001 a save."

- [ ] **Step 3: Commit.**

```bash
git add hosting/privacy.html CLAUDE.md
git commit -m "docs: privacy policy and CLAUDE.md for screenshot saves"
```

---

## After the tasks

- **Final review:** a fresh reviewer over `git merge-base main HEAD..HEAD`, with this plan's Review Focus.
- **Deploy (owner's OK):**
  - functions `readScreenshots`;
  - `firestore:rules` and `storage`;
  - Hosting (privacy).
- **Builds (owner's OK):** iOS and Android. The share extension's image support is native.
