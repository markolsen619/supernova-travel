# Finishing the RevenueCat integration

The client code, Cloud Function and tests are merged. What remains is dashboard
configuration and a deploy — none of it doable from the codebase.

- **Firebase project:** `supernova-a2125`
- **Entitlement:** `supernova_pro`
- **Offering:** `default`

> **Order matters.** Do Phase 2 before testing a purchase. Without the webhook a
> purchase still *looks* like it works — the UI flips to Pro — but the tier never
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

## Phase 1 — Configure the dashboard (~15 min)

Runs entirely on the Test Store key. No App Store Connect or Play Console needed.

- [ ] **Create three products in the Test Store**
  - `monthly` — renewing, 1 month
  - `yearly` — renewing, 1 year
  - `lifetime` — non-renewing, one-time

  Identifiers must match exactly; they're recorded in `constants/revenuecat.ts`.

- [ ] **Create the entitlement `supernova_pro`** and attach all three products.

  A typo here fails silently — no error, no empty state, the paywall simply never
  unlocks. The previous code checked `'pro'`, which is why this matters.

- [ ] **Build the `default` offering** with three packages, using RevenueCat's
      **standard** package types:
  - Annual → `yearly`
  - Monthly → `monthly`
  - Lifetime → `lifetime`

  The app sorts on `PACKAGE_TYPE`, not product IDs, so a store-side rename is
  harmless — but a *custom* package type sorts to the bottom instead of its slot.

**Checkpoint:** the offering lists three packages and is marked *current*.

---

## Phase 2 — Deploy and connect the webhook (~10 min)

- [ ] **Generate a shared secret and add it to `functions/.env`**

      python3 -c "import secrets; print(secrets.token_urlsafe(32))"

  Then append it (this file is gitignored — the secret must never live in a
  committed file):

      REVENUECAT_WEBHOOK_SECRET=<paste the generated value>

  `functions/.env` already holds `GEMINI_API_KEY` and has no trailing newline, so
  start a new line before pasting.

- [ ] **Build and deploy**

      cd functions
      npm run build
      npx firebase deploy --only functions:syncTier

- [ ] **Copy the deployed URL from the output.** Don't construct it by hand — v2
      functions get a Cloud Run-style URL, and a guess fails quietly.

- [ ] **Point RevenueCat at it.** Integrations → Webhooks. Paste the URL and set
      the **Authorization header value** to the secret above, raw, with no
      `Bearer` prefix — the function compares the header verbatim.

- [ ] **Fire a test event and read the log**

      npx firebase functions:log --only syncTier

  Success looks like `[syncTier] processed` or
  `[syncTier] skipped anonymous app_user_id`. If you see
  `rejected unauthorized webhook call`, the secret doesn't match.

**Checkpoint:** a dashboard test event produces a log line other than *unauthorized*.

---

## Phase 3 — Build and walk the flow (~20 min)

Both native modules are absent in Expo Go. Call sites degrade rather than crash,
but nothing transacts.

- [ ] **Development build**

      npx eas build --profile development --platform ios

- [ ] **Open the paywall** — three plans, store-localized prices, yearly
      pre-selected with a savings badge.

- [ ] **Buy the monthly plan, then check Firestore.** `users/{yourUid}` should
      carry `tier: 'pro'` and `tierUpdatedAt`. **This is the assertion that
      matters.** If `tier` is absent, the webhook isn't landing — return to Phase 2.

- [ ] **Force-quit and relaunch** — still Pro. This previously reverted.

- [ ] **Settings → Subscription** — the Customer Center presents (cancel, change
      plan, refund request, missing purchase).

- [ ] **Sign out, sign in as another account** — must *not* be Pro. Exercises the
      `logOut()` call that was missing from the sign-out path.

- [ ] **Generate two AI trips in one week as a Pro user.** The point of the whole
      exercise: previously the second call returned `resource-exhausted` no matter
      what you'd paid.

---

## Phase 4 — Before charging real money

- [ ] Create real products in App Store Connect / Play Console with matching
      identifiers, attached to the same `supernova_pro` entitlement.

- [ ] Fill the platform keys in `.env.local`:

      EXPO_PUBLIC_REVENUECAT_IOS_KEY=
      EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=

- [ ] **Remove `EXPO_PUBLIC_REVENUECAT_TEST_KEY` from `.env.local`.** It takes
      precedence over the platform keys whenever set and cannot validate a real
      receipt — leaving it in ships a build where nobody can buy anything, and it
      fails quietly.

- [ ] Repoint the webhook at production, if you run a separate Firebase project.

---

## The two that fail quietly

A typo in `supernova_pro` (Phase 1) and a leftover test key (Phase 4). Neither
surfaces an error; the app just never unlocks. Everything else on this list fails
loudly enough to notice.

---

## What the code already does

| Area | File |
|---|---|
| Entitlement / product identifiers | `constants/revenuecat.ts` |
| SDK lifecycle, entitlement → tier mapping | `services/revenuecat.ts` |
| Hosted paywall + Customer Center | `services/revenuecatUI.ts` |
| Offerings, purchase, restore, live sync | `hooks/useOfferings.ts`, `hooks/usePurchases.ts`, `hooks/useRevenueCatSync.ts`, `hooks/useCustomerInfo.ts` |
| Plan ordering / savings maths | `utils/offerings.ts` |
| Error copy | `utils/purchaseErrors.ts` |
| Webhook | `functions/src/syncTier.ts`, `functions/src/tierEvents.ts` |
| Paywall screen | `app/paywall.tsx`, `components/paywall/PlanOption.tsx` |

Two webhook behaviours worth knowing, both covered by tests in
`__tests__/functions/tierEvents.test.ts`:

- **`CANCELLATION` does not revoke.** It means auto-renew went off; the user keeps
  Pro until `EXPIRATION`. Revoking there would cut off people who've paid through
  a future date.
- **`BILLING_ISSUE` does not revoke either** — it opens a grace period. Refunds
  identify themselves by back-dating `expiration_at_ms`, which is why the code
  checks expiry rather than trusting the event type.
