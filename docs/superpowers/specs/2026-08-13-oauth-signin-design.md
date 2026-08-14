# Google & Apple OAuth Sign-In — Design

**Date:** 2026-08-13
**Status:** Approved, ready for implementation planning

## Goal

Add "Continue with Google" and "Sign in with Apple" to the sign-in and sign-up
screens, producing accounts whose Firestore documents are indistinguishable from
those created by email/password sign-up.

## Decisions

| Decision | Choice |
|---|---|
| First-time OAuth user with no username/DOB | Gated `complete-profile` step before app entry |
| Google implementation | `@react-native-google-signin/google-signin` (native sheet) |
| Firebase auth persistence | Fixed as part of this work |
| Platform scope | iOS first; Android code paths written but its client unconfigured |
| Button styling | Apple's native `AppleAuthenticationButton` + a matched custom Google button |
| Shipping order | **Phase 1 — Google only.** Apple deferred pending Apple Developer enrollment |

## Phasing

Sign in with Apple requires an entitlement that only a paid Apple Developer
Program membership can grant. Enrollment is expected the week of 2026-08-17, so
the work splits:

**Phase 1 (now) — everything except Apple.** Auth persistence, the routing gate,
`complete-profile`, the three extractions, and Google sign-in end to end.
`expo-apple-authentication` is **not installed** in this phase: its config plugin
adds an entitlement the App ID cannot yet carry, which introduces signing noise
for no benefit.

**Phase 2 (post-enrollment) — Apple.** Install `expo-apple-authentication`,
implement `signInWithApple()` against the contract below, enable the Apple
provider in Firebase, and render the button. No Phase 1 code changes shape.

The seam that makes this clean: `SocialAuthButtons` renders each provider behind
an availability predicate, and `services/oauth.ts` already exports
`isAppleAuthAvailable()` — which returns `false` in Phase 1. Phase 2 replaces one
function body and adds one dependency.

Until Phase 2 ships, the iOS build offers Google and email only. Note this cannot
be submitted to the App Store in that state — Guideline 4.8 requires Sign in with
Apple wherever a third-party provider is offered — so Phase 1 is a
develop-and-test milestone, not a releasable one.

## Background: why a profile step is required

`app/(auth)/sign-up.tsx:119` requires four fields — `fullName`, `username`,
`email`, `dob`. Two of them have real machinery behind them:

- **username** — debounced live availability check (`checkUsernameAvailability`),
  format validation (`validateUsernameFormat`), then `claimUsername` against a
  separate claims collection.
- **dob** — a hard 13+ age gate (`isUnder13`).

Google and Apple return name and email only. Neither can supply a username or a
date of birth, so an OAuth account cannot be completed from provider data alone.

## Architecture

### The routing gate

The load-bearing change. `app/_layout.tsx:98` currently runs `getDoc` on
`users/{uid}` and, when the document is missing, silently skips profile
hydration and navigates into the app anyway:

```ts
if (snap.exists()) { /* hydrate */ }
router.replace(onboardingDone ? '/(tabs)' : '/(auth)/onboarding');
```

It becomes a fork — no profile document means no app entry:

```ts
if (!snap.exists()) {
  router.replace('/(auth)/complete-profile');
  setInitialized(true);
  return;
}
/* hydrate, then existing tabs/onboarding routing */
```

The gate lives in the `onAuthStateChanged` listener rather than in the OAuth
button handlers. That listener is the single chokepoint every authenticated
session passes through, so one check covers every route to a profile-less
account:

- a first-time OAuth sign-in (the new case),
- an abandoned `complete-profile` session resumed on next launch,
- a user deleted from Firestore but not from Auth,
- **an existing latent bug in the email flow** — a network failure between
  `createUserWithEmailAndPassword` (`sign-up.tsx:145`) and `setDoc`
  (`sign-up.tsx:160`) currently strands a user in the app with no profile.

A check inside `handleGoogleSignIn` would catch only the first of these.

### New files

