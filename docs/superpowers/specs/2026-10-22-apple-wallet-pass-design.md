# Apple Wallet boarding passes — design

Date: 2026-10-22 · Status: approved in conversation, awaiting spec review · Second of three roadmap pieces (calendar done; Google Wallet next, separate spec)

## Why

At the gate people open Wallet, not an app. Supernova keeps the boarding pass but can't put it there. The app also redraws every barcode as QR (`BarcodeDisplay`), while gate scanners usually expect the airline's original PDF417/Aztec — a Wallet pass shows the real format.

## Decisions (owner, 2026-10-22)

- **Boarding passes only** (reservations later, if ever).
- **Static passes first:** the pass shows what is saved when added; adding again replaces it (same `passTypeIdentifier` + `serialNumber`). Live updates (Apple pass web service + push, driven by Pro flight-status polling) are a later follow-up.
- **Approach A — a short-lived secure link:** the app asks the server for a link; iPhone opens it and shows Apple's own Add to Wallet sheet. No new native module. (Rejected: a native PassKit module — third-party native dependency in every build.)
- **Free** for everyone (it's the user's own pass); the 2-item free wallet limit is unchanged.

## Credentials (created 2026-10-22)

Pass Type ID `pass.com.supernovatravel.app`, team `R47484PAGA`, certificate valid to 2027-11-22. Files live in `~/.config/supernova/` (`passkit.key`, `passkit-cert.pem`, `wwdr-g4.pem`) and go to Cloud Functions as **Firebase secrets** `PASSKIT_KEY`, `PASSKIT_CERT`, `PASSKIT_WWDR`, plus `WALLET_LINK_SECRET` (random, HMAC for links). Never committed, never logged.

## 1. The link

- Callable `appleWalletLink({ passId })`: signed in; reads `boarding_passes/{passId}`; refuses unless `ownerUid == caller` (`permission-denied`) or the pass is missing (`not-found`). Returns `{ url }` = `https://supernova-a2125.web.app/wallet/apple/{token}.pkpass`.
- **Token** (pure, `functions/src/walletLink.ts`): `base64url(passId.uid.expiresAtMs).base64url(HMAC-SHA256(secret, payload))`, expiry **5 minutes**. `verifyWalletToken(token, secret, now)` → `{ passId, uid } | null` (bad signature, malformed, expired → null; constant-time compare).
- HTTPS `appleWalletPass` (Hosting rewrite `/wallet/apple/**`): verifies the token, re-reads the pass, re-checks `ownerUid == uid`, builds and signs the `.pkpass`, responds `application/vnd.apple.pkpass` with `Cache-Control: no-store`. Anything invalid → 404, empty body. Nothing is stored.

## 2. The pass

Pure builder `functions/src/applePass.ts` → `passJson(pass, now)` (the `pass.json` object); signing/zipping by `passkit-generator` in the wiring file.

- `formatVersion 1`, `passTypeIdentifier`, `teamIdentifier`, `serialNumber` = `bp-{passId}`, `organizationName` "Supernova", `description` "Boarding pass {flight}", `logoText` = airline (or "Supernova").
- `boardingPass.transitType` `PKTransitTypeAir`.
- Fields:
  - header: gate (`GATE`, "—" when unknown)
  - primary: `origin` (label = origin city) → `destination` (label = destination city), IATA codes as values
  - secondary: departure (`DEPARTS`, time), seat (`SEAT`), group (`GROUP`, only if set)
  - auxiliary: flight number (`FLIGHT`), terminal (`TERMINAL`, only if set), date (`DATE`)
  - back: airline, arrival time (if any), "Added from Supernova"
- Times: `dateStyle`/`timeStyle`, value = the stored ISO string, shown in the **phone's** time zone (final review: times are stored in UTC, so `ignoresTimeZone` would have shown UTC; airport-local display needs an airport time-zone lookup — later). `relevantDate` = departure (lock-screen relevance).
- Barcode: `barcodes: [{ format, message, messageEncoding: 'iso-8859-1' }]` with `aztec→PKBarcodeFormatAztec`, `qr→PKBarcodeFormatQR`, `pdf417→PKBarcodeFormatPDF417`, `code128→PKBarcodeFormatCode128`; missing format → QR; no barcode → no `barcodes` key.
- Colours: `backgroundColor rgb(26,16,53)` (the app's `BoardingPassCard`), `foregroundColor rgb(255,255,255)`, `labelColor rgb(196,181,253)`.
- Images: `icon.png` / `@2x` / `@3x` (29/58/87 pt) and `logo.png` / `@2x` (≤160×50) from the app's star (`assets/images/SupernovaStar.png`), generated once and committed under `functions/assets/pass/`.
- Never included: the user's name, notes, email, booking references, trip data.

## 3. In the app

- Boarding pass detail screen, **iOS only**: Apple's official **"Add to Apple Wallet"** badge (downloaded from Apple's guidelines page, committed under `assets/wallet/`), below the barcode. Tap → `requireOnline()` → callable → `WebBrowser.openBrowserAsync(url)` (in-app Safari shows the Add sheet); if that fails, `Linking.openURL(url)` (Safari). Light haptic; spinner on the badge while waiting; inline error "Couldn't prepare the pass. Try again."
- `services/appleWallet.ts` (callable), no new native module.

## Testing

- Pure: token round trip, tamper (payload and signature), expiry, malformed; `passJson` for a full pass, no barcode, no arrival, each barcode format mapping, unknown format → QR, `ignoresTimeZone`, serial number stable, no personal fields present.
- Server: a local script signs a pass with the real certificate and `openssl`/unzip checks manifest + signature (no deploy).
- Device (next build): add a pass, check barcode type/fields/lock-screen relevance, add again → replaces, not duplicates.

## Out of scope

Live updates, reservations as passes, Google Wallet (own spec), Android.
