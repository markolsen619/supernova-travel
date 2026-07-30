# AI-Powered Wallet Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users paste confirmation text or share a photo/screenshot to auto-fill the boarding-pass or
reservation add form via Gemini extraction, instead of typing every field by hand — per
`docs/superpowers/specs/2026-07-29-wallet-ai-import-design.md`.

**Architecture:** A new Cloud Function (`parseTravelConfirmation`) mirrors `generateTrip.ts`'s exact
shape (auth → quota check → Gemini call → JSON parse → return), classifying the input as a boarding pass
or a specific reservation type and extracting whatever fields it can confidently find. The client never
auto-saves this: the result lands in a small transient Zustand store and the user is routed to the
*existing* add form (from the wallet redesign), pre-filled, for review and manual Save — the same safety
net manual entry already has. Quota reuses the existing `usage_quotas` collection, generalized with a new
calendar-year variant (`getYearlyQuotaKey`) alongside the existing calendar-week one, since this feature
is capped at 1 free use per year rather than a recurring weekly allowance.

**Tech Stack:** Firebase Functions v2 (`onCall`), `@google/generative-ai` (`gemini-2.5-flash`, already a
dependency), TanStack Query, Zustand, `expo-image-picker` (already a dependency, `base64: true` output
mode — no `expo-file-system` needed).

## Global Constraints

- All components use `const { colors } = useTheme()` — no new always-dark screens.
- Dynamic/theme-dependent colors go in inline styles only, never inside `StyleSheet.create`.
- `useCallback` required for all event handlers passed as props to child components.
- `@/` path alias for all client-side imports.
- Haptics: `Light` on nav/select (opening Import, picking a photo, tapping "Enter manually instead"),
  `Medium` on the Import submit action.
- Touch targets ≥44pt.
- No Firestore rules changes anywhere in this plan — `usage_quotas` already denies all direct client
  access (`allow read, write: if false`); the new `getImportQuota` callable is the only client-facing
  read, mirroring `getAiTripQuota`.
- The confirmation photo is never uploaded to Firebase Storage — base64-encoded client-side, sent inline
  in the callable request body, discarded server-side after the Gemini call.
- `functions/` has no test runner configured (no `jest` devDependency, no `test` script) — this is the
  existing state of that subproject, not something this plan changes. New Cloud Function logic is
  verified via `cd functions && npm run build` (typecheck) plus manual verification, matching how
  `generateTrip.ts`/`getAiTripQuota.ts` are already verified today. The client-side app's Jest suite
  (root `__tests__/`) is unaffected and unrelated — no new automated tests are added there by this plan
  either, since every new piece of client logic here is thin wiring (callable wrappers, a Zustand store,
  pre-fill effects) with no pure-logic complexity worth isolating, consistent with how the rest of this
  app's recent UI-heavy work has been tested (manual simulator verification, no component-render test
  library installed).

---

### Task 1: Generalize quota key helpers — add calendar-year variant

**Files:**
- Modify: `functions/src/quotaUtils.ts`
- Modify: `functions/src/generateTrip.ts`
- Modify: `functions/src/getAiTripQuota.ts`

**Interfaces:**
- Produces: `getWeeklyQuotaKey(prefix: string): string` (changed signature — was `getWeeklyQuotaKey()`
  hardcoded to `'ai_trips'`), `getYearStart(): Date`, `getNextYearStart(): Date`,
  `getYearlyQuotaKey(prefix: string): string`, `FREE_TIER_YEARLY_IMPORT_LIMIT = 1` — all consumed by
  Task 3 (`parseTravelConfirmation.ts`) and Task 4 (`getImportQuota.ts`).

- [ ] **Step 1: Replace the full contents of `functions/src/quotaUtils.ts`**

```ts
// Single source of truth for free-tier quota windows — shared by each
// feature's enforcing Cloud Function and its client-facing "remaining" read,
// so the UI's displayed count can never drift from what the server actually
// allows.

export const FREE_TIER_WEEKLY_AI_TRIP_LIMIT = 1;
export const FREE_TIER_YEARLY_IMPORT_LIMIT = 1;

/** Start of the current calendar week (Monday 00:00 UTC) — NOT a rolling 7-day window. */
export function getWeekStart(): Date {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}

/** Start of next calendar week (Monday 00:00 UTC) — when the weekly quota resets. */
export function getNextWeekStart(): Date {
  const weekStart = getWeekStart();
  return new Date(Date.UTC(
    weekStart.getUTCFullYear(),
    weekStart.getUTCMonth(),
    weekStart.getUTCDate() + 7,
  ));
}

/** Firestore field key on usage_quotas/{uid} for the current calendar week, namespaced by feature
 * (e.g. `getWeeklyQuotaKey('ai_trips')` → `"ai_trips_2026-07-27"`). */
export function getWeeklyQuotaKey(prefix: string): string {
  return `${prefix}_${getWeekStart().toISOString().split('T')[0]}`;
}

/** Start of the current calendar year (Jan 1 00:00 UTC) — NOT a rolling 365-day window, same
 * calendar-period-not-rolling-window philosophy as getWeekStart(). */
export function getYearStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}

/** Start of next calendar year (Jan 1 00:00 UTC) — when the yearly quota resets. */
export function getNextYearStart(): Date {
  const yearStart = getYearStart();
  return new Date(Date.UTC(yearStart.getUTCFullYear() + 1, 0, 1));
}

/** Firestore field key on usage_quotas/{uid} for the current calendar year, namespaced by feature
 * (e.g. `getYearlyQuotaKey('wallet_imports')` → `"wallet_imports_2026-01-01"`). */
export function getYearlyQuotaKey(prefix: string): string {
  return `${prefix}_${getYearStart().toISOString().split('T')[0]}`;
}
```

