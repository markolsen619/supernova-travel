# Trip invite links — design

Date: 2026-10-30 · Owner-approved in chat (both sections) · Branch `feat/trip-invite-links` (from `feat/ai-grouping`)

## Goal

Invite someone to a trip either from Supernova (as today) or by a text/email link. A person who taps the link and doesn't have the app is sent to the store; once they've signed up they are on the trip. Invites can be started from Home and Profile as well as the trip page.

## Owner decisions

- **Entry points:** an Invite button on each trip card — Home's Today card and next-trip card, and the owner's own **upcoming** trips on Profile (not past trips). The trip page keeps its Invite chip. All open the same sheet.
- **Inviting is free** for everyone, by link or in-app (today `inviteToTrip` refuses free inviters).
- **Splitting a budget stays Pro:** free members tapping Budget get the paywall. Paywall line "Travel together" becomes "Split a trip budget".
- **One link per person:** single-use, expires after 30 days, cancellable.
- **After install:** automatic on Android (Play Install Referrer); on iPhone the invite page says to come back and tap *Open in Supernova*, and new accounts get a *Paste invite link* card on Home for their first 7 days. No paid deep-link vendor.

## What people see

**Invite sheet** (`InviteFriendsSheet`, reworked):
1. Top: **Invite with a link** (primary) → system share sheet with
   `"{First name} invited you to {trip title} on Supernova. Join the trip: https://supernova-a2125.web.app/join/{token}"`.
   Each tap creates a new link. Below it, when any are open: "N link(s) waiting · Cancel" (cancel = all of this inviter's open links for the trip, after a confirm).
2. Below: **Friends on Supernova** — unchanged behaviour (pending request → accept in notifications).

**Tapping the link**
- App installed (universal link / Android App Link): `app/join/[token]` → join screen: inviter's first name, trip title, dates, cover → **Join trip** (primary) / Not now.
- App not installed: web page `/join/{token}` with the same invite and App Store + Google Play buttons, plus "Already have Supernova? Open in Supernova" (the same URL).
  - Android: Play passes `invite={token}` through the install; after sign-up the app joins and opens the trip with the banner "You joined {name}'s trip".
  - iPhone: page copy "After installing, come back and tap Open in Supernova". Home shows a **Paste invite link** card to accounts created < 7 days ago that have no trips; it reads the clipboard only on tap and accepts only `/join/` links on our host.
- Used / expired / cancelled / inviter left: "This invite has expired. Ask {name} for a new one." (page and app), store buttons stay on the page.
- Inviter is notified when someone joins (`trip_invite_accepted`, existing type).

## Server (`functions/src/`)

Pure rules in `tripInviteLinks.ts` (no firebase-admin, unit-tested); wiring in `tripInviteLinkFunctions.ts`.

- **`tripInviteLinks/{token}`** — server-only (no rule = denied). Token: 16 × `a-z0-9` from `crypto.randomBytes`. Fields: `tripId, inviterUid, status: 'open' | 'used' | 'cancelled', createdAt, expiresAtMs (createdAt + 30 d), usedBy, usedAt`.
- **`createTripInviteLink({ tripId })`** — signed in; caller is owner or collaborator; trip exists; limits: ≤ 20 open, unexpired links per trip, ≤ 50 created per inviter per UTC day (`usage_quotas/{uid}/inviteLinks/{day}` counter, transaction). Returns `{ token, url, message }`.
- **`cancelTripInviteLinks({ tripId })`** — cancels the caller's open links for the trip; returns the count. **`openTripInviteLinks({ tripId })`** returns the caller's open count (for the sheet).
- **`previewTripInviteLink({ token })`** — signed in; for an open, unexpired link whose inviter is still on the trip: `{ status: 'open', inviterFirstName, tripTitle, startDate, endDate, coverUrl }` (`coverUrl` key-less, via `coverLookup`); else `{ status: 'expired', inviterFirstName? }`; already a member → `{ status: 'member', tripId }`.
- **`acceptTripInviteLink({ token })`** — one transaction: link open + unexpired, inviter still owner/collaborator, not blocked either way (`isBlockedBetween`), caller isn't the inviter; then `collaborators` arrayUnion, `trips/{id}/invites/{uid}` = `{ inviterUid, status: 'accepted', via: 'link', … }`, link → `used`. Already a member → returns `{ status: 'member', tripId }` without using the link. After commit: `notifyUser(inviter, trip_invite_accepted)`. Returns `{ status: 'joined', tripId }` or throws `failed-precondition` "expired".
- **`inviteToTrip`** — the Pro check is removed (old apps' Pro badge in the UI is harmless).
- **`joinPage`** (onRequest) — Hosting rewrite `/join/**`. Renders the invite (or the expired page) with every value HTML-escaped, cover through `coverLookup` (never a Places URL carrying our key), `Cache-Control: no-store`. Play button: `https://play.google.com/store/apps/details?id=com.supernovatravel.app&referrer=invite%3D{token}`; App Store: `https://apps.apple.com/app/id6810490710`. Same look as the `tripPreview` page.
- **`deleteAccount`** — deletes the caller's `tripInviteLinks` (query by `inviterUid`).

## App

- **Links:** `hosting/.well-known/apple-app-site-association` adds `{"/":"/join/*"}`; `app.json` Android intent filter adds `pathPrefix: "/join/"`. Needs a new build (planned anyway).
- **Pure utils** (`utils/inviteLinks.ts`): `parseInviteToken(url)` (our host + `/join/{16 × a-z0-9}` only), `parseInstallReferrer(ref)` (`invite=token`), `showPasteInviteCard({ createdAtMs, nowMs, tripCount })`, `inviteErrorCopy`.
- **Pending invite:** `services/pendingInvite.ts` — save/read/clear one token in AsyncStorage (`pendingInvite`). Written by `app/join/[token]` when signed out, by the Android referrer check on first launch (`expo-application` `getInstallReferrerAsync`, once per install, `installReferrerChecked`), and by the Paste card. After `hydrateSession` returns a profile, the root layout claims it: `acceptTripInviteLink` → `router.push('/trip/{id}')` with the "You joined" banner; expired → a notice on Home; failure from being offline keeps the token for the next start.
- **Route `app/join/[token].tsx`** (modal): signed in → preview + Join; signed out → save token, `router.replace('/(auth)/welcome')`.
- **Entry points:** `TodayCard`, `NextTripCard` and the owner's own upcoming trips on Profile get an Invite icon button (44 pt, `accessibilityLabel="Invite to {title}"`) opening `InviteFriendsSheet`.
- **Budget gate:** the trip page's Budget chip uses `requirePro` (UI-only gate; expense writes stay as today). `PAYWALL_FEATURE_ICONS` "Travel together" → "Split a trip budget" / "Track a shared budget and split costs with your group".
- **Invite chip** on the trip page loses its Pro badge and `requirePro`.

## Privacy and safety

- A link adds at most one person, once, within 30 days; the inviter can cancel; the inviter must still be on the trip when it's used.
- The page and preview show only the inviter's first name, trip title, dates and a key-less cover — never stops, bookings or other members.
- Blocks are respected both ways. Tokens are unguessable (16 × 36 ≈ 82 bits) and never readable by clients.
- The clipboard is read only when the person taps Paste.

## Testing

Pure Jest tests: token format and message (`tripInviteLinks.ts`), `linkDecision` (open / used / cancelled / expired / inviter left / blocked / already member / self), limits, `parseInviteToken`, `parseInstallReferrer`, `showPasteInviteCard`. Function build + full suite. Device tests: fresh Android install from Internal testing via a link (auto-join), iPhone from TestFlight (tap again + Paste), existing user tapping a link, expired/cancelled link, the web page on desktop.

## Out of scope

Group links for a chat, approval queues, inviting by contacts lookup, email-address matching, paid deferred deep links.