| File | Responsibility |
|---|---|
| `services/oauth.ts` | `signInWithGoogle()`, `signInWithApple()`, `isAppleAuthAvailable()` — all provider-SDK detail |
| `services/profile.ts` | `createUserProfile(uid, { fullName, username })` — sole writer of the `users/{uid}` shape |
| `app/(auth)/complete-profile.tsx` | Gated step: full name (prefilled), username, birthday |
| `components/auth/SocialAuthButtons.tsx` | Divider + both buttons, shared by sign-in and sign-up |
| `components/auth/UsernameField.tsx` | Input + debounce + format validation + availability state |
| `components/auth/BirthdayField.tsx` | Date picker + `isUnder13` gate |

### Modified files

| File | Change |
|---|---|
| `app/_layout.tsx` | The routing gate (above) |
| `services/firebase.ts` | Auth persistence (below) |
| `app/(auth)/sign-in.tsx` | Render `SocialAuthButtons` below the primary CTA |
| `app/(auth)/sign-up.tsx` | Render `SocialAuthButtons`; adopt the three extractions |
| `app.json` | Two plugins, `usesAppleSignIn`, reversed-client-ID URL scheme |

## `services/oauth.ts`

```ts
export async function signInWithGoogle(): Promise<UserCredential>
export async function signInWithApple(): Promise<UserCredential>
export async function isAppleAuthAvailable(): Promise<boolean>
```

Screens never import a provider SDK directly.

### Google

`GoogleSignin.signIn()` → `GoogleAuthProvider.credential(idToken)` →
`signInWithCredential(auth, cred)`.

`GoogleSignin.configure()` requires **both** `iosClientId` and `webClientId`.
The web client ID is required even on iOS — it is the audience Firebase
validates the `idToken` against, and omitting it produces an auth failure whose
message does not indicate the cause.

### Apple

Apple requires a nonce, passed in two forms:

```
rawNonce    = random string
hashedNonce = SHA256(rawNonce)     → AppleAuthentication.signInAsync({ nonce })
identityToken                       ← returned by Apple
OAuthProvider('apple.com').credential({ idToken: identityToken, rawNonce })
```

Firebase receives the **raw** nonce and verifies it hashes to what Apple signed.
Passing the raw nonce to Apple, or the hashed nonce to Firebase, fails.
`expo-crypto` (already a dependency) provides the hash.

### Capturing Apple's one-time name

Apple returns `fullName` **only on the first authorization for a given Apple ID**
and never again, and leaves Firebase's `user.displayName` as `null`. Because
routing is owned by `_layout.tsx`, the button handler cannot pass the name
forward to `complete-profile`.

`signInWithApple()` therefore calls `updateProfile(user, { displayName })`
immediately after the credential resolves. `complete-profile` reads
`auth.currentUser.displayName`. This mirrors what email sign-up already does at
`sign-up.tsx:148` and requires no transient store or router params.

Apple may return a private-relay address (`@privaterelay.appleid.com`). It is a
real, deliverable address and is stored unchanged.

## `complete-profile.tsx`

Collects full name (prefilled from the provider), username, and birthday via the
shared field components, then calls `createUserProfile`. On success it routes to
`/(auth)/onboarding`, matching the email path.

**Trap door.** A user who abandons this screen is authenticated with no profile.
The gate correctly returns them here on next launch, but without an exit they are
stuck. The screen includes a **"Use a different account"** action calling
`signOut(auth)`, returning to welcome.

This half-registered window is inherent to social sign-in: Firebase creates the
Auth user the instant the provider credential validates, and there is no way to
defer that until profile fields are collected. The requirement is that the state
be resumable (the gate) and escapable (the sign-out).

## Auth persistence

`services/firebase.ts:18` calls `getAuth(app)` with no persistence, so auth state
is memory-only and every cold start signs the user out. This defeats the purpose
of one-tap OAuth.

Installed `@react-native-async-storage/async-storage` is **2.2.0**, so the v2 API
form applies:

```ts
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';

export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(ReactNativeAsyncStorage),
});
```

This also changes existing email/password behavior — those sessions will now
survive restarts as well. That is the intended outcome.

## UI

`SocialAuthButtons` renders below the primary CTA and above the footer link on
both screens — after "Sign in" (`sign-in.tsx:175`) and after the sign-up submit
button. A hairline `or` divider separates them.

The email CTA remains the single filled primary action; the social buttons read
as secondary alternatives, satisfying the one-primary-action-per-screen rule.

