# Email import — a forwarding address for bookings

Status: approved in conversation 2026-10-04 · Pro only · Part 2 of the premium
wallet (Part 1: `2026-10-03-wallet-trip-matching-design.md`, whose matching
every imported booking goes through).

## Intent

A Pro user forwards confirmation emails — by hand, or automatically with a
mail filter — to their own address, and the bookings land in their wallet,
matched to their trips, with a push to say so. It works with any mail
provider and needs no access to anyone's inbox.

Decided in conversation:
- **Domain:** `supernovatravel.xyz`, registered on Cloudflare (account
  `olsen.mark85@gmail.com`), Email Routing on. Mail for `galaxielabs.space`
  (Microsoft 365) is untouched.
- **Pipeline:** Cloudflare Email Routing catch-all → a Cloudflare Email Worker
  → our Firebase function. No paid mail service.
- **The address is the credential:** random, unguessable, replaceable. The
  sender is not checked — Gmail's automatic forwarding keeps the airline as
  the sender.

## Pipeline

1. **Email Routing** catch-all rule on `supernovatravel.xyz`: *Send to
   Worker* `supernova-email-inbound`.
2. **Worker** (`cloudflare/email-inbound/`, deployed with wrangler): for each
   message, reject nothing (no bounces — they confirm an address exists);
   if the raw size is over 10 MB, drop it. Otherwise POST to
   `https://us-central1-supernova-a2125.cloudfunctions.net/inboundEmail` with
   body `{ to, from, raw }` (`raw` = the MIME message, base64) and header
   `X-Supernova-Signature: hex(HMAC-SHA256(secret, body))`. The secret is a
   Worker secret (`INBOUND_SECRET`) and a Firebase secret
   (`INBOUND_EMAIL_SECRET`), the same random 32-byte value.
3. **`inboundEmail`** (`onRequest`, us-central1, `maxInstances: 5`, 120 s):
   - Verify the signature (constant-time) — else 401, nothing logged for the user.
   - `to` local part → `inboundAddresses/{token}` → `uid`. Unknown → 200, dropped.
   - Parse MIME (`mailparser`): subject, text (or HTML → text), PDF
     attachments (first two, ≤ 5 MB each). Other attachments ignored.
   - **Gmail forwarding confirmation** (`from` ends `@google.com` and subject
     contains "Forwarding Confirmation"): extract the code (`/\b\d{6,9}\b/`
     from the body) → `users/{uid}.gmailForwardingCode = { code, at }` →
     log `gmail_confirmation`. Not sent to the AI.
   - **Gates, in order** (each writes an import-log row with that status, no AI
     call): not Pro → `needs_pro`; no AI consent (`hasAiConsent`) →
     `needs_consent`; ≥ 25 email imports today (UTC, `usage_quotas` key
     `email_imports_YYYY-MM-DD`) → `daily_limit`; `looksLikeBooking` false →
     `not_booking`.
   - **Parse** with Gemini (the `parseTravelConfirmation` prompt, extended to a
     list: `{ "bookings": [ <same per-booking JSON as today> ] }`, at most 6)
     from the text plus PDFs (inline `application/pdf` parts). None found →
     `unreadable`.
   - **Save** each booking to `boarding_passes` / `reservations` with
     `ownerUid`, `source: 'email'`, `emailImportId`, the place fields
     (Part 1's `draftPlaceFields` mapping, server copy), then `matchOne`
     (Part 1) for each.
   - Log `imported` with the created item refs and the trip they linked to (if
     any); count the quota; send one push (below).
   - Any exception → log `unreadable`, 200 (Cloudflare must not retry into
     duplicates).

`looksLikeBooking(subject, text)`: case-insensitive match of any of
confirmation, itinerary, booking, reservation, e-ticket, eticket, boarding
pass, check-in, flight, hotel, PNR, record locator, confirmation number, your
trip, receipt — or a PDF attached. Deliberately loose: it only filters out
plainly unrelated mail before paying for AI.

## Data

| Path | Contents | Access |
|---|---|---|
| `inboundAddresses/{token}` | `{ uid, createdAt }` | server only (no client rule) |
| `users/{uid}.importAddress` | `{ token, createdAt }` | owner read (existing user rules) |
| `users/{uid}.gmailForwardingCode` | `{ code, at }` | owner read; server writes |
| `users/{uid}/emailImports/{id}` | `{ receivedAt, subject (≤140), status, items: [{ kind, id, title }], tripTitle?: string }` | owner read; server writes; owner delete |

`token`: 10 characters from `a-z0-9` (≈ 52 bits), e.g. `k7x2m9qpz4`;
address `{token}@supernovatravel.xyz`. Status values: `imported`,
`not_booking`, `unreadable`, `needs_pro`, `needs_consent`, `daily_limit`,
`gmail_confirmation`. The log keeps the newest 50 (older rows deleted on
write). The email body is never stored.

**Callables:**
- `createImportAddress()` — Pro + AI consent required (`permission-denied` /
  `failed-precondition` otherwise). Returns the existing address if there is
  one; else creates the token (retry on collision), writes both docs.
- `rotateImportAddress()` — Pro; deletes the old `inboundAddresses` doc,
  creates a new token, clears `gmailForwardingCode`.

**deleteAccount:** deletes `inboundAddresses/{token}` for the user and the
`emailImports` subcollection.

**Push:** new notification type `email_import`, written through `notifyUser`
with `{ type: 'email_import', kind, itemId }`:
- linked: "Added AA 104 to your wallet · Rome in Spring"
- ask: "Is this hotel for a trip? Tap to choose"
- otherwise: "Added Hotel Artemide to your wallet"
- several bookings: "Added 2 bookings to your wallet"
Routes (`utils/notificationRoute.ts` and `functions/src/pushData.ts`) open the
booking's wallet detail (`/(wallet)/boarding-pass/{id}` or
`/(wallet)/reservation/{id}`); several → the Email import screen.

