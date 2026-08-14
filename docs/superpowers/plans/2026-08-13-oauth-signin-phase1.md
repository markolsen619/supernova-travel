# Google OAuth Sign-In (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google sign-in to the sign-in and sign-up screens, gated behind a profile-completion step so OAuth accounts end up identical to email accounts.

**Architecture:** A gate in the `onAuthStateChanged` listener refuses app entry to any account without a `users/{uid}` document, routing it to a new `complete-profile` screen that collects username and birthday. Provider SDK detail is isolated in `services/oauth.ts`. Username/birthday logic is extracted from `sign-up.tsx` into shared components so both sign-up paths use one implementation.

**Tech Stack:** Expo SDK 54, Expo Router v6, Firebase JS SDK 12.12.1, `@react-native-google-signin/google-signin`, Jest + `jest-expo`.

**Spec:** `docs/superpowers/specs/2026-08-13-oauth-signin-design.md`

## Global Constraints

- **Apple sign-in is Phase 2.** Do NOT install `expo-apple-authentication`. `isAppleAuthAvailable()` returns `false` in this phase.
- **Testing is pure-function only.** There is no `@testing-library/react-native` in this project. Never plan or write component render tests. Extract logic into pure functions and test those.
- Run tests non-watch: `npx jest <path>`. (`npm test` is `jest --watchAll` and will hang.)
- All components use `const { colors } = useTheme()` — never import `DarkColors`/`LightColors`, except the documented always-dark screens.
- `StyleSheet.create` is module-level; theme-dependent colors go in **inline styles only**.
- `useCallback` for every handler passed as a prop to a child component.
- Import `auth`, `db` from `@/services/firebase` — never `getAuth()`/`getFirestore()`.
- `@/` path alias for all imports.
- Phosphor icons only, **no emoji**. Touch targets ≥44pt. Icon-only buttons need `accessibilityLabel`.
- Haptics: `Light` on navigation/select, `Medium` on create/destructive.
- Copy is sentence case, verb-first, no exclamation marks, no "successfully"/"please"/"simply".
- **Before shipping any UI task (7, 11), read `.claude/skills/supernova-design/SKILL.md` and run its pre-ship checklist.** UI shipped without it is not done.
- Bundle ID `com.supernovatravel.app`; Firebase project `supernova-a2125`; GCP project number `329448816704`.

---

### Task 1: Firebase auth persistence

**Files:**
- Modify: `services/firebase.ts:2,18`

**Interfaces:**
- Consumes: nothing
- Produces: `auth` (unchanged export name and type) now backed by AsyncStorage persistence

**Background:** `getAuth(app)` gives memory-only persistence, so every cold start signs the user out. `@react-native-async-storage/async-storage` is already a dependency at **2.2.0**, so the **v2** API form applies (`getReactNativePersistence(ReactNativeAsyncStorage)`), not the v3 `createAsyncStorage` form.

**Critical gotcha:** `getReactNativePersistence` is **not** in Firebase's CJS typings (`firebase/auth` → `dist/auth/index.d.ts`), but **is** in the React Native build Metro bundles (`@firebase/auth/dist/rn/index.js`). It works at runtime and fails `tsc`. Verified in this repo. Use the `@ts-expect-error` below — do not "fix" it by deleting the import.

- [ ] **Step 1: Apply the change**

In `services/firebase.ts`, replace the auth import and export:

```ts
// @ts-expect-error — getReactNativePersistence ships only in Firebase's React
// Native build (@firebase/auth/dist/rn), which Metro resolves; it is absent
// from the CJS typings that tsc reads. Runtime export is real.
import { initializeAuth, getReactNativePersistence } from 'firebase/auth';
import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
```

```ts
let authInstance: Auth;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage),
  });
} catch {
  // Fast Refresh re-evaluates this module against a live Firebase app whose
  // Auth provider is already initialized. initializeAuth is not idempotent —
  // getReactNativePersistence returns a new class each call, so Firebase's
  // deepEqual guard never matches and the second call always throws
  // auth/already-initialized. Reuse the existing instance.
  authInstance = getAuth(app);
}
export const auth = authInstance;
```

Keep the `getAuth` import — the catch branch needs it. Import the `Auth` type too.

**Do not simplify this to a bare `initializeAuth` call.** An earlier revision of
this plan prescribed exactly that; it passes `tsc`, `lint`, and `jest`, and
crashes the app on every Fast Refresh. Cold start is unaffected, which is why no
automated gate catches it.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. If it reports `getReactNativePersistence` has no exported member, the `@ts-expect-error` is missing or misplaced.

