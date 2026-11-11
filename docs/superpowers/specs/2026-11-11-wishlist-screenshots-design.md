# Save places from screenshots — design

**Date:** 2026-11-11 · **Owner approved:** sections 1–3 in chat (2026-11-10/11) · **Builds on:** `2026-11-06-social-wishlist-design.md`, `2026-11-10-wishlist-grid-smart-add-design.md`

## Why

On 2026-11-10 TikTok stopped giving out post details.

- Its oEmbed endpoint now returns only the id, even for its own documented example.
- `/embed/v2/{id}` answers 429, or a page without the post, intermittently. This happens from GCP and from home IPs alike.

Neither TikTok nor Instagram offers an official way to read someone else's post. Instagram's oEmbed needs a reviewed Meta app and returns no caption. Any feature built on reading posts by link will keep breaking.

So the wish list should read **screenshots**. Gemini reads the place names from the images. This works for any app (TikTok, Instagram Reels, YouTube Shorts, Pinterest, blogs, maps), nobody can switch it off, and it often finds more than captions did: many videos name places only on screen. Link saves stay as a bonus for when TikTok answers.

## Goals

1. Saving places from up to 5 screenshots takes one share or one pick, and the places come back in seconds.
2. A screenshot save is an ordinary wish-list save: the grid, city chips, trip city cards and smart add all work unchanged.
3. Privacy:
   - The images are private to the user.
   - Metadata is stripped before upload.
   - Images are deleted with the save or the account.
   - Consent is asked before the first screenshot read.
4. Cost is about $0.001 per save. It shares the existing 20-a-month free limit; Pro is unlimited.

The wish list has shipped only in TestFlight and internal builds (1.0.9 in the stores has none), so its stored shape can change without breaking a public app.

## 1. What the traveler sees

### Ways in

1. **Share to Supernova.** From the screenshot preview or from Photos, up to 5 images go to Supernova. The share extension accepts images as well as links.
2. **In the app.** The wish list leads with a primary **Add screenshots** button (`ImagesSquare` icon). It opens the photo picker: up to 5 images, `selectionLimit: 5`, never full library access. Under it is a small text link, **or paste a link**, which reveals the paste field.
3. **The link fallback.** When a shared link reads empty ("TikTok didn't share this post's details…"), the sheet shows an **Add a screenshot** button that opens the picker. The chosen images replace the empty link read.

### Empty state

- Icon: `ImagesSquare`.
- Title: **Save places you see online**
- Text: "Screenshot a TikTok, Reel or post and share it to Supernova. We'll find the places."
- Action: **Add screenshots**, with the text link **or paste a link** under it.

### The save sheet in screenshot mode

The sheet is `app/wishlist/save.tsx`, opened in screenshot mode (`mode=shots`) with the images handed over through a small module store, not URL params (see §3).

- **Heading:** **Save places**. This applies to link mode too; the old heading was "Save to wish list".
- **Images:** a strip of the chosen images. The first is marked as the cover.
- **While reading:** "Reading your screenshots…".
- **Then the same as link mode:**
  - the places found, ticked;
  - "Fits your {trip} trip";
  - Add a place by name;
  - one primary **Save N places**, or **Save the screenshots** when there are no places.
- **No places found:** "No places in these screenshots. Add the places you saw and they're saved with them." The place field gets focus.
- **The close button** removes the images uploaded for this save (no orphans).

### After saving

- The grid card shows the first screenshot as its cover. The card's creator line reads **Screenshots**.
- The saved-post screen shows the screenshots (a pager, 4:5, tap to view full screen). It has no "Watch on TikTok" button; link saves keep it.
- Delete removes the images, then the document.

## 2. Reading (server)

### Upload

The app re-encodes each image before it leaves the phone, the same way feed photos are re-encoded (`webJpeg`, `utils/photoUpload.ts`):

- JPEG, long side ≤ 1600 px, quality 0.8;
- no EXIF and no location;
- an image that can't be re-encoded fails rather than uploading the original.

It uploads to `wish_shots/{uid}/{saveId}/{i}.jpg`, where `i` is `0`–`4`. `saveId` is `s` + a Firestore auto-id, made by the app.

### Callable `readScreenshots({ saveId, count, requestId })`

The code lives in `functions/src/screenshotPlacesFunctions.ts`, with pure rules in `functions/src/screenshotPlaces.ts`.

1. **Validate the call.**
   - Signed in.
   - `saveId` matches `^s[A-Za-z0-9]{20}$`.
   - `count` is 1–5.
2. **Consent.** The caller needs `hasAiConsent(user, 'screenshots')`, which is version ≥ 4 (see §3). Otherwise it answers `failed-precondition` with `AI_CONSENT_REQUIRED_MESSAGE`.
3. **Limit, claimed in a transaction before any cost.** It uses the same `wishQuota` and `usage_quotas/{uid}/wishlist/{YYYY-MM}` as links, with `saveId` in the counted list. A retried save is free. The limits are 20 new saves a month free, unlimited for Pro, and ≤ 30 an hour.
4. **Images.** It reads `wish_shots/{uid}/{saveId}/0.jpg … {count−1}.jpg` with the Admin SDK. A missing image answers `not-found`, "Couldn't find your screenshots. Try again". Each image must be ≤ 2 MB.
5. **Gemini, one call.**
   - Model `gemini-2.5-flash`, thinking 0, through the existing `generateJson` with `PLACES_SCHEMA`.
   - The images go as inline JPEG parts.
   - A new system prompt, `SHOTS_SYSTEM`: "You read screenshots a traveler took of travel posts (captions, on-screen text, signs, location tags, maps) and list the specific places they name… Only places shown or named — never guess from the topic. At most 10."
   - It also asks for the screenshots' main city and country.