- [ ] **Step 2: Update the two call sites in `functions/src/generateTrip.ts`**

Both currently read `getWeeklyQuotaKey()` (no argument). Change both to `getWeeklyQuotaKey('ai_trips')`:

```ts
// In the quota-check block (around line 23):
const weeklyCount = quotaData[getWeeklyQuotaKey('ai_trips')] ?? 0;
```

```ts
// In the quota-update block near the end of the function (around line 144):
await db.doc(`usage_quotas/${uid}`).set(
  { [getWeeklyQuotaKey('ai_trips')]: admin.firestore.FieldValue.increment(1) },
  { merge: true }
);
```

No other change to this file — behavior is identical (same resulting key string), this is purely making
the existing implicit `'ai_trips'` namespace explicit now that the helper is shared with a second
feature.

- [ ] **Step 3: Update the one call site in `functions/src/getAiTripQuota.ts`**

```ts
const used = quotaData[getWeeklyQuotaKey('ai_trips')] ?? 0;
```

- [ ] **Step 4: Typecheck**

Run: `cd functions && npm run build`
Expected: compiles cleanly, no errors.

- [ ] **Step 5: Manual sanity check of the date math**

Run this inline Node check (no test framework needed — pure arithmetic, verifying against known dates):

```bash
node -e "
function getWeekStart(now) {
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diff));
}
function getYearStart(now) {
  return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
}
const wed = new Date('2026-07-29T12:00:00Z'); // a Wednesday
console.log('week start for Wed 2026-07-29:', getWeekStart(wed).toISOString()); // expect 2026-07-27 (Monday)
console.log('year start for 2026-07-29:', getYearStart(wed).toISOString()); // expect 2026-01-01
const jan1 = new Date('2026-01-01T00:00:00Z');
console.log('week start for Jan 1 2026 (Thursday):', getWeekStart(jan1).toISOString()); // expect 2025-12-29 (Monday)
console.log('year start for Jan 1 2026:', getYearStart(jan1).toISOString()); // expect 2026-01-01 (same day, boundary)
"
```

Expected output:
```
week start for Wed 2026-07-29: 2026-07-27T00:00:00.000Z
year start for 2026-07-29: 2026-01-01T00:00:00.000Z
week start for Jan 1 2026 (Thursday): 2025-12-29T00:00:00.000Z
year start for Jan 1 2026: 2026-01-01T00:00:00.000Z
```

Confirms: the week helper is unchanged (still correctly Monday-anchored, including the year-boundary
edge case), and the new year helper correctly anchors to Jan 1 regardless of what day of the week that
falls on. Also confirms `getWeeklyQuotaKey('ai_trips')` and `getYearlyQuotaKey('wallet_imports')` will
never produce colliding key strings (different prefixes).

- [ ] **Step 6: Commit**

```bash
git add functions/src/quotaUtils.ts functions/src/generateTrip.ts functions/src/getAiTripQuota.ts
git commit -m "refactor: generalize quota key helpers with a calendar-year variant"
```

---

### Task 2: Cloud Function types for confirmation parsing

**Files:**
- Modify: `functions/src/types.ts`

**Interfaces:**
- Produces: `ParseTravelConfirmationRequest`, `ParseTravelConfirmationResult` — consumed by Task 3
  (`parseTravelConfirmation.ts`).

- [ ] **Step 1: Add the following to `functions/src/types.ts`** (append at the end of the file)

```ts
export interface ParseTravelConfirmationRequest {
  text?: string;           // pasted confirmation text
  imageBase64?: string;    // photo/screenshot, base64-encoded, no data: URI prefix
  imageMimeType?: string;  // required if imageBase64 present, e.g. "image/jpeg"
}

export type ParseTravelConfirmationResult =
  | {
      kind: 'boarding_pass';
      fields: Partial<{
        airline: string;
        flightNumber: string;
        origin: string;
        originCity: string;
        destination: string;
        destinationCity: string;
        departureTime: string; // ISO 8601, best-effort
        arrivalTime: string;
        seat: string;
        boardingGroup: string;
        gate: string;
        terminal: string;
      }>;
    }
  | {
      kind: 'reservation';
      reservationType: 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show';
      fields: Partial<{
        title: string;
        confirmationCode: string;
        checkIn: string;  // ISO 8601 date, best-effort
        checkOut: string;
        address: string;
        notes: string;
      }>;
    };
```

- [ ] **Step 2: Typecheck**

Run: `cd functions && npm run build`
Expected: compiles cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/types.ts
git commit -m "feat: add ParseTravelConfirmation request/result types"
```

---

### Task 3: `parseTravelConfirmation` Cloud Function

**Files:**
- Create: `functions/src/parseTravelConfirmation.ts`

**Interfaces:**
- Consumes: `getYearlyQuotaKey`, `FREE_TIER_YEARLY_IMPORT_LIMIT` (Task 1), `ParseTravelConfirmationRequest`,
  `ParseTravelConfirmationResult` (Task 2).
- Produces: `export const parseTravelConfirmation` — an `onCall` handler, registered in Task 4.

- [ ] **Step 1: Create `functions/src/parseTravelConfirmation.ts`**

```ts
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ParseTravelConfirmationRequest, ParseTravelConfirmationResult } from './types';
import { FREE_TIER_YEARLY_IMPORT_LIMIT, getYearlyQuotaKey } from './quotaUtils';

