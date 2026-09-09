# Finishing the RevenueCat integration

The client code, Cloud Function and tests are merged. What remains is store and
dashboard configuration, one deploy, and a walk-through on a device — none of it
doable from the codebase.

- **Firebase project:** `supernova-a2125`
- **Entitlement:** `supernova_pro`
- **Offering:** `default`
- **Bundle id:** `com.supernovatravel.app`
- **Webhook function:** `syncTier`, Firebase Functions **v2**, region `us-central1`

This document takes the **real products** path — App Store Connect and Play
Console, not the Test Store. It costs more setup up front but it's the
configuration you actually ship, so nothing has to be redone before launch.

> **Order matters.** Phase 3 before Phase 5. Without the webhook a purchase
> still *looks* like it works — the UI flips to Pro — but the tier never
> persists, which is the exact bug this work fixed.

---

## Why this was needed

`functions/src/generateTrip.ts` gates the free-tier AI quota on
`users/{uid}.tier`, read from Firestore. Nothing in the codebase ever wrote that
field: `services/profile.ts` strips it at signup, and `setTier` only mutated
in-memory Zustand state.

The result was that a paying user unlocked the UI for one session, stayed
rate-limited server-side, and reverted to free on the next launch.
`firestore.rules` already forbade clients from writing `tier` and named "the
RevenueCat webhook's syncTier Cloud Function" — the architecture was designed
for it, but it had never been built.

---

## Phase 0 — Prerequisites that are not code

**This is where the time goes.** None of it is optional, and the failure mode
for all of it is the same: StoreKit returns zero products, the paywall shows its
empty state, and nothing anywhere reports an error.

- [ ] **Paid Apple Developer Program membership**, active.

- [ ] **App Store Connect app record** for `com.supernovatravel.app`.
      Products cannot exist without one.

- [ ] **Agreements, Tax, and Banking → Paid Applications Agreement is `Active`.**

      Not "in progress", not "pending contact info" — Active, with banking and
      tax forms complete. Until it is, every in-app purchase query returns an
      empty list. This single item accounts for most of the "my paywall is
      blank" time people lose, because there is no error to search for.

**Checkpoint:** the Paid Applications Agreement reads Active in App Store
Connect. Do not start Phase 1 before it does.

---

## Phase 1 — Create the products in App Store Connect

Three products. The two subscriptions go in **one subscription group** so that
StoreKit treats them as alternatives to each other — a user moving from monthly
to yearly is an upgrade within the group, not two live subscriptions. Lifetime
is a non-consumable and sits outside any group.

- [ ] **Subscription group** — name it `Supernova Pro`.

- [ ] `com.supernovatravel.app.pro.monthly` — auto-renewable, 1 month, in the group.
- [ ] `com.supernovatravel.app.pro.yearly` — auto-renewable, 1 year, in the same group.
- [ ] `com.supernovatravel.app.pro.lifetime` — **non-consumable**, not in the group.

> **Product identifiers are permanent.** App Store Connect will not let you
> rename one, and will not let you reuse it even after deleting the product.
> These are recorded in `constants/revenuecat.ts` for reference only — nothing
> in the app matches on them, so they exist to be read by humans, which is why
> they are reverse-DNS rather than `monthly` / `yearly` / `lifetime`.

Each product also needs, or it stays in **Missing Metadata** and is never
returned to the SDK:

- [ ] Reference name and price (pick a price tier for every territory).
- [ ] At least one localization — display name and description.
- [ ] A review screenshot (subscriptions only).

**Checkpoint:** all three products read **Ready to Submit**, not Missing
Metadata.

---

## Phase 2 — Wire up RevenueCat

- [ ] **Add the iOS app** in RevenueCat with bundle id `com.supernovatravel.app`.

- [ ] **Upload the In-App Purchase Key.** App Store Connect → Users and Access →
      Integrations → In-App Purchase, generate a key, download the `.p8` (once
      only) and upload it to RevenueCat. Without it RevenueCat cannot receive
      App Store Server Notifications, so renewals and refunds never reach the
      webhook — purchases work, and then quietly stop being tracked.

- [ ] **Import the three products** into RevenueCat with the exact identifiers
      above.

- [ ] **Create the entitlement `supernova_pro`** and attach all three products.

      A typo here fails silently — no error, no empty state, the paywall simply
      never unlocks. The previous code checked `'pro'`, which is why this
      matters.