Apple uses `AppleAuthentication.AppleAuthenticationButton` (guaranteed
HIG-compliant, removing the main App Store review risk). Google uses a custom
button matched to it in height, radius, and type. Apple's black button already
suits the near-black primary, so the two read as a set.

The Apple button renders only where `isAppleAuthAvailable()` resolves true.

## Error handling

Provider SDKs throw on user cancellation. Treating that as a failure would show
an error to someone who simply changed their mind.

| Condition | Behavior |
|---|---|
| Cancelled (`SIGN_IN_CANCELLED` / `ERR_REQUEST_CANCELED`) | Silent — clear loading, no error box |
| `auth/account-exists-with-different-credential` | "You already have an account with this email. Sign in with your password." |
| `auth/network-request-failed` | "Couldn't reach the network. Check your connection and try again." |
| Play Services unavailable (Android) | Hide the Google button rather than fail on tap |
| Anything else | "Sign in failed. Try again in a moment." |

Errors render in the existing `errorBox` styling on both screens. Auto-linking on
email collision is deliberately not attempted — correct linking requires the
user's password regardless.

## Console configuration (manual prerequisites)

**Phase 1 — complete as of 2026-08-13:**

1. ✅ Firebase → Authentication → Sign-in method → **Google** enabled
   (confirmed by `IS_SIGNIN_ENABLED: true` in the plist).
2. ✅ iOS app registered under bundle ID `com.supernovatravel.app`;
   `GoogleService-Info.plist` at the project root, supplying `CLIENT_ID` and
   `REVERSED_CLIENT_ID`.
3. ✅ Web client ID recorded as `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in
   `.env.local`. Verified to share GCP project `329448816704` with the plist's
   `GCM_SENDER_ID` — a mismatch here is the usual cause of otherwise-inexplicable
   token rejection.

**Phase 2 — blocked on Apple Developer Program enrollment:**

4. ⏳ Apple Developer → Certificates, IDs & Profiles → App ID
   `com.supernovatravel.app` → enable the **Sign in with Apple** capability.
5. ⏳ Firebase → Authentication → Sign-in method → enable **Apple**.

Not required at any phase: Services ID, Team ID, Key ID, and `.p8` private key.
Those apply to web and Android Apple sign-in, which iOS-first scope excludes.

### Secret handling

`GoogleService-Info.plist` is **gitignored** (`.gitignore`), matching how
`.env.local` is already treated — the repo is public and the plist carries the
same project configuration. Consequences:

- Local dev: the file sits at the project root, provisioned manually.
- EAS builds: supply via `eas secret:create --type file`.
- Fresh clones: the file must be downloaded from the Firebase console.

The plist is not a credential — its `API_KEY` is a client identifier that ships
in the app binary, and access control rests on `firestore.rules`. It is excluded
for consistency with existing repo practice, not because it is sensitive.

A dev-client rebuild is required — both libraries ship native modules. This
machine has no `ios/Pods`, so the first build includes a `pod install`.

## Testing

Automated:

- Nonce helper — `SHA256(rawNonce)` matches the value sent to Apple.
- `createUserProfile` — document shape, now shared by two callers where drift
  would silently corrupt accounts.
- The `_layout` gate — profile-missing routes to `complete-profile`;
  profile-present routes to tabs/onboarding.

Manual, in the simulator — Phase 1:

- Google first-time → `complete-profile` → app entry.
- Google returning → straight to tabs, no profile step.
- Cancel the Google sheet → no error shown.
- Force-quit mid-`complete-profile` → relaunch returns there.
- "Use a different account" on `complete-profile` → back to welcome.
- Cold start after sign-in → still signed in (persistence).
- Existing email account → unchanged behavior through the new gate.

The last two are testable before any provider work lands, since persistence and
the gate are exercised by the email flow alone. Sequence them first.

Phase 2 adds:

- Apple first-time → name prefilled from the one-time payload.
- Apple returning → name absent from the payload, profile already populated.
- Cancel the Apple sheet → no error shown.

Phase 2 requires the simulator to be signed into an Apple ID (Settings → Sign in
to your iPhone) or Apple's sheet errors immediately.

## Out of scope

- Android Google sign-in configuration (OAuth client, SHA-1 debug and release
  fingerprints).
- Apple sign-in on Android or web (needs the Services ID / `.p8` limb).
- Account linking between an existing email account and a provider credential.