function buildExtractionPrompt(): string {
  return `You are reading a travel booking confirmation (flight, hotel, car rental, restaurant, or event
reservation). It may be pasted email text and/or a photo of a printed confirmation or a screenshot.

First, decide what kind of thing this is:
- A flight boarding pass or flight confirmation → "boarding_pass"
- Anything else (hotel, Airbnb, rental car, restaurant, activity/tour, show/concert/theater) → "reservation",
  and pick the single closest reservationType: "hotel", "airbnb", "rental_car", "restaurant", "activity", or "show"

Then extract every field you can confidently find. Do NOT guess or make up a value for a field you can't
find with reasonable confidence — omit that key entirely rather than fill it with a placeholder.

Return ONLY valid JSON in one of these two exact formats (no markdown, no explanation):

For a boarding pass:
{
  "kind": "boarding_pass",
  "fields": {
    "airline": "Delta Air Lines",
    "flightNumber": "DL405",
    "origin": "JFK",
    "originCity": "New York",
    "destination": "LHR",
    "destinationCity": "London",
    "departureTime": "2026-08-15T18:30:00.000Z",
    "arrivalTime": "2026-08-16T06:45:00.000Z",
    "seat": "14A",
    "boardingGroup": "3",
    "gate": "B22",
    "terminal": "4"
  }
}

For a reservation:
{
  "kind": "reservation",
  "reservationType": "hotel",
  "fields": {
    "title": "The Ritz-Carlton, Tokyo",
    "confirmationCode": "RT4821",
    "checkIn": "2026-08-15T00:00:00.000Z",
    "checkOut": "2026-08-18T00:00:00.000Z",
    "address": "9 Chome-7-1 Ginzaa, Tokyo",
    "notes": "Any other relevant detail worth keeping, e.g. room type or special requests"
  }
}

Rules:
- "fields" only contains keys you actually found — omit anything not confidently present in the source
- origin/destination airport codes are 3-letter IATA codes
- All date/time fields are ISO 8601 strings
- flightNumber and origin/destination are uppercase
- If you truly cannot identify what kind of booking this is at all, return {"kind": "reservation", "reservationType": "activity", "fields": {}}`;
}

export const parseTravelConfirmation = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false, timeoutSeconds: 60 },
  async (request): Promise<ParseTravelConfirmationResult> => {
    // 1. Auth check
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    // 2. Validate input
    const data = request.data as ParseTravelConfirmationRequest;
    if (!data.text?.trim() && !data.imageBase64) {
      throw new functions.https.HttpsError('invalid-argument', 'text or imageBase64 is required');
    }
    if (data.imageBase64 && !data.imageMimeType) {
      throw new functions.https.HttpsError('invalid-argument', 'imageMimeType is required when imageBase64 is present');
    }

    // 3. Quota check for free tier — 1 per calendar year, not a recurring allowance
    const userDoc = await db.doc(`users/${uid}`).get();
    const tier = userDoc.data()?.tier ?? 'free';

    if (tier === 'free') {
      const quotaDoc = await db.doc(`usage_quotas/${uid}`).get();
      const quotaData = quotaDoc.data() ?? {};
      const yearlyCount = quotaData[getYearlyQuotaKey('wallet_imports')] ?? 0;
      if (yearlyCount >= FREE_TIER_YEARLY_IMPORT_LIMIT) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'Free tier limit: 1 wallet import per year. Upgrade to Pro for unlimited.'
        );
      }
    }

    // 4. Call Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      throw new functions.https.HttpsError('internal', 'Gemini API key not configured');
    }

    const genAI = new GoogleGenerativeAI(geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
      { text: buildExtractionPrompt() },
    ];
    if (data.text?.trim()) {
      parts.push({ text: `Confirmation text:\n${data.text.trim()}` });
    }
    if (data.imageBase64 && data.imageMimeType) {
      parts.push({ inlineData: { mimeType: data.imageMimeType, data: data.imageBase64 } });
    }

    const result = await model.generateContent(parts);
    const text = result.response.text();

    // 5. Parse JSON from Gemini response
    let parsed: ParseTravelConfirmationResult;
    try {
      const jsonStr = text.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new functions.https.HttpsError('internal', 'Failed to parse Gemini response as JSON');
    }

    // 6. Update quota for free tier
    if (tier === 'free') {
      await db.doc(`usage_quotas/${uid}`).set(
        { [getYearlyQuotaKey('wallet_imports')]: admin.firestore.FieldValue.increment(1) },
        { merge: true }
      );
    }

    return parsed;
  }
);
```

- [ ] **Step 2: Typecheck**

Run: `cd functions && npm run build`
Expected: compiles cleanly, no errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/parseTravelConfirmation.ts
git commit -m "feat: add parseTravelConfirmation Cloud Function"
```

---

### Task 4: `getImportQuota` Cloud Function + register both functions

**Files:**
- Create: `functions/src/getImportQuota.ts`
- Modify: `functions/src/index.ts`