- [ ] **Build the `default` offering** with three packages, using RevenueCat's
      **standard** package types:
  - Annual → `…pro.yearly`
  - Monthly → `…pro.monthly`
  - Lifetime → `…pro.lifetime`

      The app sorts on `PACKAGE_TYPE` (`utils/offerings.ts`), not product IDs, so
      a store-side rename is harmless — but a *custom* package type sorts to the
      bottom instead of its slot.

- [ ] **Mark the offering current.**

**Checkpoint:** the offering lists three packages and is marked *current*.

---

## Phase 3 — Deploy and connect the webhook

- [x] **Generate a shared secret and add it to `functions/.env`**

      python3 -c "import secrets; print(secrets.token_urlsafe(32))"

  Then append it (this file is gitignored — the secret must never live in a
  committed file):

      REVENUECAT_WEBHOOK_SECRET=<paste the generated value>

  `functions/.env` currently holds only `GEMINI_API_KEY` and has **no trailing
  newline**, so start a new line before pasting or you will silently rename the
  Gemini key.

- [x] **Build and deploy**

      cd functions
      npm run build
      npx firebase deploy --only functions:syncTier

- [x] **Copy the deployed URL.** A v2 function answers on two hostnames — the
      Cloud Run service (`https://synctier-<hash>-uc.a.run.app`) and the
      Firebase alias
      (`https://us-central1-supernova-a2125.cloudfunctions.net/syncTier`).
      Both work. Use the alias: no generated hash to mistype, and it survives
      the underlying Cloud Run service being recreated.

- [ ] **Point RevenueCat at it.** Integrations → Webhooks. Paste the URL and set
      the **Authorization header value** to the secret above, raw, with no
      `Bearer` prefix — `isAuthorized()` compares the header verbatim.

- [x] **Verify the function directly with curl before involving RevenueCat.**
      This isolates the variable: if curl works and RevenueCat doesn't, the
      problem is the dashboard config, not the function. Send four requests and
      read `npx firebase functions:log --only syncTier`:

      A. Wrong Authorization        → 401, "rejected unauthorized webhook call"
      B. INITIAL_PURCHASE, entitlement_ids ["supernova_pro"],
         expiration_at_ms = now + 30d   → 200, result "applied", tier "pro"
      C. EXPIRATION, expiration_at_ms = now - 1s,
         event_timestamp_ms later than B's → 200, result "applied", tier "free"
      D. Replay C verbatim              → 200, result "unchanged"

      Two traps. `entitlement_ids` must contain `supernova_pro`, or
      `resolveTierForEvent()` returns null, the function answers 200, and
      nothing changes — a pass that proves nothing. And C's
      `event_timestamp_ms` must exceed B's, or `shouldApplyEvent()` drops it as
      stale and the revoke path looks broken.

**Checkpoint:** A returns 401 and B/C return 200 with `result: "applied"` —
verified 2026-09-09. Note this proves the deployed secret matches
`functions/.env`; it does *not* prove RevenueCat's copy is right. That surfaces
as `rejected unauthorized webhook call` on the first real event.

---

## Phase 4 — Client keys and a build

- [ ] **Copy the Apple App Store public SDK key** from RevenueCat → API keys.
      It starts `appl_`. This is the *public* key and belongs in the client;
      the secret key never does.

- [ ] **Fill `.env.local`:**

      EXPO_PUBLIC_REVENUECAT_IOS_KEY=appl_…

- [ ] **Clear `EXPO_PUBLIC_REVENUECAT_TEST_KEY` in `.env.local`.**

      It is currently set. `services/revenuecat.ts` resolves
      `API_KEY = TEST_STORE_KEY || PLATFORM_KEY`, so the test key **wins** —
      filling in the iOS key above does nothing until this one is emptied. A
      `test_` key can never validate a real receipt, so the paywall comes up
      blank and every purchase fails, with no error surfaced.

      `assertStoreKeyIsSane()` now catches this in any non-dev build: it logs
      and declines to configure the SDK rather than letting purchases fail
      silently. It is deliberately a no-op in development, where a test key is
      the point.

- [ ] **Mirror both into EAS** so cloud builds get them:

      eas secret:create --scope project --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_…

- [ ] **Build.** Both native modules are absent in Expo Go; call sites degrade
      rather than crash, but nothing transacts.

      npx eas build --profile development --platform ios

---

## Phase 5 — Walk the flow on a device

- [ ] **Create a sandbox tester.** App Store Connect → Users and Access →
      Sandbox → Test Accounts. Use an email you control that is *not* a real
      Apple ID.

- [ ] **Sign in as the sandbox tester** on the device under
      Settings → App Store → Sandbox Account. Do **not** sign the device's real
      Apple ID out — sandbox purchases use this separate slot.