## App

**Wallet:** an **Email import** row near the top (after Import). Free → PRO
tag, tap opens the paywall.

**`app/(wallet)/email-import.tsx`:**
- No address: eyebrow `EMAIL IMPORT`, title "Forward bookings to Supernova",
  "Send confirmation emails to your own address and they land in your wallet,
  matched to your trips." Primary **Create my address** — wrapped in
  `useAiConsentGate().requireConsent('import', …)`.
- With address: card with the address and **Copy** (Light haptic, tick);
  **Set up automatic forwarding** (expands Gmail steps with a copyable filter —
  `subject:(confirmation OR itinerary OR booking OR reservation OR e-ticket OR "boarding pass")`
  — and one line each for Outlook and iCloud Mail); the **Gmail confirmation
  card** while `gmailForwardingCode.at` is under 24 h old ("Gmail confirmation
  code · 123456", Copy); **Recent emails** (the log, newest first: subject,
  relative time, status line — "Added 2 bookings · Rome in Spring" (tap →
  booking), "Not a booking", "Couldn't read this — try pasting it into Import
  instead", "Needs Pro", "Allow AI import to use this", "Daily limit reached",
  "Gmail confirmation"); empty state icon + "No emails yet" + "Forward a
  confirmation to see it here." + Copy address; **Get a new address** text
  link with a confirm ("Your old address stops working right away.", Medium
  haptic).

**Wallet detail:** items with `source: 'email'` show "From email" under the
hero.

## Testing (pure, Jest)

`signatureValid` (good / tampered body / wrong secret / missing), `tokenFromAddress`
(case, plus-tags, other domains rejected), `newToken` (length, alphabet),
`looksLikeBooking`, `gmailConfirmation` (code extraction from a real Gmail
confirmation body; non-Google senders ignored), `importGate` (order:
needs_pro → needs_consent → daily_limit → not_booking → parse),
`bookingsFromParse` (list, cap 6, malformed entries dropped, each mapped to
the wallet item shape with place fields), `emailPushCopy` (four copies),
`trimImportLog` (keeps newest 50), notification route for `email_import`
(single → booking, several → email import screen) on both sides.

## Out of scope

Gmail API access, sender allowlists, storing emails, `.pkpass` attachments,
importing loyalty statements, editing a parsed booking before it's saved
(it is saved, then editable as any wallet item).