**Interfaces:**
- Consumes: `getYearlyQuotaKey`, `getNextYearStart`, `FREE_TIER_YEARLY_IMPORT_LIMIT` (Task 1).
- Produces: `export const getImportQuota`, `export interface ImportQuotaResponse` — the callable is
  registered from `index.ts` (deployed), consumed client-side by Task 6/8.

- [ ] **Step 1: Create `functions/src/getImportQuota.ts`**

```ts
import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';
import { FREE_TIER_YEARLY_IMPORT_LIMIT, getNextYearStart, getYearlyQuotaKey } from './quotaUtils';

export interface ImportQuotaResponse {
  tier: 'free' | 'pro' | 'business';
  /** null = unlimited (pro/business) */
  limit: number | null;
  /** null = unlimited (pro/business) */
  remaining: number | null;
  /** ISO timestamp of the next reset (next Jan 1 00:00 UTC), null = unlimited */
  resetsAt: string | null;
}

/**
 * Client-facing read of the SAME quota state parseTravelConfirmation.ts enforces — reuses quotaUtils so
 * the "remaining" the UI shows can never drift from what the server will actually allow. usage_quotas
 * has no direct client access (firestore.rules: `allow read, write: if false`), so this callable is the
 * only way the client can know the real remaining count.
 */
export const getImportQuota = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request): Promise<ImportQuotaResponse> => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const db = admin.firestore();

    const userDoc = await db.doc(`users/${uid}`).get();
    const tier = (userDoc.data()?.tier ?? 'free') as ImportQuotaResponse['tier'];

    if (tier !== 'free') {
      return { tier, limit: null, remaining: null, resetsAt: null };
    }

    const quotaDoc = await db.doc(`usage_quotas/${uid}`).get();
    const quotaData = quotaDoc.data() ?? {};
    const used = quotaData[getYearlyQuotaKey('wallet_imports')] ?? 0;
    const remaining = Math.max(0, FREE_TIER_YEARLY_IMPORT_LIMIT - used);

    return {
      tier,
      limit: FREE_TIER_YEARLY_IMPORT_LIMIT,
      remaining,
      resetsAt: getNextYearStart().toISOString(),
    };
  }
);
```

- [ ] **Step 2: Register both new functions in `functions/src/index.ts`**

Add two new export lines (the file currently ends after the `postEvents` export):

```ts
export { parseTravelConfirmation } from './parseTravelConfirmation';
export { getImportQuota } from './getImportQuota';
```

- [ ] **Step 3: Typecheck**

Run: `cd functions && npm run build`
Expected: compiles cleanly, no errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/getImportQuota.ts functions/src/index.ts
git commit -m "feat: add getImportQuota Cloud Function, register both new functions"
```

---

### Task 5: Client-side types for import

**Files:**
- Modify: `types/ai.ts`

**Interfaces:**
- Produces: `ImportQuota`, `ParseTravelConfirmationRequest`, `ParseTravelConfirmationResult` — consumed
  by Task 6 (`services/gemini.ts`), Task 7 (`useImportDraftStore.ts`), Task 8 (hooks).

- [ ] **Step 1: Append to `types/ai.ts`**

```ts
export interface ImportQuota {
  tier: 'free' | 'pro' | 'business';
  limit: number | null;      // null = unlimited
  remaining: number | null;  // null = unlimited
  resetsAt: string | null;   // null = unlimited
}