6. **Clean and place.** The same `cleanPlaces`, then the same Mapbox placement per place in its own city (`placeAll` / `pickByName`, ≤ 25 km).
7. **Return** `{ saveId, city, country, cityLat, cityLng, places }`.
   - Nothing is cached across users, since screenshots are personal.
   - The images are never sent anywhere but Gemini.
   - An AI failure answers `unavailable`, "Couldn't read these screenshots. Try again", and the quota claim is given back.

**Cost:** about 1–1.5k input tokens per image on Gemini Flash, so about $0.001 for 5 images. The log line matches `readSocialPost`'s: `uid`, `saveId`, `images`, `places`, the tokens and latency. It never includes the image contents.

## 3. Data, rules, privacy, sharing

### Wish-list document

`users/{uid}/wishlist/{saveId}` is the same collection.

- **Screenshot saves:**
  - `platform: 'screenshot'`;
  - `videoId: saveId` (every existing reader keys on `videoId`);
  - `postUrl: ''`, `author: ''`, `authorHandle: ''`, `caption: ''`;
  - the city, country and centre fields;
  - `places`, at most 10;
  - `savedAt`;
  - **`shots: string[]`**, 1–5 storage paths.
- **Link saves** are unchanged: `platform: 'tiktok'`, no `shots`.

`WishSave` gains `platform: 'tiktok' | 'screenshot'` and `shots?: string[]`.

### Firestore rules (`users/{uid}/wishlist/{id}`)

- `platform in ['tiktok', 'screenshot']`.
- `'shots'` is added to the allowed keys.
- When `shots` is present:
  - it is a list of 1–5 entries;
  - every entry starts with `wish_shots/{uid}/{id}/`, checked for the first, last and each index up to 5;
  - `platform == 'screenshot'`.

### Storage rules

`match /wish_shots/{userId}/{saveId}/{file}`:

- read and delete if `request.auth.uid == userId`;
- create if the owner, `file.matches('[0-4]\\.jpg')`, `contentType == 'image/jpeg'` and `size < 2 * 1024 * 1024`;
- no update.

The five allowed filenames are what cap a save at 5 images.

### Covers

- Screenshot saves use `getDownloadURL` of `shots[0]`.
- Link saves keep `wishCovers`.

`useWishCovers` stays link-only. A new `useShotUrls(paths)` resolves download URLs, cached for the session.

### Deleting

- **A save:** the app deletes the save's images, then the document.
- **Closing the sheet unsaved:** deletes the images just uploaded.
- **`deleteAccount`:** deletes the Storage prefix `wish_shots/{uid}/`. This is a new per-user folder, as CLAUDE.md requires.

### Consent

- `AI_CONSENT_VERSION` becomes 4, in both `functions/src/aiConsent.ts` and `utils/aiConsent.ts`.
- A new purpose, `screenshots`, has minimum 4. Every other purpose keeps its minimum, so nobody is asked again for trips, imports or Nova.
- The consent sheet's text for `screenshots` says: "Your screenshots are sent to our AI provider (Google Gemini) to find the places in them. They're kept privately in your account and deleted with the save."

### Privacy policy

`hosting/privacy.html` gets a short paragraph saying the same. This needs a Hosting deploy.

### Share extension (expo-share-intent 5.1, native)

- **iOS:** activation rules accept images (`NSExtensionActivationSupportsImageWithMaxCount: 5`) as well as web URLs and text.
- **Android:** the intent filters gain `SEND` and `SEND_MULTIPLE` for `image/*`.
- **Routing:**
  - Shared files are copied into the app's cache.
  - `services/pendingShare.ts` parks `{ kind: 'shots', uris }` alongside links.
  - The tabs open `/wishlist/save?shots=…` once auth settles. The sheet receives the URIs through a module-level store, not URL params, because of the param length.
  - More than 5 images keeps the first 5.

This needs a store build. That's expected, since 1.1.0 ships as a build.

## Testing

Pure-function tests (the project has no renderer and no rules tests):

- **`screenshotPlaces.ts`:**
  - `validShotsRequest` (saveId format, count 1–5);
  - `shotPaths(uid, saveId, count)`;
  - the answer passes through `cleanPlaces` (≤ 10, kinds, empty names dropped);
  - `SHOTS_SYSTEM` mentions "never guess".
- **`utils/wishlist.ts`:**
  - `screenshotSaveDoc(saveId, uid, read, keep, extra, shotPaths)` builds the exact shape: platform, `videoId = saveId`, empty link fields, shots within the folder, ≤ 5;
  - `wishCover(save)` returns the shot path for screenshots and the link for TikTok;
  - `creatorLabel` gives **Screenshots** for screenshot saves.
- **Consent:** `hasAiConsent(…, 'screenshots')` is false at 3 and true at 4. The other purposes are unchanged at 3.
- **Quota:** a screenshot `saveId` counts once, using the existing `wishQuota` tests' style.
- **Shares:** `shareKind(payload)` returns `link` or `shots` (≤ 5, images only) or null.

The rules are compiled before deploy (`firebase deploy --only firestore:rules,storage --dry-run`), then checked on a device: save, view, delete, and refused writes outside your folder.

## Out of scope

TikTok's embed player, reading videos (screenshots only), text recognition on the phone, sharing saves with others, and other platforms' links.
