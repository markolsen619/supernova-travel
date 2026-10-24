# Google Wallet boarding passes — design

Date: 2026-10-23 · Status: approved in conversation · Third roadmap piece after the calendar feed and Apple Wallet (specs 2026-10-19, 2026-10-22, live updates 2026-10-23)

## Why

Android users can't put a Supernova boarding pass in Google Wallet. iPhone users can (Apple Wallet, with live gate/delay updates). Same pass, same rules, on Android.

## Decisions (owner, 2026-10-23)

- **Generic pass**, not Google's flight class: a third party issuing passes under an airline's brand needs that airline's permission (Wallet API terms), and Google may refuse publishing access.
- Same contents and privacy rules as the Apple pass; free for everyone; live updates through the same trigger.
- Accounts (done 2026-10-23): issuer **3388000000023211693** (Galaxie Labs LLC, merchant BCR2DN6DZLAJ5U2D), demo mode; Wallet API enabled in GCP `supernova-a2125`; service account `supernova-wallet@supernova-a2125.iam.gserviceaccount.com` (no project roles, **no key file**) is a Developer in the Pay & Wallet Console.

## Signing without a key

The functions keep running as the default compute service account (they need Firestore). For Wallet they **impersonate** `supernova-wallet` through the IAM Credentials API:
- `signJwt` signs the "Save to Google Wallet" JWT as `supernova-wallet` (RS256, Google keeps the key);
- `generateAccessToken` (scope `https://www.googleapis.com/auth/wallet_object.issuer`) for the Wallet REST calls.

Needs one grant: **Service Account Token Creator on `supernova-wallet` for `329448816704-compute@developer.gserviceaccount.com`** (on that one service account, not the project). The self-grant made earlier becomes unnecessary and is removed.

## 1. The pass (pure: `functions/src/googlePass.ts`)

- Class `3388000000023211693.supernova_boarding_pass` (generic), created on first use if missing (`ensureClass`, cached per instance).
- Object id `3388000000023211693.bp_{passId}` — one per boarding pass, so adding again updates it.
- `genericObject(pass, timeZone)`:
  - `cardTitle` "Supernova", `header` "LHR → JFK" (cities when known, else codes), `subheader` flight ("KL 1357") or airline;
  - `hexBackgroundColor` `#1a1035` (BoardingPassCard), `logo` = `https://supernova-a2125.web.app/wallet/google-logo.png` (the star, committed under `hosting/wallet/`);
  - `textModulesData`: Departs (date + time in the traveler's zone), Seat, Gate, Terminal, Group, Status — each only when known; Status uses `statusLine` from `applePass.ts` (shared);
  - `barcode` with the real format (`qr→QR_CODE`, `pdf417→PDF_417`, `aztec→AZTEC`, `code128→CODE_128`, unknown → `QR_CODE`), `alternateText` none; no barcode → none;
  - `validTimeInterval.end` = departure + 24 h (moves to "Expired passes" after the trip); `state` `ACTIVE`, `CANCELLED`-flight passes keep `ACTIVE` with Status "Cancelled".
  - Never: names, notes, booking references, trip data.
- **Time zone:** passes store UTC; the server can't know where the traveler is. The app sends its IANA zone with the request; it's saved on the pass as `walletTimeZone` and reused for updates. Invalid/missing → `UTC` label shown ("09:20 UTC").
- `saveJwtClaims(object, serviceAccountEmail, nowS)` → `{ iss, aud: 'google', typ: 'savetowallet', iat, exp: iat + 3600, origins: [], payload: { genericObjects: [object] } }`.

## 2. Server (`functions/src/googleWalletFunctions.ts`)

- Callable `googleWalletJwt({ passId, timeZone })`: signed in; owner only (`permission-denied` / `not-found` like `appleWalletLink`); writes `walletTimeZone` + `googleWalletObject: true` on the pass; `ensureClass`; returns `{ jwt }`.
- Updates: the existing `onBoardingPassWrittenWallet` also PATCHes `genericObject/{id}` when `walletFieldsChanged` and `googleWalletObject` is set (404 = never saved → ignored). Apple and Google run independently; one failing doesn't stop the other.
- `deleteAccount`/pass deletion: the Google object can't be deleted through the API; it's set to `state: 'INACTIVE'` (moves out of the active list) when its pass is deleted.

## 3. App (Android only)

- `components/wallet/AddToGoogleWallet.tsx` under the pass on `app/(wallet)/boarding-pass/[id].tsx`, next to `AddToAppleWallet` (each renders on its own platform only).
- Google's official **"Add to Google Wallet"** button artwork (from Google's Wallet brand guidelines; Google requires its own asset), committed under `assets/wallet/`; shown only when `WalletManager.canAddPasses()` is true.
- Tap → `requireOnline()` → callable with `Intl.DateTimeFormat().resolvedOptions().timeZone` → `WalletManager.addPassToGoogleWallet(jwt)`. `RESULT_CANCELED` silent; other errors "Couldn't add the pass. Try again."; light haptic; spinner over the button.

## Privacy

One sentence in `hosting/privacy.html`: adding a pass to Google Wallet sends its flight details (no name or booking reference) to Google, and we keep the pass updated there.

## Testing

- Pure: `genericObject` (full pass, missing fields omitted, barcode formats, unknown → QR, no barcode, time zone formatting incl. invalid zone, no personal fields, id/class ids), `saveJwtClaims`, `googleObjectId` (allowed characters), status line reuse.
- Live: callable → JWT; decode (no secrets) and check claims; open `https://pay.google.com/gp/v/save/{jwt}` in demo mode with the owner as a test account; edit a pass's gate → PATCH 200.
- Device (1.0.8 Android): button shows, adds, gate change updates.

## Rollout

Server deploy any time. Button with the next Android build. Then add the owner as a test account, then request publishing access (Google review, days).

## Out of scope

Google's flight class, reservations as passes, Smart Tap, location notifications.
