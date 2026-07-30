# AI-Powered Wallet Import — Boarding Passes & Reservations

**Date:** 2026-07-29
**Status:** Approved

## Context

The travel wallet (just redesigned — see `docs/superpowers/specs/2026-07-27-travel-wallet-redesign-design.md`)
is now a unified hub with full add/edit/delete for boarding passes, reservations, and loyalty programs, but
every item is still 100% manual entry. The user wants to stop typing every field by hand.

This splits into two genuinely different problems, decided during brainstorming:

1. **Boarding passes & reservations** — a "parse a document the user already has" problem. Tractable without
   new infrastructure risk.
2. **Loyalty program balances** — an "authenticate to a third party and pull live data" problem, requiring
   either an official partner API (generally unavailable to a small travel app) or storing the user's actual
   provider credentials and screen-scraping, which is fragile and typically against provider ToS.

This spec covers **only (1)**. Loyalty balance sync is explicitly deferred to a separate future design.

## Design Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Input mechanism | Paste confirmation text, or a photo/screenshot | Covers both how people actually have this info (forwarded/copied email text, or a screenshot of an itinerary they can't easily copy text from). Gemini's multimodal input handles both without separate pipelines. |
| Extraction + classification | One Gemini call returns both "what kind of thing is this" (boarding pass vs. reservation, and which `ReservationType`) and the extracted fields | Avoids asking the user to pre-classify what they're importing — mirrors how a person reading the confirmation would recognize the type instantly. |
| Entry point | Wallet hub's `+` button opens the new **Import** screen directly (promoted to the primary action, per user); "Enter manually instead" is a secondary link that falls back to today's `Alert.alert` type-picker (Boarding pass / Reservation / Loyalty program / Cancel) | User explicitly chose to promote import over manual entry, since it's the point of this feature. |
| Review before save | Extraction always lands the user on the *existing* `boarding-pass/add.tsx` / `reservation/add.tsx` form, pre-filled, never auto-saved | Same safety net manual entry already has. A partial or wrong AI parse is just an editable draft, never a silent write. Also means minimal new form UI — the existing forms just gain a second pre-fill source. |
| Draft transfer mechanism | New Zustand store `stores/useImportDraftStore.ts` (matching `useAuthStore`/`useUserStore`'s existing `create()` pattern) holds the extracted draft; forms read from it when arriving via `?draft=true` instead of `?id=` | Expo Router params are strings only — round-tripping a multi-field object through a URL is awkward and has length limits on some platforms. A transient store is the same shape of solution this codebase already uses for cross-screen state. Store clears on successful save or on leaving the form. |
| Quota | New `usage_quotas/{uid}` key, free tier weekly cap, pro/business unlimited | Mirrors `generateTrip`'s existing enforcement exactly (same collection, same weekly-reset mechanism, same tier gate) rather than inventing a second quota system. |
| Photo handling | Picked image is base64-encoded client-side, sent inline in the callable request body, never uploaded to Storage | One-time "parse it, discard it" use case, unlike a post/trip-cover photo the user is choosing to keep. Confirmation screenshots often contain a confirmation code or barcode — no reason to persist that. |
| Gemini model + JSON parsing | `gemini-2.5-flash`, same `model.generateContent(prompt)` → strip ```` ```json ```` fence → `JSON.parse` pattern `generateTrip.ts` already uses | Proven, already-working pattern in this codebase; no new parsing approach to validate. |
| Cloud Function shape | New `parseTravelConfirmation` callable, same `onCall({ region: 'us-central1', enforceAppCheck: false })` shape as `generateTrip`/`getAiTripQuota` | Consistency; the client-side `services/gemini.ts` module gains one more typed `httpsCallable` wrapper next to the existing two. |
| `getWeeklyQuotaKey` | Generalized to accept a namespace prefix (`getWeeklyQuotaKey(prefix: string)`), existing `generateTrip.ts`/`getAiTripQuota.ts` call sites updated to pass `'ai_trips'` | The key format (`{prefix}_{weekStart}`) only differs by prefix between the two features; a second near-identical copy of the date-math would drift from the original instead of staying in lockstep. |
| Barcode/`.pkpass` parsing | Not built | Explicitly out of scope for the wallet redesign already, and Gemini vision on a screenshot covers the common case (most people screenshot their boarding pass, not the raw `.pkpass` file) without needing a dedicated barcode/pass-format parser. |

## Data Model

### `functions/src/quotaUtils.ts` (modified)

```ts
export const FREE_TIER_WEEKLY_AI_TRIP_LIMIT = 1;
export const FREE_TIER_WEEKLY_IMPORT_LIMIT = 3; // new

export function getWeekStart(): Date { /* unchanged */ }
export function getNextWeekStart(): Date { /* unchanged */ }

// Changed: now takes a prefix instead of being hardcoded to 'ai_trips'
export function getWeeklyQuotaKey(prefix: string): string {
  return `${prefix}_${getWeekStart().toISOString().split('T')[0]}`;
}
```

`generateTrip.ts` and `getAiTripQuota.ts` update their one call site each from `getWeeklyQuotaKey()` to
`getWeeklyQuotaKey('ai_trips')` — no behavior change, same resulting key string.

### `functions/src/types.ts` (additions)

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
        airline: string; flightNumber: string;
        origin: string; originCity: string;
        destination: string; destinationCity: string;
        departureTime: string;  // ISO 8601, best-effort
        arrivalTime: string;
        seat: string; boardingGroup: string; gate: string; terminal: string;
      }>;
    }
  | {
      kind: 'reservation';
      reservationType: ReservationType; // 'hotel' | 'airbnb' | 'rental_car' | 'restaurant' | 'activity' | 'show'
      fields: Partial<{
        title: string; confirmationCode: string;
        checkIn: string; checkOut: string;  // ISO 8601 date, best-effort
        address: string; notes: string;
      }>;
    };
```

Every field is optional — Gemini omits what it can't confidently find rather than guessing, and the form
renders those as blank inputs exactly like starting a manual entry.

### `types/ai.ts` (additions, client-side mirror)

```ts
export interface ImportQuota {
  tier: 'free' | 'pro' | 'business';
  limit: number | null;      // null = unlimited
  remaining: number | null;  // null = unlimited
  resetsAt: string | null;   // null = unlimited
}
```

`ParseTravelConfirmationRequest`/`Result` types are re-exported (or duplicated identically) client-side for
`services/gemini.ts`'s callable typing, matching how `GenerateTripRequest` already exists on both sides.

### `stores/useImportDraftStore.ts` (new)

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

## Cloud Function: `functions/src/parseTravelConfirmation.ts` (new)

Shape mirrors `generateTrip.ts` closely:

1. Auth check (`onCall`, throw `unauthenticated` if no `request.auth`).
2. Validate request: at least one of `text`/`imageBase64` must be present, throw `invalid-argument` otherwise.
3. Quota check for free tier: read `users/{uid}.tier`, if `'free'` read `usage_quotas/{uid}`, compare
   `quotaData[getWeeklyQuotaKey('wallet_imports')]` against `FREE_TIER_WEEKLY_IMPORT_LIMIT`, throw
   `resource-exhausted` if met — identical shape to `generateTrip.ts`'s quota check, different constant/prefix.
4. Build the Gemini request content array: `[{ text: buildExtractionPrompt() }, ...(imageBase64 ? [{ inlineData: { mimeType: imageMimeType, data: imageBase64 } }] : [])]`. `buildExtractionPrompt()` instructs Gemini to: read the provided confirmation text and/or image, decide if it's a flight boarding pass or another kind of reservation, pick the closest `ReservationType` if the latter, extract every field it can confidently find into the exact JSON shape from `ParseTravelConfirmationResult`, and omit (not guess) fields it can't find. Same `model: 'gemini-2.5-flash'`, `model.generateContent(...)`.
5. Parse the response with the same ```` ```json ```` fence-stripping + `JSON.parse` `generateTrip.ts` already uses; throw `internal` on parse failure (surfaced to the user as "couldn't read that — try pasting the text instead" per the client-side UX below).
6. Update quota for free tier (same `FieldValue.increment(1)` pattern as `generateTrip.ts`, on the `wallet_imports` key).
7. Return the parsed `ParseTravelConfirmationResult` — nothing is written to Firestore by this function; it only extracts.

## Cloud Function: `functions/src/getImportQuota.ts` (new)

Direct copy of `getAiTripQuota.ts`'s shape, reading the `wallet_imports` key and
`FREE_TIER_WEEKLY_IMPORT_LIMIT` instead.

## `services/gemini.ts` (modified)

Two new exports, same `httpsCallable` pattern as `callGenerateTrip`/`callGetAiTripQuota`:

```ts
export async function callParseTravelConfirmation(
  request: ParseTravelConfirmationRequest
): Promise<ParseTravelConfirmationResult> {
  const fn = httpsCallable<ParseTravelConfirmationRequest, ParseTravelConfirmationResult>(
    functions, 'parseTravelConfirmation', { timeout: 60000 }
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

## Hooks

- `hooks/useImportQuota.ts` — direct mirror of `useAiTripQuota.ts` (`useQuery`, key `['importQuota', uid]`,
  `staleTime: 2 * 60 * 1000`).
- `hooks/useParseTravelConfirmation.ts` — mirrors `useAiGenerateTrip.ts`: a `useMutation` wrapping
  `callParseTravelConfirmation`. On success, calls `useImportDraftStore.getState().setDraft(result)` and
  navigates to `/(wallet)/boarding-pass/add?draft=true` or `/(wallet)/reservation/add?draft=true` depending
  on `result.kind`. On `functions/resource-exhausted`, invalidates `['importQuota', uid]` and
  `router.replace('/paywall')` — identical error-handling shape to `useAiGenerateTrip.ts`.

## `app/(wallet)/import.tsx` (new screen)

- Header: `WalletHeader` (title "Import"), no right action.
- A `TextInput` (multiline) for pasting confirmation text, placeholder "Paste your confirmation email…".
- A photo button (camera icon) using `expo-image-picker`, same `launchImageLibraryAsync` call shape already
  used in `app/post/create-photo.tsx` (`mediaTypes: ['images'], quality: 0.85`), single selection only —
  reads the picked asset, base64-encodes it for the request.
- Primary button: "Import" (hero variant, this screen's one hero moment per the design system's "at most one
  hero CTA per flow" rule), disabled until either the text field is non-empty or a photo is picked. Calls
  `useParseTravelConfirmation().mutateAsync(...)`, shows a loading state while pending, surfaces a
  `functions/internal` parse failure as an inline error ("Couldn't read that — try pasting the confirmation
  text instead" if they'd picked a photo, or "Couldn't read that — try a screenshot instead" if they'd pasted
  text) rather than a silent failure.
- Secondary link below the primary button: "Enter manually instead" — triggers the same
  `Alert.alert('Add to wallet', ...)` type-picker the wallet hub's `+` button used to open directly, now
  reached from here instead.
- A small "X of Y imports left this week" hint (from `useImportQuota()`), matching how `AiPromptForm` already
  surfaces the AI-trip-generation quota — hidden entirely for pro/business (`limit === null`).

## `app/(wallet)/index.tsx` (modified)

The hub's `+` button (`WalletHeader`'s `rightAction`) changes from opening the `Alert.alert` type-picker
directly to `router.push('/(wallet)/import')`. The `Alert.alert` type-picker itself is unchanged in
behavior/code — it just moves to being triggered from the new Import screen's "Enter manually instead" link
instead of the hub's `+` button.

## `app/(wallet)/boarding-pass/add.tsx` / `reservation/add.tsx` (modified)

Both forms gain a second pre-fill source alongside the existing `?id=` → Firestore-lookup path:

```ts
const { id, draft: draftParam } = useLocalSearchParams<{ id?: string; draft?: string }>();
const draft = useImportDraftStore((s) => s.draft);
const clearDraft = useImportDraftStore((s) => s.clearDraft);

// existing `isEditMode = !!id` / `existing = ...` unchanged

useEffect(() => {
  if (draftParam !== 'true' || !draft || draft.kind !== 'boarding_pass') return; // 'reservation' for the other form
  setForm((prev) => ({ ...prev, ...draft.fields }));
  if (draft.fields.departureTime) {
    const d = new Date(draft.fields.departureTime);
    setDepartureDate(d);
    setDepartureTime(d);
  }
  clearDraft();
}, [draftParam, draft, clearDraft]);
```

This is additive to the existing `existing`-based `useEffect` (Task 6/7/8 of the wallet redesign plan), not a
replacement — the form still has exactly one other pre-fill path (`?id=`) plus this new one (`?draft=true`),
mutually exclusive by construction (a freshly-parsed draft has no Firestore `id` yet). `clearDraft()` on
consumption means navigating back to Import a second time never shows a stale draft.

## Testing

No component-render test library is installed in this repo (consistent with every other recent UI-heavy
project here), so this is verified manually in the simulator: paste a real confirmation email's text, import
a photo of a printed confirmation, confirm the right form opens pre-filled, confirm quota depletion redirects
to `/paywall` on the free tier, confirm pro-tier shows no quota hint and never hits the limit. The one piece
worth a unit test is `getWeeklyQuotaKey`'s generalization (`quotaUtils.ts`) — confirm
`getWeeklyQuotaKey('ai_trips')` and `getWeeklyQuotaKey('wallet_imports')` produce the expected
`{prefix}_{weekStart}` shape and that the two prefixes never collide.

## Out of Scope

- Loyalty program balance sync — separate future design, per the brainstorming split.
- Barcode/`.pkpass` file parsing as a distinct input path (Gemini vision on a screenshot covers the practical
  case).
- Auto-save without review, even for high-confidence extractions.
- Bulk import (multiple confirmations at once, or an inbox-scanning flow) — one paste/photo → one item, same
  as manual entry today.
- Editing `usage_quotas` read access for the client — stays fully server-side
  (`firestore.rules: usage_quotas/{uid} { allow read, write: if false }`), unchanged; the new
  `getImportQuota` callable is the only client-facing read, mirroring `getAiTripQuota`.