- [ ] **Open the paywall** — three plans, store-localized prices, yearly
      pre-selected with a savings badge. An empty state here means Phase 0 or
      Phase 1 is incomplete, not a code bug.

- [ ] **Buy the monthly plan, then check Firestore.** `users/{yourUid}` should
      carry `tier: 'pro'`, `tierUpdatedAt`, `tierEventId` and
      `tierEventTimestampMs`. **This is the assertion that matters.** If `tier`
      is absent, the webhook isn't landing — return to Phase 3.

- [ ] **Force-quit and relaunch** — still Pro. This previously reverted.

- [ ] **Settings → Subscription** — the Customer Center presents (cancel, change
      plan, refund request, missing purchase).

- [ ] **Sign out, sign in as another account** — must *not* be Pro. Exercises
      the `logOut()` call that was missing from the sign-out path.

- [ ] **Generate two AI trips in one week as a Pro user.** The point of the
      whole exercise: previously the second call returned `resource-exhausted`
      no matter what you'd paid.

- [ ] **Let it expire.** Sandbox renewals are accelerated — a 1-month
      subscription renews roughly every 5 minutes and auto-cancels after 6
      renewals. Watch for the `EXPIRATION` event and confirm the tier drops back
      to `free`. This is the only cheap way to test the revoke path.

---

## Android, when you get to it

Same shape, with one extra gate: Play Console will not return products to the
SDK until a build with the same `applicationId` has been uploaded to a track
(internal testing is enough) and processed. Create the products with the same
identifiers, attach them to `supernova_pro`, and fill
`EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (starts `goog_`).

`eas.json` already has an Android `submit` block; it has no iOS one, so
`eas submit --platform ios` will stop and ask for `ascAppId` / `appleId` /
`appleTeamId`.

---

## The ones that fail quietly

Four, and all four look identical from inside the app — an empty paywall or a
purchase that doesn't stick, with nothing in any log:

1. **Paid Applications Agreement not Active** (Phase 0).
2. **A product still in Missing Metadata** (Phase 1).
3. **A typo in `supernova_pro`** (Phase 2).
4. **`EXPO_PUBLIC_REVENUECAT_TEST_KEY` left set** (Phase 4) — now caught by
   `assertStoreKeyIsSane()` in non-dev builds, which logs and refuses to
   configure.

Everything else on this list fails loudly enough to notice.

---

## What the code already does

| Area | File |
|---|---|
| Entitlement / product identifiers | `constants/revenuecat.ts` |
| SDK lifecycle, entitlement → tier mapping, test-key guard | `services/revenuecat.ts` |
| Hosted paywall + Customer Center | `services/revenuecatUI.ts` |
| Offerings, purchase, restore, live sync | `hooks/useOfferings.ts`, `hooks/usePurchases.ts`, `hooks/useRevenueCatSync.ts`, `hooks/useCustomerInfo.ts` |
| Plan ordering / savings maths | `utils/offerings.ts` |
| Error copy | `utils/purchaseErrors.ts` |
| Webhook | `functions/src/syncTier.ts`, `functions/src/tierEvents.ts` |
| Paywall screen | `app/paywall.tsx`, `components/paywall/PlanOption.tsx` |

Three webhook behaviours worth knowing, the first two covered by tests in
`__tests__/functions/tierEvents.test.ts`:

- **`CANCELLATION` does not revoke.** It means auto-renew went off; the user
  keeps Pro until `EXPIRATION`. Revoking there would cut off people who've paid
  through a future date.
- **`BILLING_ISSUE` does not revoke either** — it opens a grace period. Refunds
  identify themselves by back-dating `expiration_at_ms`, which is why the code
  checks expiry rather than trusting the event type.
- **A missing user document answers 500, not 200.** If a webhook arrives before
  the client has written `users/{uid}`, the function asks RevenueCat to
  redeliver rather than acknowledging an event it couldn't apply. Answering 200
  would drop the grant permanently — `firestore.rules` forbids the client from
  writing its own `tier`, so there is no path by which the app could repair it.

## Known gap

There is no reconciliation for a webhook that is never delivered at all — an
outage that outlasts RevenueCat's retry schedule, or a period when the webhook
URL was wrong. The tier would stay `free` server-side while the SDK reports the
user as Pro, and nothing would notice. If that ever bites, the fix is a callable
that reads the subscriber from RevenueCat's REST API and re-applies the tier,
which the client can invoke when `tierFromCustomerInfo()` disagrees with
`useAuthStore.tier`. Not worth building before launch; worth knowing exists.