export interface ParseTravelConfirmationRequest {
  text?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export type ParseTravelConfirmationResult =
  | {
      kind: 'boarding_pass';
      fields: Partial<{
        airline: string;
        flightNumber: string;
        origin: string;
        originCity: string;
        destination: string;
        destinationCity: string;
        departureTime: string;
        arrivalTime: string;
        seat: string;
        boardingGroup: string;
        gate: string;
        terminal: string;
      }>;
    }
  | {
      kind: 'reservation';
      reservationType: 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show';
      fields: Partial<{
        title: string;
        confirmationCode: string;
        checkIn: string;
        checkOut: string;
        address: string;
        notes: string;
      }>;
    };
```

This is an intentional client-side duplicate of `functions/src/types.ts`'s equivalent shapes (Task 2) —
matching how `GenerateTripRequest` already exists independently on both sides of the callable boundary in
this codebase, rather than sharing a types package across the two separate TypeScript projects
(`functions/` has its own `tsconfig.json`/build, the app doesn't import across that boundary anywhere
today).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add types/ai.ts
git commit -m "feat: add client-side ImportQuota and ParseTravelConfirmation types"
```

---

### Task 6: Client callable wrappers

**Files:**
- Modify: `services/gemini.ts`

**Interfaces:**
- Consumes: `ImportQuota`, `ParseTravelConfirmationRequest`, `ParseTravelConfirmationResult` (Task 5).
- Produces: `callParseTravelConfirmation(request): Promise<ParseTravelConfirmationResult>`,
  `callGetImportQuota(): Promise<ImportQuota>` — consumed by Task 8's hooks.

- [ ] **Step 1: Add to `services/gemini.ts`**

Update the import line at the top of the file to include the new types:

```ts
import { GenerateTripRequest, AiTripQuota, ParseTravelConfirmationRequest, ParseTravelConfirmationResult, ImportQuota } from '@/types/ai';
```

Then append the two new functions:

```ts
export async function callParseTravelConfirmation(
  request: ParseTravelConfirmationRequest
): Promise<ParseTravelConfirmationResult> {
  const fn = httpsCallable<ParseTravelConfirmationRequest, ParseTravelConfirmationResult>(
    functions,
    'parseTravelConfirmation',
    { timeout: 60000 }
  );
  const result = await fn(request);
  return result.data;
}

export async function callGetImportQuota(): Promise<ImportQuota> {
  const fn = httpsCallable<undefined, ImportQuota>(functions, 'getImportQuota');
  const result = await fn();
  return result.data;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add services/gemini.ts
git commit -m "feat: add callParseTravelConfirmation and callGetImportQuota"
```

---

### Task 7: Import draft store

**Files:**
- Create: `stores/useImportDraftStore.ts`

**Interfaces:**
- Consumes: `ParseTravelConfirmationResult` (Task 5).
- Produces: `useImportDraftStore` — a Zustand store with `draft: ParseTravelConfirmationResult | null`,
  `setDraft`, `clearDraft` — consumed by Task 8 (`useParseTravelConfirmation.ts`) and Task 11/12 (the two
  add forms' pre-fill effects).

- [ ] **Step 1: Create `stores/useImportDraftStore.ts`**

```ts
import { create } from 'zustand';
import { ParseTravelConfirmationResult } from '@/types/ai';

interface ImportDraftState {
  draft: ParseTravelConfirmationResult | null;
  setDraft: (draft: ParseTravelConfirmationResult) => void;
  clearDraft: () => void;
}

export const useImportDraftStore = create<ImportDraftState>((set) => ({
  draft: null,
  setDraft: (draft) => set({ draft }),
  clearDraft: () => set({ draft: null }),
}));
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add stores/useImportDraftStore.ts
git commit -m "feat: add useImportDraftStore for transient parsed-confirmation drafts"
```

---

### Task 8: Import quota and mutation hooks

**Files:**
- Create: `hooks/useImportQuota.ts`
- Create: `hooks/useParseTravelConfirmation.ts`

**Interfaces:**
- Consumes: `callGetImportQuota`, `callParseTravelConfirmation` (Task 6), `useImportDraftStore` (Task 7),
  `useAuthStore` (existing).
- Produces: `useImportQuota()` returning a TanStack Query result; `useParseTravelConfirmation()`
  returning `{ parseConfirmation: (request) => Promise<void>, isPending: boolean }` — consumed by
  Task 9 (`app/(wallet)/import.tsx`).

- [ ] **Step 1: Create `hooks/useImportQuota.ts`**

```ts
import { useQuery } from '@tanstack/react-query';
import { callGetImportQuota } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Reads the SAME quota state parseTravelConfirmation.ts enforces server-side (via the getImportQuota
 * callable), so "remaining" here can never drift from what the server will actually allow —
 * usage_quotas has no direct client access.
 */
export function useImportQuota() {
  const uid = useAuthStore((s) => s.user?.uid);
  return useQuery({
    queryKey: ['importQuota', uid],
    queryFn: callGetImportQuota,
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
```

- [ ] **Step 2: Create `hooks/useParseTravelConfirmation.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { router } from 'expo-router';
import { callParseTravelConfirmation } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { useImportDraftStore } from '@/stores/useImportDraftStore';
import { ParseTravelConfirmationRequest } from '@/types/ai';

export function useParseTravelConfirmation() {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  const setDraft = useImportDraftStore((s) => s.setDraft);

  const mutation = useMutation({
    mutationFn: (request: ParseTravelConfirmationRequest) => callParseTravelConfirmation(request),
    onSuccess: (result) => {
      if (uid) {
        // Keep the "remaining" display in sync — a successful parse just consumed this year's quota.
        queryClient.invalidateQueries({ queryKey: ['importQuota', uid] });
      }
      setDraft(result);
      if (result.kind === 'boarding_pass') {
        router.push('/(wallet)/boarding-pass/add?draft=true');
      } else {
        router.push('/(wallet)/reservation/add?draft=true');
      }
    },
    onError: (error: unknown) => {
      // resource-exhausted means free tier's 1/year limit is used — redirect to paywall
      if (error instanceof FirebaseError && error.code === 'functions/resource-exhausted') {
        if (uid) queryClient.invalidateQueries({ queryKey: ['importQuota', uid] });
        router.replace('/paywall');
      }
    },
  });

  return {
    parseConfirmation: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add hooks/useImportQuota.ts hooks/useParseTravelConfirmation.ts
git commit -m "feat: add useImportQuota and useParseTravelConfirmation hooks"
```

---

### Task 9: Import screen + route registration

**Files:**
- Create: `app/(wallet)/import.tsx`
- Modify: `app/(wallet)/_layout.tsx`

**Interfaces:**
- Consumes: `WalletHeader` (existing, from the wallet redesign), `useImportQuota`,
  `useParseTravelConfirmation` (Task 8).
- Produces: route `/(wallet)/import`, reachable from Task 10 (wallet hub's `+` button).

- [ ] **Step 1: Register the new route in `app/(wallet)/_layout.tsx`**

Add one line after the existing `index` screen:

```tsx
import { Stack } from 'expo-router';

export default function WalletLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="import" />
      <Stack.Screen name="boarding-pass/[id]" />
      <Stack.Screen name="boarding-pass/add" />
      <Stack.Screen name="reservation/[id]" />
      <Stack.Screen name="reservation/add" />
      <Stack.Screen name="loyalty/[id]" />
      <Stack.Screen name="loyalty/add" />
    </Stack>
  );
}
```

(Only the new `<Stack.Screen name="import" />` line is added — everything else in this file is
unchanged.)

- [ ] **Step 2: Create `app/(wallet)/import.tsx`**

```tsx
import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Image,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { Camera, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { Button } from '@/components/ui/Button';
import { useImportQuota } from '@/hooks/useImportQuota';
import { useParseTravelConfirmation } from '@/hooks/useParseTravelConfirmation';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

function quotaLabel(
  quota: { limit: number | null; remaining: number | null; resetsAt: string | null } | undefined,
): string | null {
  if (!quota) return null; // still loading — show nothing rather than a placeholder flash
  if (quota.limit === null) return null; // unlimited (pro/business) — no hint needed
  if ((quota.remaining ?? 0) > 0) return 'Your free import for this year';
  const resetDate = quota.resetsAt
    ? new Date(quota.resetsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : 'next year';
  return `You've used your free import for this year — resets ${resetDate}`;
}

export default function ImportScreen() {
  const { colors } = useTheme();
  const { data: quota } = useImportQuota();
  const { parseConfirmation, isPending } = useParseTravelConfirmation();

  const [text, setText] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const pickImage = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      quality: 0.85,
      base64: true,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    setImageUri(asset.uri);
    setImageBase64(asset.base64 ?? null);
  }, []);