- [ ] **Step 3: Verify the warning is gone**

Reload the app in the simulator. Watch Metro output.
Expected: the `@firebase/auth: Auth (12.12.x): You are initializing Firebase Auth for React Native without providing AsyncStorage` warning no longer appears.

- [ ] **Step 4: Verify persistence behaviorally**

Sign in with an email account. Fully quit the app in the simulator (not just background), relaunch.
Expected: lands in `(tabs)`, still signed in. This is the actual acceptance criterion — the warning disappearing is not sufficient.

- [ ] **Step 5: Commit**

```bash
git add services/firebase.ts
git commit -m "fix: persist Firebase auth across app restarts"
```

---

### Task 2: Extract the age gate

**Files:**
- Create: `utils/age.ts`
- Create: `__tests__/utils/age.test.ts`
- Modify: `app/(auth)/sign-up.tsx:112-117` (delete the inline `isUnder13` `useCallback`, import instead)

**Interfaces:**
- Consumes: nothing
- Produces: `isUnder13(date: Date): boolean`

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/age.test.ts`:

```ts
import { isUnder13 } from '@/utils/age';

describe('isUnder13', () => {
  // Pin "today" so these never depend on the calendar date the suite runs on.
  // Without it, setFullYear rolls Feb 29 -> Mar 1 when the target year is not
  // a leap year, shifting the constructed DOB by a day and flipping the
  // birthday-boundary assertions. 2026-06-15 sits clear of month/year edges.
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 5, 15, 12, 0, 0));
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
  };
  const yearsAgo = (n: number) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - n);
    return d;
  };

  it('returns true for a newborn', () => {
    expect(isUnder13(daysAgo(1))).toBe(true);
  });

  it('returns true one day before the 13th birthday', () => {
    const d = yearsAgo(13);
    d.setDate(d.getDate() + 1);
    expect(isUnder13(d)).toBe(true);
  });

  it('returns false exactly on the 13th birthday', () => {
    expect(isUnder13(yearsAgo(13))).toBe(false);
  });

  it('returns false for an adult', () => {
    expect(isUnder13(yearsAgo(30))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/age.test.ts`
Expected: FAIL — cannot find module `@/utils/age`.

- [ ] **Step 3: Write the implementation**

Create `utils/age.ts` — logic lifted verbatim from `sign-up.tsx:112-117`:

```ts
/** True when `date` is a date of birth younger than 13 years. */
export function isUnder13(date: Date): boolean {
  const today = new Date();
  const age = today.getFullYear() - date.getFullYear();
  const m = today.getMonth() - date.getMonth();
  return (m < 0 || (m === 0 && today.getDate() < date.getDate()) ? age - 1 : age) < 13;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/age.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Replace the inline copy in sign-up**

In `app/(auth)/sign-up.tsx`: delete the `isUnder13` `useCallback` (lines ~112-117) and add `import { isUnder13 } from '@/utils/age';`. The call site at line ~130 is unchanged.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean. Confirm no remaining inline `isUnder13` definition: `grep -n "isUnder13" "app/(auth)/sign-up.tsx"` should show only the import and the call.

- [ ] **Step 7: Commit**

```bash
git add utils/age.ts __tests__/utils/age.test.ts "app/(auth)/sign-up.tsx"
git commit -m "refactor: extract isUnder13 age gate into utils/age"
```

---

### Task 3: Auth route resolution (pure logic, not yet wired)

**Files:**
- Create: `utils/authRoute.ts`
- Create: `__tests__/utils/authRoute.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `resolveAuthRoute(state: AuthRouteState): AuthRoute` where
  `AuthRouteState = { isAuthenticated: boolean; hasProfile: boolean; onboardingComplete: boolean }`
  and `AuthRoute = '/(tabs)' | '/(auth)/welcome' | '/(auth)/onboarding' | '/(auth)/complete-profile'`

**Why pure:** the gate is the riskiest change in this plan — it alters routing for existing users. Isolating the decision from the listener makes it testable without a render environment, which this project has no tooling for.

- [ ] **Step 1: Write the failing test**

Create `__tests__/utils/authRoute.test.ts`:

```ts
import { resolveAuthRoute } from '@/utils/authRoute';

describe('resolveAuthRoute', () => {
  it('sends signed-out users to welcome', () => {
    expect(resolveAuthRoute({ isAuthenticated: false, hasProfile: false, onboardingComplete: false }))
      .toBe('/(auth)/welcome');
  });

  it('ignores profile state when signed out', () => {
    expect(resolveAuthRoute({ isAuthenticated: false, hasProfile: true, onboardingComplete: true }))
      .toBe('/(auth)/welcome');
  });

  it('sends authenticated users with no profile to complete-profile', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: false, onboardingComplete: false }))
      .toBe('/(auth)/complete-profile');
  });

  it('gates on profile even when onboarding was already completed', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: false, onboardingComplete: true }))
      .toBe('/(auth)/complete-profile');
  });

  it('sends profiled users who have not onboarded to onboarding', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: true, onboardingComplete: false }))
      .toBe('/(auth)/onboarding');
  });

  it('sends fully set-up users to tabs', () => {
    expect(resolveAuthRoute({ isAuthenticated: true, hasProfile: true, onboardingComplete: true }))
      .toBe('/(tabs)');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/utils/authRoute.test.ts`
Expected: FAIL — cannot find module `@/utils/authRoute`.

- [ ] **Step 3: Write the implementation**

Create `utils/authRoute.ts`:

```ts
export type AuthRoute =
  | '/(tabs)'
  | '/(auth)/welcome'
  | '/(auth)/onboarding'
  | '/(auth)/complete-profile';

export type AuthRouteState = {
  isAuthenticated: boolean;
  hasProfile: boolean;
  onboardingComplete: boolean;
};

/**
 * Single source of truth for post-auth routing.
 *
 * The profile check comes before onboarding deliberately: an account with no
 * users/{uid} document cannot enter the app, whatever its onboarding flag says.
 * That covers first-time OAuth sign-in, an abandoned complete-profile session,
 * and an email sign-up whose setDoc failed after the account was created.
 */
export function resolveAuthRoute({
  isAuthenticated,
  hasProfile,
  onboardingComplete,
}: AuthRouteState): AuthRoute {
  if (!isAuthenticated) return '/(auth)/welcome';
  if (!hasProfile) return '/(auth)/complete-profile';
  return onboardingComplete ? '/(tabs)' : '/(auth)/onboarding';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/utils/authRoute.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add utils/authRoute.ts __tests__/utils/authRoute.test.ts
git commit -m "feat: add resolveAuthRoute decision function"
```

---

### Task 4: Shared user profile writer

**Files:**
- Create: `services/profile.ts`
- Create: `__tests__/services/profile.test.ts`
- Modify: `app/(auth)/sign-up.tsx:160-172`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `buildUserProfile(input: { fullName: string; username: string }): Record<string, unknown>` — pure, no Firestore
  - `createUserProfile(uid: string, input: { fullName: string; username: string }): Promise<void>` — writes `users/{uid}`

**Why split:** `serverTimestamp()` is a sentinel that cannot be asserted on meaningfully, and Firestore cannot be exercised in a node test environment. The pure builder carries the field shape — the thing that must not drift between two callers — and the writer is a thin wrapper verified manually.

- [ ] **Step 1: Write the failing test**

Create `__tests__/services/profile.test.ts`:

```ts
import { buildUserProfile } from '@/services/profile';

describe('buildUserProfile', () => {
  const profile = buildUserProfile({ fullName: '  Mark Olsen  ', username: 'markolsen' });

  it('trims the full name', () => {
    expect(profile.fullName).toBe('Mark Olsen');
  });

  it('carries the username through', () => {
    expect(profile.username).toBe('markolsen');
  });

  it('defaults new accounts to the free tier', () => {
    expect(profile.tier).toBe('free');
  });

  it('zeroes the social counters', () => {
    expect(profile.followersCount).toBe(0);
    expect(profile.followingCount).toBe(0);
  });

  it('starts with empty optional fields', () => {
    expect(profile.avatarUrl).toBeNull();
    expect(profile.bio).toBe('');
    expect(profile.location).toBe('');
  });

  it('seeds settings and usage sub-objects', () => {
    expect(profile.settings).toEqual({ theme: 'dark', notificationsEnabled: true, privacy: 'public' });
    expect(profile.usage).toEqual({ weeklyAiTrips: 0, weeklyResetAt: null });
  });

  it('accepts an empty username for a failed claim', () => {
    expect(buildUserProfile({ fullName: 'A', username: '' }).username).toBe('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest __tests__/services/profile.test.ts`
Expected: FAIL — cannot find module `@/services/profile`.

- [ ] **Step 3: Write the implementation**

Create `services/profile.ts`. Field shape lifted verbatim from `sign-up.tsx:160-172`:

```ts
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';

export type NewUserProfileInput = {
  fullName: string;
  /** Empty string when a username claim lost a race; set later from Edit profile. */
  username: string;
};

/**
 * The users/{uid} document shape for a brand-new account. Pure and
 * timestamp-free so it can be asserted on — createUserProfile adds createdAt.
 *
 * Sole definition of this shape. Email sign-up and complete-profile both go
 * through it; divergence here silently produces malformed accounts.
 */
export function buildUserProfile({ fullName, username }: NewUserProfileInput) {
  return {
    fullName: fullName.trim(),
    username,
    avatarUrl: null,
    bio: '',
    location: '',
    tier: 'free',
    followersCount: 0,
    followingCount: 0,
    settings: { theme: 'dark', notificationsEnabled: true, privacy: 'public' },
    usage: { weeklyAiTrips: 0, weeklyResetAt: null },
  };
}

export async function createUserProfile(uid: string, input: NewUserProfileInput): Promise<void> {
  await setDoc(doc(db, 'users', uid), {
    ...buildUserProfile(input),
    createdAt: serverTimestamp(),
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest __tests__/services/profile.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Use it from sign-up**

In `app/(auth)/sign-up.tsx`, replace the inline `setDoc(doc(db, 'users', user.uid), {...})` block (lines ~160-172) with:

```ts
await createUserProfile(user.uid, { fullName, username: claimedUsername });
```

Add `import { createUserProfile } from '@/services/profile';`. Remove now-unused `setDoc`, `serverTimestamp`, and `doc` imports **only if** nothing else in the file uses them — check with `grep -n "setDoc\|serverTimestamp\|doc(" "app/(auth)/sign-up.tsx"` before deleting.

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run lint && npx jest __tests__/services/profile.test.ts`
Expected: all clean.

- [ ] **Step 7: Verify behaviorally**

Create a fresh account through email sign-up in the simulator. In the Firebase console, confirm the new `users/{uid}` document has exactly the same fields as an account created before this change.

- [ ] **Step 8: Commit**

```bash
git add services/profile.ts __tests__/services/profile.test.ts "app/(auth)/sign-up.tsx"
git commit -m "refactor: extract createUserProfile as the single users doc writer"
```

---

### Task 5: UsernameField component

**Files:**
- Create: `components/auth/UsernameField.tsx`
- Modify: `app/(auth)/sign-up.tsx` (replace the inline username field + its debounce logic)

**Interfaces:**
- Consumes: `validateUsernameFormat`, `checkUsernameAvailability` from `@/services/usernames`
- Produces:
  ```ts
  type UsernameFieldProps = {
    value: string;
    onChangeText: (v: string) => void;
    /** false while unresolved, invalid, or a check is in flight; true only once confirmed available */
    onValidityChange: (valid: boolean) => void;
    forUid?: string;
  };
  ```
  Default export `UsernameField`.

**Behavior to preserve exactly** (read `app/(auth)/sign-up.tsx` `handleUsernameChange` before writing): lowercases input, strips whitespace, runs `validateUsernameFormat` synchronously, debounces the availability check, clears any pending timer on each keystroke and on unmount.

- [ ] **Step 1: Read the existing implementation**

Run: `grep -n "handleUsernameChange" -A 40 "app/(auth)/sign-up.tsx"`

Note the debounce interval and the exact error strings. Reuse both verbatim — this task must not change behavior or copy.

- [ ] **Step 2: Write the component**

Create `components/auth/UsernameField.tsx`. It owns: the `TextInput`, the `@` prefix affordance, focus state, the debounce timer ref, checking/error state, and an `ActivityIndicator` while checking. It uses `const { colors } = useTheme()`, keeps `StyleSheet.create` module-level with theme colors inline, and wraps handlers in `useCallback`.

Clear the timer in a `useEffect` cleanup:

```ts
useEffect(() => () => {
  if (timer.current) clearTimeout(timer.current);
}, []);
```

- [ ] **Step 3: Wire it into sign-up**

Replace the inline username `View`/`TextInput` block with `<UsernameField ... />`. Delete `handleUsernameChange`, `usernameError`, `usernameChecking`, and `usernameCheckTimer` from `sign-up.tsx`, keeping a single `usernameValid` boolean fed by `onValidityChange` for the submit guard at line ~129.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify behaviorally**

In the simulator on sign-up: type a taken username (expect the unavailable message), a valid free one (expect the available state), `ab` (expect the too-short format error), and `AB CD` (expect it to lowercase and strip the space). Confirm submit stays blocked while a check is in flight.

- [ ] **Step 6: Commit**

```bash
git add components/auth/UsernameField.tsx "app/(auth)/sign-up.tsx"
git commit -m "refactor: extract UsernameField from sign-up"
```

---

### Task 6: BirthdayField component

**Files:**
- Create: `components/auth/BirthdayField.tsx`
- Modify: `app/(auth)/sign-up.tsx` (replace the inline DOB picker)

**Interfaces:**
- Consumes: `isUnder13` from `@/utils/age` (Task 2)
- Produces:
  ```ts
  type BirthdayFieldProps = {
    value: Date | null;
    onChange: (d: Date) => void;
    onValidityChange: (valid: boolean) => void;
  };
  ```
  Default export `BirthdayField`.

**Behavior to preserve:** `@react-native-community/datetimepicker`, iOS renders it inside the existing `Modal`, Android uses the inline dialog. Reuse the existing platform branch verbatim.

- [ ] **Step 1: Read the existing implementation**

Run: `grep -n "showDatePicker\|DateTimePicker" -B 3 -A 20 "app/(auth)/sign-up.tsx"`

- [ ] **Step 2: Write the component**

Create `components/auth/BirthdayField.tsx` owning the trigger row (with the `CalendarBlank` Phosphor icon), the formatted date label, the platform-branched picker, and the under-13 message. Report validity via `onValidityChange(!!value && !isUnder13(value))`.

Keep the existing copy exactly: `You must be 13 or older to use Supernova.`

- [ ] **Step 3: Wire it into sign-up**

Replace the inline picker block with `<BirthdayField ... />`. Remove `showDatePicker` state and the `isUnder13` submit check, replacing it with the validity boolean.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify behaviorally**

Pick a date under 13 (expect the message, submit blocked) and one over 13 (expect it to clear). Confirm the picker still opens and dismisses on iOS.

- [ ] **Step 6: Commit**

```bash
git add components/auth/BirthdayField.tsx "app/(auth)/sign-up.tsx"
git commit -m "refactor: extract BirthdayField from sign-up"
```

---

### Task 7: complete-profile screen

**Files:**
- Create: `app/(auth)/complete-profile.tsx`

**Interfaces:**
- Consumes: `UsernameField` (Task 5), `BirthdayField` (Task 6), `createUserProfile` (Task 4), `claimUsername` from `@/services/usernames`, `auth` from `@/services/firebase`
- Produces: the route `/(auth)/complete-profile`

**REQUIRED:** read `.claude/skills/supernova-design/SKILL.md` and run its pre-ship checklist before completing this task.

- [ ] **Step 1: Build the screen**

Structure, mirroring `sign-in.tsx`'s layout conventions (`KeyboardAvoidingView` → `ScrollView`, `StarMark`, title, subtitle):

- Title: `Finish your profile` · Subtitle: `Pick a username so people can find you.`
- Full name `TextInput`, prefilled from `auth.currentUser?.displayName ?? ''`
- `<UsernameField forUid={auth.currentUser.uid} />`
- `<BirthdayField />`
- Primary `Button label="Continue"`, disabled until all three are valid
- A ghost text button: `Use a different account`

No back button — this screen is a gate, and `router.back()` would return to a signed-in-but-profileless dead end.

- [ ] **Step 2: Implement submit**

```ts
const handleContinue = useCallback(async () => {
  const user = auth.currentUser;
  if (!user || !dob) return;
  setLoading(true);
  setError('');
  try {
    // Mirrors sign-up.tsx: a lost race must not strand the account. Finish
    // with no username rather than fail; it can be set from Edit profile.
    const claimResult = await claimUsername(user.uid, username, '');
    await createUserProfile(user.uid, {
      fullName,
      username: claimResult === 'ok' ? username : '',
    });
    router.replace('/(auth)/onboarding');
  } catch {
    setError('Could not save your profile. Try again in a moment.');
  } finally {
    setLoading(false);
  }
}, [fullName, username, dob]);
```

- [ ] **Step 3: Implement the trap door**

```ts
const handleUseAnotherAccount = useCallback(async () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  await signOut(auth);
  // The auth listener routes to welcome; no manual navigation needed.
}, []);
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Verify behaviorally**

Navigate directly by temporarily calling `router.push('/(auth)/complete-profile')` from sign-in, or wait for Task 8. Confirm: fields render, Continue is disabled until valid, and `Use a different account` returns to welcome.

- [ ] **Step 6: Run the design checklist**

Confirm against `supernova-design`: no emoji, ≥44pt targets, one primary action, motion on state change, `accessibilityLabel` on any icon-only control, sentence-case copy.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/complete-profile.tsx"
git commit -m "feat: add complete-profile screen for accounts missing a profile"
```

---

### Task 8: Wire the routing gate

**Files:**
- Modify: `app/_layout.tsx:98-129`

**Interfaces:**
- Consumes: `resolveAuthRoute` (Task 3), the `/(auth)/complete-profile` route (Task 7)
- Produces: no new exports

**This is the highest-risk task in the plan** — it changes routing for every existing user, not only OAuth ones.

- [ ] **Step 1: Rewrite the listener body**

In the `onAuthStateChanged` callback, keep the existing `getDoc` and profile hydration, then replace the routing tail:

```ts
const hasProfile = snap.exists();
if (hasProfile) {
  const data = snap.data();
  setTier(data.tier ?? 'free');
  useUserStore.getState().setProfile({ /* ...existing hydration, unchanged... */ });
  registerPushToken(firebaseUser.uid);
  configureRevenueCat(firebaseUser.uid);
}

// Truthiness, not a null check — the existing code is `onboardingDone ? ... : ...`,
// so a stored empty string must keep meaning "not onboarded".
const onboardingComplete = Boolean(await AsyncStorage.getItem('onboarding_complete'));
router.replace(resolveAuthRoute({ isAuthenticated: true, hasProfile, onboardingComplete }));
```

`registerPushToken` and `configureRevenueCat` run **only** when a profile exists — both write to or key off `users/{uid}`.

**They do NOT re-run by themselves after the gate is completed.** An earlier
revision of this plan claimed the auth listener would fire again once
`complete-profile` wrote the document. That is false: `onAuthStateChanged` fires
on sign-in, sign-out, and token refresh — a Firestore write triggers nothing, and
`complete-profile` touches Firebase Auth not at all. Left unaddressed, a
first-time user finishes the gate with no push token and, more seriously, with
RevenueCat unconfigured, so purchases fail for that entire session.

The fix is `services/session.ts`'s `hydrateSession(firebaseUser)`, which performs
the `getDoc`, hydrates the store, sets the tier, registers the push token, and
configures RevenueCat, returning whether the profile exists. It is called from
**both** the auth listener and `complete-profile` immediately after
`createUserProfile`. Those two call sites cannot be collapsed — they are the two
distinct moments at which a profile becomes known to exist.

- [ ] **Step 2: Verify the signed-out branch**

The `else` branch keeps `setProfile(null)` and must now route via the same function:

```ts
router.replace(resolveAuthRoute({ isAuthenticated: false, hasProfile: false, onboardingComplete: false }));
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run lint && npx jest`
Expected: clean, all tests pass.

- [ ] **Step 4: Verify no regression for existing users**

Sign in with an existing email account that has a profile.
Expected: lands in `(tabs)` exactly as before. This is the regression check that matters most.

- [ ] **Step 5: Verify the gate fires**

In the Firebase console, delete the `users/{uid}` document for a test account (leave the Auth user). Relaunch and sign in.
Expected: lands on `complete-profile`, not tabs. Complete it and confirm it then writes the document and proceeds.

- [ ] **Step 6: Commit**

```bash
git add app/_layout.tsx
git commit -m "feat: gate app entry on an existing user profile document"
```

---

### Task 9: Install and configure Google Sign-In

**Files:**
- Modify: `app.json`
- Modify: `package.json` (via installer)

**Interfaces:**
- Consumes: `GoogleService-Info.plist` at project root (gitignored), `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` in `.env.local`
- Produces: a rebuilt dev client with the Google SDK linked

- [ ] **Step 1: Install**

```bash
npx expo install @react-native-google-signin/google-signin
```

- [ ] **Step 2: Configure app.json**

Add to `expo.ios`:

```json
"googleServicesFile": "./GoogleService-Info.plist"
```

Add to `expo.plugins`:

```json
[
  "@react-native-google-signin/google-signin",
  { "iosUrlScheme": "com.googleusercontent.apps.329448816704-2ek5dmk5j5a5s7mteoms6mkgc71fk8ce" }
]
```

That `iosUrlScheme` is the `REVERSED_CLIENT_ID` from the plist. Do not invent it — re-read it if unsure:
`/usr/libexec/PlistBuddy -c 'Print :REVERSED_CLIENT_ID' GoogleService-Info.plist`

- [ ] **Step 3: Build the dev client — VIA EAS, NOT LOCALLY**

**A local build is impossible on this machine.** It has Xcode 15.2; React Native
0.81 requires Xcode 16.1+, so `pod install` fails with `Invalid Podfile file:
Please upgrade XCode.` This is also why the repo has never had an `ios/Pods`
directory — the existing dev client was produced by EAS, not locally.

Do NOT run `npx expo prebuild` or `npx expo run:ios`. Build in the cloud:

```bash
eas build --profile development --platform ios
```

The `development` profile already sets `ios.simulator: true`, which yields an
installable simulator `.app`. Expect ~15-30 minutes including queue.

**Sequence this AFTER Tasks 10 and 11**, not here. Those tasks add the code that
imports the native module, so building before them wastes a build: one EAS run
should cover all of the native-dependent work at once.

- [ ] **Step 4: Install the built client**

Download the artifact, then:

```bash
tar -xzf <artifact>.tar.gz          # if gzipped
xcrun simctl install <UDID> <Supernova.app>
xcrun simctl launch <UDID> com.supernovatravel.app
```

- [ ] **Step 5: Verify the app launches**

Expected: boots to welcome. Note that between Task 10 landing and this build
completing, the OLD dev client will CRASH on launch — `configureGoogleSignIn()`
runs at module scope in `_layout.tsx` and its native module does not exist in
that binary. That crash is expected and is resolved by this build.

- [ ] **Step 6: Commit**

```bash
git add app.json package.json package-lock.json
git commit -m "chore: add and configure @react-native-google-signin"
```

---

### Task 10: services/oauth.ts

**Files:**
- Create: `services/oauth.ts`

**Interfaces:**
- Consumes: `auth` from `@/services/firebase`
- Produces:
  - `configureGoogleSignIn(): void`
  - `signInWithGoogle(): Promise<UserCredential>`
  - `isAppleAuthAvailable(): Promise<boolean>` — returns `false` in Phase 1
  - `isCancellation(error: unknown): boolean`

- [ ] **Step 1: Write the module**

**Installed version is 16.1.4.** Since v13 the API changed in a way that breaks
the obvious implementation: `signIn()` NO LONGER THROWS when the user dismisses
the sheet — it RESOLVES with `{ type: 'cancelled' }`. Any cancellation handling
built around a `catch` block will therefore never fire. The package exports a
type guard, `isSuccessResponse(response): response is SignInSuccessResponse`,
which is the correct discriminator. Use it.

```ts
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { GoogleAuthProvider, signInWithCredential, type UserCredential } from 'firebase/auth';
import { auth } from '@/services/firebase';

/**
 * webClientId is required even on iOS — it is the audience Firebase validates
 * the idToken against. Omitting it fails with a generic auth error that never
 * mentions configuration. iosClientId is read from GoogleService-Info.plist.
 */
export function configureGoogleSignIn(): void {
  GoogleSignin.configure({
    webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
  });
}

/**
 * Resolves to null when the user dismisses the sheet — cancellation is a normal
 * outcome, not an error. Since v13 the SDK signals it by resolving with
 * { type: 'cancelled' } rather than throwing, so a catch block would miss it.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) return null;

  const { idToken } = response.data;
  if (!idToken) throw new Error('Google sign-in returned no ID token');
  const credential = GoogleAuthProvider.credential(idToken);
  return signInWithCredential(auth, credential);
}

/** Phase 2. Apple sign-in needs an entitlement this App ID does not yet carry. */
export async function isAppleAuthAvailable(): Promise<boolean> {
  return false;
}

Note there is deliberately no `isCancellation(error)` helper. Cancellation is
carried by the RETURN VALUE (`null`), not by a thrown error, so callers write:

```ts
const credential = await signInWithGoogle();
if (!credential) return;   // user dismissed the sheet — show nothing
```

- [ ] **Step 2b: Confirm the type guard exists in the installed version**

Run: `grep -rn "isSuccessResponse" node_modules/@react-native-google-signin/google-signin/lib/typescript/src/functions.d.ts`
Expected: a line declaring `isSuccessResponse(response: SignInResponse): response is SignInSuccessResponse`.
If absent, the installed major differs from 16.x — STOP and report rather than
improvising a shape.
```

- [ ] **Step 2: Confirm the response shape**

`GoogleSignin.signIn()` changed shape at v13 — older versions returned `{ idToken }` at the top level, newer return `{ type, data: { idToken } }`. Verify against the installed version:

```bash
grep -rn "idToken" node_modules/@react-native-google-signin/google-signin/lib/typescript/src/types.d.ts | head
```

Adjust the `response.data?.idToken` access if the installed version differs. Do not guess.

- [ ] **Step 3: Call configure once at startup**

In `app/_layout.tsx`, call `configureGoogleSignIn()` at module scope (below the imports, beside `SplashScreen.preventAutoHideAsync()`). It is synchronous and idempotent.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add services/oauth.ts app/_layout.tsx
git commit -m "feat: add Google sign-in service wrapper"
```

---

### Task 11: SocialAuthButtons and screen wiring

**Files:**
- Create: `components/auth/SocialAuthButtons.tsx`
- Modify: `app/(auth)/sign-in.tsx` (insert below the primary CTA at ~line 175)
- Modify: `app/(auth)/sign-up.tsx` (insert below the submit button)

**Interfaces:**
- Consumes: `signInWithGoogle`, `isCancellation`, `isAppleAuthAvailable` (Task 10)
- Produces: `SocialAuthButtons` (default export), props `{ onError: (message: string) => void }`

**REQUIRED:** read `.claude/skills/supernova-design/SKILL.md` and run its pre-ship checklist before completing this task.

- [ ] **Step 1: Build the component**

Contents: a hairline divider with a centered `or`, then the Google button — full width, matching the primary `Button`'s height and radius, `GoogleLogo` from `phosphor-react-native`, label `Continue with Google`, secondary weight so the email CTA stays the only primary.

Apple renders only when `isAppleAuthAvailable()` resolves true. It returns `false` in Phase 1, so nothing renders — hold the slot with the check, not a comment.

- [ ] **Step 2: Implement the handler**

```ts
const handleGoogle = useCallback(async () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  setLoading(true);
  try {
    await signInWithGoogle();
    // No navigation here — the auth listener in _layout owns routing.
  } catch (e: any) {
    if (isCancellation(e)) return;
    if (e?.code === 'auth/account-exists-with-different-credential') {
      onError('You already have an account with this email. Sign in with your password.');
    } else if (e?.code === 'auth/network-request-failed') {
      onError("Couldn't reach the network. Check your connection and try again.");
    } else {
      onError('Sign in failed. Try again in a moment.');
    }
  } finally {
    setLoading(false);
  }
}, [onError]);
```

The cancellation branch returns **before** setting an error — dismissing the sheet must show nothing.

- [ ] **Step 3: Wire into both screens**

In `sign-in.tsx`, insert `<SocialAuthButtons onError={setError} />` between the `Button` (line ~175) and the footer `View` (line ~184). Do the same in `sign-up.tsx`. Both screens already have the `errorBox` that `setError` drives.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run lint && npx jest`
Expected: clean.

- [ ] **Step 5: Run the design checklist**

Confirm the email CTA is still visually primary and the Google button reads as secondary.

- [ ] **Step 6: Commit**

```bash
git add components/auth/SocialAuthButtons.tsx "app/(auth)/sign-in.tsx" "app/(auth)/sign-up.tsx"
git commit -m "feat: add Google sign-in to the sign-in and sign-up screens"
```

---

### Task 12: End-to-end verification

**Files:** none — verification only.

- [ ] **Step 1: Full automated pass**

```bash
npx jest && npx tsc --noEmit && npm run lint
```
Expected: all green. Record the actual output; do not claim completion without it.

- [ ] **Step 2: Google first-time sign-in**

Use a Google account with no existing Supernova account.
Expected: native sheet → `complete-profile` → after Continue, `users/{uid}` exists in Firestore with the shape from Task 4 → lands in onboarding/tabs.

- [ ] **Step 3: Google returning sign-in**

Sign out, sign in again with the same Google account.
Expected: straight to tabs, no `complete-profile`.

- [ ] **Step 4: Cancellation**

Tap Continue with Google, dismiss the sheet.
Expected: no error box, loading state clears.

- [ ] **Step 5: Email collision**

Sign in with Google using the address of an existing email/password account.
Expected: the "already have an account with this email" message. (If Firebase's "one account per email" setting is off, this instead links silently — note the actual behavior.)

- [ ] **Step 6: Resumability**

Force-quit during `complete-profile`, relaunch.
Expected: returns to `complete-profile`, not tabs.

- [ ] **Step 7: Trap door**

On `complete-profile`, tap `Use a different account`.
Expected: signs out, returns to welcome.

- [ ] **Step 8: Persistence**

Sign in, fully quit, relaunch.
Expected: still signed in.

- [ ] **Step 9: Email regression**

Sign in and sign up with email/password.
Expected: both unchanged from before this branch.

- [ ] **Step 10: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found in end-to-end verification"
```

---

## Phase 2 (post-enrollment) — not in this plan

Install `expo-apple-authentication`, add the plugin and `ios.usesAppleSignIn`, implement `signInWithApple()` with the `expo-crypto` nonce (hashed to Apple, raw to Firebase), call `updateProfile()` to capture Apple's one-time `fullName`, enable the Apple provider in Firebase, and let `isAppleAuthAvailable()` return `AppleAuthentication.isAvailableAsync()`. No Phase 1 code changes shape.