  const removeImage = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setImageUri(null);
    setImageBase64(null);
  }, []);

  const handleEnterManually = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Add to wallet', undefined, [
      { text: 'Boarding pass', onPress: () => router.push('/(wallet)/boarding-pass/add') },
      { text: 'Reservation', onPress: () => router.push('/(wallet)/reservation/add') },
      { text: 'Loyalty program', onPress: () => router.push('/(wallet)/loyalty/add') },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, []);

  const handleImport = useCallback(async () => {
    if (isPending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    try {
      await parseConfirmation({
        text: text.trim() || undefined,
        imageBase64: imageBase64 ?? undefined,
        imageMimeType: imageBase64 ? 'image/jpeg' : undefined,
      });
    } catch (e: unknown) {
      setError(
        imageBase64
          ? "Couldn't read that — try pasting the confirmation text instead."
          : "Couldn't read that — try a screenshot instead."
      );
    }
  }, [isPending, text, imageBase64, parseConfirmation]);

  const canImport = (text.trim().length > 0 || !!imageBase64) && !isPending;
  const label = quotaLabel(quota);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <WalletHeader title="Import" onBack={handleBack} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ padding: Spacing['4'], paddingBottom: 100 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.intro, { color: colors.text.secondary }]}>
          Paste your confirmation email, or add a photo of a printed confirmation or a screenshot.
        </Text>

        {label && (
          <View style={[styles.quotaBadge, { backgroundColor: `${colors.brand.purple}1F` }]}>
            <Text style={[styles.quotaBadgeText, { color: colors.brand.purple }]}>{label}</Text>
          </View>
        )}

        <TextInput
          style={[
            styles.textInput,
            { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary },
          ]}
          value={text}
          onChangeText={setText}
          placeholder="Paste your confirmation email…"
          placeholderTextColor={colors.text.tertiary}
          multiline
        />

        {imageUri ? (
          <View style={styles.imagePreviewWrap}>
            <Image source={{ uri: imageUri }} style={styles.imagePreview} resizeMode="cover" />
            <TouchableOpacity
              style={styles.removeImageBtn}
              onPress={removeImage}
              hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}
              accessibilityLabel="Remove photo"
            >
              <X size={12} color="#fff" weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.photoBtn, { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder }]}
            onPress={pickImage}
            activeOpacity={0.75}
          >
            <Camera size={20} color={colors.text.secondary} weight="duotone" />
            <Text style={[styles.photoBtnText, { color: colors.text.secondary }]}>Add a photo instead</Text>
          </TouchableOpacity>
        )}

        {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}

        <View style={styles.importButtonWrapper}>
          <Button
            label={isPending ? 'Reading…' : 'Import'}
            onPress={handleImport}
            loading={isPending}
            disabled={!canImport}
            variant="hero"
            size="lg"
            fullWidth
          />
        </View>

        <TouchableOpacity onPress={handleEnterManually} style={styles.manualLink} activeOpacity={0.7}>
          <Text style={[styles.manualLinkText, { color: colors.text.secondary }]}>Enter manually instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { flex: 1 },
  intro: {
    fontSize: FontSize.base,
    lineHeight: 22,
    marginBottom: Spacing['4'],
  },
  quotaBadge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing['1'],
    paddingHorizontal: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  quotaBadgeText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
  },
  textInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
    minHeight: 140,
    textAlignVertical: 'top',
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    minHeight: 52,
    marginTop: Spacing['3'],
  },
  photoBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  imagePreviewWrap: {
    marginTop: Spacing['3'],
    alignSelf: 'flex-start',
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: BorderRadius.md,
  },
  removeImageBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: {
    fontSize: FontSize.sm,
    marginTop: Spacing['3'],
  },
  importButtonWrapper: {
    marginTop: Spacing['6'],
  },
  manualLink: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    marginTop: Spacing['2'],
  },
  manualLinkText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
```

Note: the primary "Import" button uses `fullWidth` with no `marginHorizontal` in a separate `style` prop
— it's wrapped in `importButtonWrapper` (`marginTop` only, no horizontal margin) specifically to avoid
the `fullWidth`-plus-horizontal-margin overflow bug already fixed elsewhere in this codebase (see the
`post/edit/[id].tsx` and `create-photo.tsx` fixes) — don't reintroduce it here.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 5: Manual verification**

This task's screen isn't reachable from the UI yet (Task 10 wires the hub's `+` button to it) — verify by
navigating directly: with the app running in the simulator, use `router.push('/(wallet)/import')` is not
directly triggerable without a code path yet, so full interactive verification happens in Task 13. For
now, confirm the file compiles and lints cleanly; that's sufficient to unblock Task 10.

- [ ] **Step 6: Commit**

```bash
git add app/\(wallet\)/import.tsx app/\(wallet\)/_layout.tsx
git commit -m "feat: add wallet Import screen (paste text or photo, Gemini extraction)"
```

---

### Task 10: Wire the wallet hub's `+` button to Import

**Files:**
- Modify: `app/(wallet)/index.tsx`

**Interfaces:**
- Consumes: route `/(wallet)/import` (Task 9).

- [ ] **Step 1: Replace `handleAdd` in `app/(wallet)/index.tsx`**

Current implementation (to be replaced):

```ts
const handleAdd = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (segment === 'flights') {
    router.push('/(wallet)/boarding-pass/add');
    return;
  }
  if (segment === 'reservations') {
    router.push('/(wallet)/reservation/add');
    return;
  }
  if (segment === 'loyalty') {
    router.push('/(wallet)/loyalty/add');
    return;
  }
  Alert.alert('Add to wallet', undefined, [
    { text: 'Boarding pass', onPress: () => router.push('/(wallet)/boarding-pass/add') },
    { text: 'Reservation', onPress: () => router.push('/(wallet)/reservation/add') },
    { text: 'Loyalty program', onPress: () => router.push('/(wallet)/loyalty/add') },
    { text: 'Cancel', style: 'cancel' },
  ]);
}, [segment]);
```

New implementation:

```ts
const handleAdd = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  if (segment === 'loyalty') {
    // Import only produces boarding passes/reservations (see the design
    // spec's scope split) — from the Loyalty segment, manual entry is the
    // only sensible destination, so this stays a direct link rather than
    // routing through Import just to bounce back out to manual anyway.
    router.push('/(wallet)/loyalty/add');
    return;
  }
  router.push('/(wallet)/import');
}, [segment]);
```

The old `Alert.alert('Add to wallet', ...)` type-picker isn't deleted from the app — it now lives in
`app/(wallet)/import.tsx`'s "Enter manually instead" link (Task 9), reachable from there instead of
directly from the hub. After this change, `Alert` becomes potentially unused in this file — check the
rest of `app/(wallet)/index.tsx` for any other `Alert` usage before removing the import; if this was the
only use, remove `Alert` from the `react-native` import line.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors (and no unused-import error if `Alert` was correctly removed/kept per Step 1's
check).

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 4: Manual verification**

Run: `npx expo start --ios` (or reuse a running instance).

1. Open the wallet hub. On the "All", "Flights", or "Reservations" segment, tap `+` — confirm it opens
   the new Import screen (not the old alert).
2. Switch to the "Loyalty" segment, tap `+` — confirm it still goes straight to the loyalty add form (no
   change from today's behavior there).
3. On the Import screen, tap "Enter manually instead" — confirm the same 4-option alert from before still
   appears and each option still routes correctly.

- [ ] **Step 5: Commit**

```bash
git add app/\(wallet\)/index.tsx
git commit -m "feat: promote Import as the wallet hub's primary add action"
```

---

### Task 11: Draft pre-fill in the boarding pass form

**Files:**
- Modify: `app/(wallet)/boarding-pass/add.tsx`

**Interfaces:**
- Consumes: `useImportDraftStore` (Task 7).

- [ ] **Step 1: Add the import**

```ts
import { useImportDraftStore } from '@/stores/useImportDraftStore';
```

- [ ] **Step 2: Read the `draft` param and store, alongside the existing `id` param**

The current line:

```ts
const { id } = useLocalSearchParams<{ id?: string }>();
```

becomes:

```ts
const { id, draft: draftParam } = useLocalSearchParams<{ id?: string; draft?: string }>();
const draft = useImportDraftStore((s) => s.draft);
const clearDraft = useImportDraftStore((s) => s.clearDraft);
```

- [ ] **Step 3: Add a second pre-fill `useEffect`, alongside the existing `existing`-based one**

The existing `useEffect` (keyed on `existing`, for `?id=` edit mode) is unchanged. Add this new one right
after it:

```ts
useEffect(() => {
  if (draftParam !== 'true' || !draft || draft.kind !== 'boarding_pass') return;
  setForm((prev) => ({
    ...prev,
    airline: draft.fields.airline ?? prev.airline,
    flightNumber: draft.fields.flightNumber ?? prev.flightNumber,
    origin: draft.fields.origin ?? prev.origin,
    originCity: draft.fields.originCity ?? prev.originCity,
    destination: draft.fields.destination ?? prev.destination,
    destinationCity: draft.fields.destinationCity ?? prev.destinationCity,
    seat: draft.fields.seat ?? prev.seat,
    gate: draft.fields.gate ?? prev.gate,
    terminal: draft.fields.terminal ?? prev.terminal,
  }));
  if (draft.fields.departureTime) {
    const d = new Date(draft.fields.departureTime);
    setDepartureDate(d);
    setDepartureTime(d);
  }
  clearDraft();
}, [draftParam, draft, clearDraft]);
```

This mirrors the existing `existing`-based effect's field-by-field assignment exactly, substituting
`draft.fields.X ?? prev.X` for `existing.X ?? ''` since a draft may only have some fields populated (the
form's other fields, if any were already typed before the draft effect fires, are preserved rather than
being blanked — though in practice this effect fires once on mount before the user has typed anything).
`clearDraft()` at the end means navigating to Import a second time never shows a stale draft on this
form.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 6: Commit**

```bash
git add app/\(wallet\)/boarding-pass/add.tsx
git commit -m "feat: pre-fill boarding pass form from an Import draft"
```

---

### Task 12: Draft pre-fill in the reservation form

**Files:**
- Modify: `app/(wallet)/reservation/add.tsx`

**Interfaces:**
- Consumes: `useImportDraftStore` (Task 7).

- [ ] **Step 1: Add the import**

```ts
import { useImportDraftStore } from '@/stores/useImportDraftStore';
```

- [ ] **Step 2: Read the `draft` param and store, alongside the existing `id` param**

The current line:

```ts
const { id } = useLocalSearchParams<{ id?: string }>();
```

becomes:

```ts
const { id, draft: draftParam } = useLocalSearchParams<{ id?: string; draft?: string }>();
const draft = useImportDraftStore((s) => s.draft);
const clearDraft = useImportDraftStore((s) => s.clearDraft);
```

- [ ] **Step 3: Add a second pre-fill `useEffect`, alongside the existing `existing`-based one**

```ts
useEffect(() => {
  if (draftParam !== 'true' || !draft || draft.kind !== 'reservation') return;
  setType(draft.reservationType);
  if (draft.fields.title) setTitle(draft.fields.title);
  if (draft.fields.confirmationCode) setConfirmationCode(draft.fields.confirmationCode);
  if (draft.fields.address) setAddress(draft.fields.address);
  if (draft.fields.notes) setNotes(draft.fields.notes);
  if (draft.fields.checkIn) setCheckIn(new Date(draft.fields.checkIn));
  if (draft.fields.checkOut) setCheckOut(new Date(draft.fields.checkOut));
  clearDraft();
}, [draftParam, draft, clearDraft]);
```

This form's fields are individual `useState`s (not one `FormState` object like the boarding pass form),
so each field is conditionally set only if present in the draft, leaving the field's existing default
(`''` / `'hotel'` / `null`) otherwise.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors in this file.

- [ ] **Step 6: Commit**

```bash
git add app/\(wallet\)/reservation/add.tsx
git commit -m "feat: pre-fill reservation form from an Import draft"
```

---

### Task 13: End-to-end manual verification

**Files:** none (verification only)

- [ ] **Step 1: Deploy the two new Cloud Functions**

Run: `cd functions && npm run deploy`

This is required — the client callables (`parseTravelConfirmation`, `getImportQuota`) don't exist on the
live project until deployed, unlike client-side code which hot-reloads through Metro. Confirm the deploy
output lists both new functions successfully created.

- [ ] **Step 2: Full text-paste flow**

In the simulator: Wallet hub → `+` → Import. Paste a real flight confirmation email's text (or a
realistic fabricated one with an airline, flight number, airport codes, and a date/time). Tap Import.
Confirm it lands on the boarding pass add form with fields pre-filled matching what was in the text.
Adjust anything wrong, tap "Add boarding pass", confirm it saves and appears in the Flights segment.

- [ ] **Step 3: Full photo flow**

Wallet hub → `+` → Import → "Add a photo instead", pick a screenshot of a hotel/reservation confirmation.
Tap Import. Confirm it lands on the reservation add form with the correct `type` selected and fields
pre-filled. Save, confirm it appears in the Reservations segment.

- [ ] **Step 4: Quota exhaustion (free tier account)**

Using a free-tier test account that has already used its 1 import this year (either a fresh account's
first import, immediately followed by a second attempt, or a test account whose `usage_quotas` doc
already has this year's `wallet_imports_...` key set to `1`): attempt a second import. Confirm it
redirects to `/paywall` instead of showing a result.

- [ ] **Step 5: Pro/business tier account**

Using a pro or business tier test account: confirm the Import screen shows no quota badge at all, and
confirm multiple imports in a row all succeed with no quota error.

- [ ] **Step 6: Parse failure handling**

Submit clearly non-travel-related text (e.g. "hello world") or an unrelated photo. Confirm the screen
shows the inline error message rather than crashing or silently doing nothing, and that quota is NOT
consumed on a parse failure that throws before Step 6's quota-increment in `parseTravelConfirmation.ts`
runs — the increment only happens after a successful parse, so a garbage-in case that Gemini still
manages to return valid (if useless) JSON for will consume quota, but a hard failure (invalid JSON, Gemini
error) will not. Confirm this matches by checking `usage_quotas/{uid}` in the Firebase console before and
after a failed attempt.

- [ ] **Step 7: Final full test suite + typecheck**

Run: `npm test -- --watchAll=false` and `npx tsc --noEmit` (client), `cd functions && npm run build`
(functions).
Expected: all green — this plan added no client-side automated tests (see Global Constraints), so this
step confirms no regressions were introduced anywhere else, not new coverage.
