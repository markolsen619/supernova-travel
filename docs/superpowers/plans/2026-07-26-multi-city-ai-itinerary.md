# Multi-City AI Itinerary Generation (Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the `generateTrip` Cloud Function to plan a coherent itinerary spanning every destination
in `additionalDestinations`, in order, with Gemini allocating days per city itself, an explicit transit
activity marking each city change, and per-city local currency — while guaranteeing the existing
single-destination prompt is completely unaffected.

**Architecture:** `buildPrompt()` forks on `data.additionalDestinations.length`. Zero → the existing
single-destination prompt, untouched. One or more → a new `buildMultiCityPrompt()` function. No response
schema change — `GeneratedTrip`/`GeneratedDay`/`GeneratedActivity` stay exactly as they are; the
multi-city behavior lives entirely in the prompt instructions Gemini receives.

**Tech Stack:** Firebase Cloud Functions v2, `@google/generative-ai` (Gemini), Expo/React Native (one
small client-side text change).

**Spec:** `docs/superpowers/specs/2026-07-26-multi-city-ai-itinerary-design.md`

## Global Constraints

- The single-destination prompt path (`data.additionalDestinations.length === 0`) MUST produce
  byte-identical output to the current `buildPrompt()` — this is the single most important guarantee in
  this plan, since single-destination trips remain the overwhelming majority of AI generations. Verify
  this directly (Task 1's Step 4), don't just assume the refactor preserved it.
- No changes to `GeneratedActivity`, `GeneratedDay`, `GeneratedTrip`, or any client-side type
  (`TripDay`, `TripActivity`, etc.) — the response JSON schema Gemini must return is unchanged.
- Destinations must be visited strictly in the order given (primary first, then `additionalDestinations`
  in array order) — no reordering, no skipping, no revisiting.
- `dayNumber` stays one continuous sequence (1..`durationDays`) spanning every city — never resets at a
  city boundary.
- Each city's activities use that city's own local currency, not one currency for the whole trip.
- The required inter-city transit activity's `searchQuery` must name a real transit hub in the
  *departure* city (not the arrival city, not a placeholder) — this is the one field Gemini is allowed
  to use for later Places grounding, per the existing "CRITICAL: never output a placeId" rule.
- **Testing reality check:** this repo has zero Cloud Functions test harness and no way to
  deterministically unit-test what Gemini actually returns (it's a live LLM call — see Global
  Constraints precedent from the direct-messaging and multi-destination-trips plans). This plan's
  verification therefore has two distinct layers: (1) inspecting the exact *prompt text* `buildPrompt()`
  produces, for both the zero- and multi-destination cases, which IS fully deterministic and
  verifiable without calling Gemini at all; (2) a required manual end-to-end generation (Task 3) to
  confirm Gemini actually follows the new instructions well, which cannot be automated and needs a
  human to read the result.

---

### Task 1: Multi-city prompt in `generateTrip.ts`

**Files:**
- Modify: `functions/src/generateTrip.ts`

**Interfaces:**
- Consumes: `GenerateTripRequest.additionalDestinations` (existing, from Phase 1).
- Produces: `buildPrompt` gains a new branch; a new `buildMultiCityPrompt` function is added and
  exported (for the verification script in Step 4, mirroring the `sendPushNotification` export
  precedent from the direct-messaging feature — exported purely for testability, not consumed by any
  other production file).

- [ ] **Step 1: Export `buildPrompt` for testability**

In `functions/src/generateTrip.ts`, find:

```ts
function buildPrompt(data: GenerateTripRequest): string {
```

Replace with:

```ts
export function buildPrompt(data: GenerateTripRequest): string {
```

- [ ] **Step 2: Add the fork and the new multi-city prompt function**

Find the full body of `buildPrompt`:

```ts
export function buildPrompt(data: GenerateTripRequest): string {
  const mustSeeStr =
    data.mustSee.length > 0
      ? `Must-see (each one of these MUST appear as its own activity somewhere in the itinerary): ${data.mustSee.join(', ')}.`
      : '';
  const prefStr = data.preferences ? `Additional preferences: ${data.preferences}.` : '';

  return `Create a ${data.durationDays}-day ${data.travelStyle}-style travel itinerary for ${data.destination}, paced for a "${data.pace}" traveler.

Pace rule for this trip: ${PACE_RULES[data.pace]}
Travel style rule for this trip: ${STYLE_RULES[data.travelStyle]}
${mustSeeStr}
${prefStr}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "title": "Trip title",
  "description": "2-3 sentence trip overview",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day theme title",
      "notes": "Brief day overview",
      "activities": [
        {
          "type": "hotel|flight|restaurant|activity|transport|free",
          "title": "Activity name",
          "address": "Best-guess one-line address or null — this is NOT verified, so approximate is fine",
          "rationale": "One sentence on why this stop fits this traveler's style/pace/preferences",
          "searchQuery": "A specific, geographically-qualified search string for this place, e.g. 'Louvre Museum, Paris' — this is the ONLY place-identifying field you may output",
          "startTime": "09:00 or null",
          "endTime": "11:00 or null",
          "notes": "Brief description",
          "cost": 25 or null,
          "currency": "USD or null"
        }
      ]
    }
  ]
}

Rules:
- Follow the pace rule above for how many activities to include per day — do not default to a generic count
- Follow the travel style rule above — the itinerary should look visibly different for a different style/pace than this one
- Mix activity types naturally
- Use local currency for costs
- Include at least one meal per day
- Start day 1 with hotel check-in if multi-day
- Return exactly ${data.durationDays} days
- CRITICAL: never output a Google placeId or any other place identifier — searchQuery must be a plain human-readable search string, not an ID. Real places are resolved separately after generation.`;
}
```

Replace with (the single-destination `return` block below is **byte-for-byte identical** to the
original — only the surrounding `if` and the new function after it are additions):

```ts
export function buildPrompt(data: GenerateTripRequest): string {
  const mustSeeStr =
    data.mustSee.length > 0
      ? `Must-see (each one of these MUST appear as its own activity somewhere in the itinerary): ${data.mustSee.join(', ')}.`
      : '';
  const prefStr = data.preferences ? `Additional preferences: ${data.preferences}.` : '';

  if (data.additionalDestinations.length > 0) {
    return buildMultiCityPrompt(data, mustSeeStr, prefStr);
  }

  return `Create a ${data.durationDays}-day ${data.travelStyle}-style travel itinerary for ${data.destination}, paced for a "${data.pace}" traveler.

Pace rule for this trip: ${PACE_RULES[data.pace]}
Travel style rule for this trip: ${STYLE_RULES[data.travelStyle]}
${mustSeeStr}
${prefStr}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "title": "Trip title",
  "description": "2-3 sentence trip overview",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day theme title",
      "notes": "Brief day overview",
      "activities": [
        {
          "type": "hotel|flight|restaurant|activity|transport|free",
          "title": "Activity name",
          "address": "Best-guess one-line address or null — this is NOT verified, so approximate is fine",
          "rationale": "One sentence on why this stop fits this traveler's style/pace/preferences",
          "searchQuery": "A specific, geographically-qualified search string for this place, e.g. 'Louvre Museum, Paris' — this is the ONLY place-identifying field you may output",
          "startTime": "09:00 or null",
          "endTime": "11:00 or null",
          "notes": "Brief description",
          "cost": 25 or null,
          "currency": "USD or null"
        }
      ]
    }
  ]
}

Rules:
- Follow the pace rule above for how many activities to include per day — do not default to a generic count
- Follow the travel style rule above — the itinerary should look visibly different for a different style/pace than this one
- Mix activity types naturally
- Use local currency for costs
- Include at least one meal per day
- Start day 1 with hotel check-in if multi-day
- Return exactly ${data.durationDays} days
- CRITICAL: never output a Google placeId or any other place identifier — searchQuery must be a plain human-readable search string, not an ID. Real places are resolved separately after generation.`;
}

/**
 * Multi-city variant of buildPrompt(), used when additionalDestinations is
 * non-empty. Gemini allocates the total day count across all listed cities
 * itself (no pre-computed split from our own code — see the Phase 2 design
 * spec's "Day allocation" decision), in the exact order given. The JSON
 * response schema is identical to the single-city prompt — only the
 * instructions change, not the shape Gemini must return.
 */
export function buildMultiCityPrompt(data: GenerateTripRequest, mustSeeStr: string, prefStr: string): string {
  const cities = [
    { name: data.destination, countryCode: data.countryCode || null },
    ...data.additionalDestinations.map((d) => ({ name: d.name, countryCode: d.countryCode })),
  ];
  const cityListStr = cities
    .map((c, i) => `${i + 1}. ${c.name}${c.countryCode ? ` (${c.countryCode})` : ''}`)
    .join('\n');

  return `Create a ${data.durationDays}-day ${data.travelStyle}-style multi-city travel itinerary spanning these destinations, IN THIS ORDER:
${cityListStr}

Paced for a "${data.pace}" traveler.

Pace rule for this trip: ${PACE_RULES[data.pace]}
Travel style rule for this trip: ${STYLE_RULES[data.travelStyle]}
${mustSeeStr}
${prefStr}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "title": "Trip title",
  "description": "2-3 sentence trip overview",
  "days": [
    {
      "dayNumber": 1,
      "title": "Day theme title",
      "notes": "Brief day overview",
      "activities": [
        {
          "type": "hotel|flight|restaurant|activity|transport|free",
          "title": "Activity name",
          "address": "Best-guess one-line address or null — this is NOT verified, so approximate is fine",
          "rationale": "One sentence on why this stop fits this traveler's style/pace/preferences",
          "searchQuery": "A specific, geographically-qualified search string for this place, e.g. 'Louvre Museum, Paris' — this is the ONLY place-identifying field you may output",
          "startTime": "09:00 or null",
          "endTime": "11:00 or null",
          "notes": "Brief description",
          "cost": 25 or null,
          "currency": "USD or null"
        }
      ]
    }
  ]
}

Rules:
- Follow the pace rule above for how many activities to include per day — do not default to a generic count
- Follow the travel style rule above — the itinerary should look visibly different for a different style/pace than this one
- Mix activity types naturally
- Allocate the ${data.durationDays} total days across all ${cities.length} destinations yourself, in the order listed above — consider how much there typically is to see and do in each place. Do not split evenly by default; weight it realistically based on each destination's size and typical stay length.
- Visit the destinations strictly in the order listed above — do not reorder them and do not revisit an earlier destination later in the trip
- On the FIRST day at each destination after the first, include exactly one "transport"-type activity before any other activity that day, titled like "Travel from {previous destination} to {this destination}". Its searchQuery must name a real, findable transit hub in the PREVIOUS (departure) destination — its main train station or airport (e.g. "Gare de Lyon, Paris") — never the destination just arrived at, and never a generic placeholder
- Each activity's cost and currency must reflect the LOCAL currency of whichever destination that activity actually takes place in — not one single currency for the whole trip
- Include at least one meal per day
- Start the very first day of the whole trip with hotel check-in
- Return exactly ${data.durationDays} days total across the whole trip
- dayNumber must be one continuous sequence from 1 to ${data.durationDays} spanning all destinations — do not restart numbering when arriving at a new destination
- CRITICAL: never output a Google placeId or any other place identifier — searchQuery must be a plain human-readable search string, not an ID. Real places are resolved separately after generation.`;
}
```

- [ ] **Step 3: Verify the Cloud Functions package builds**

Run: `cd functions && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Write and run a prompt-inspection script (the deterministic verification layer)**

Create a throwaway script (not committed — delete it after use, same convention as prior sessions'
isolated repro scripts) at `functions/lib/__verify_prompt.js` — using the **compiled** output since
`buildPrompt` is a plain function with no Firebase Admin/network dependency, so it can be called
directly without any emulator or credentials:

```js
const { buildPrompt } = require('./generateTrip');

const baseRequest = {
  destination: 'Paris',
  countryCode: 'FR',
  additionalDestinations: [],
  startDate: null,
  endDate: null,
  durationDays: 5,
  travelStyle: 'cultural',
  pace: 'moderate',
  mustSee: ['Louvre Museum'],
  preferences: '',
};

console.log('=== SINGLE-DESTINATION PROMPT ===');
console.log(buildPrompt(baseRequest));

console.log('\n\n=== MULTI-CITY PROMPT ===');
console.log(buildPrompt({
  ...baseRequest,
  durationDays: 9,
  additionalDestinations: [
    { name: 'Rome', placeId: null, lat: null, lng: null, countryCode: 'IT' },
    { name: 'Barcelona', placeId: null, lat: null, lng: null, countryCode: 'ES' },
  ],
}));
```

Run: `cd functions && node lib/__verify_prompt.js`

Read the printed output and confirm:
1. The "SINGLE-DESTINATION PROMPT" section reads identically to what `buildPrompt` produced before
   this task's changes (spot-check against the original template above — same wording, same rule list,
   no "multi-city"/city-list language anywhere in it).
2. The "MULTI-CITY PROMPT" section lists all three cities in order with country codes, states the
   9-day total, and contains the transit-activity rule, the per-city-currency rule, the strict-order
   rule, and the continuous-dayNumber rule.

Then delete the script: `rm functions/lib/__verify_prompt.js` (it's compiled-output scratch, not
committed source — confirm `git status` shows nothing new before moving on).

- [ ] **Step 5: Commit**

```bash
git add functions/src/generateTrip.ts
git commit -m "feat: teach generateTrip to plan multi-city itineraries"
```

---

### Task 2: AI-generating loading screen shows all destinations

**Files:**
- Modify: `app/trip/ai-generating.tsx`

**Interfaces:**
- Consumes: `params.destination`, `params.additionalDestinations` (existing route params from Phase 1).

- [ ] **Step 1: Add a destination-display helper**

In `app/trip/ai-generating.tsx`, add near the top of the file, after the existing `STATUS_MESSAGES`/
`STATUS_THRESHOLDS` constants:

```ts
/** Comma-joined "A, B & C" formatting for the loading screen — same join
 * pattern app/trip/new.tsx's auto-title already uses, duplicated here
 * rather than extracted (this codebase's established convention for small,
 * single-call-site date/string helpers — see the multi-destination-trips
 * and AI-generate-dates plans' self-review notes). */
function formatDestinationDisplay(primary: string, additionalJson: string | undefined): string {
  let additional: { name: string }[] = [];
  try {
    additional = JSON.parse(additionalJson ?? '[]');
  } catch {
    additional = [];
  }
  const allNames = [primary, ...additional.map((d) => d.name)].filter(Boolean);
  if (allNames.length <= 1) return allNames[0] || 'your destination';
  return allNames.join(', ').replace(/, ([^,]*)$/, ' & $1');
}
```

- [ ] **Step 2: Compute the display value and use it in the JSX**

Inside the `AiGeneratingScreen` component, after the existing `const { generateTrip, isPending, error } = useAiGenerateTrip();` line, add:

```ts
  const destinationDisplay = formatDestinationDisplay(params.destination, params.additionalDestinations);
```

Find:

```tsx
        <Text style={styles.destination}>
          {params.destination || 'your destination'}
        </Text>
```

Replace with:

```tsx
        <Text style={styles.destination}>
          {destinationDisplay}
        </Text>
```

- [ ] **Step 3: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors involving `app/trip/ai-generating.tsx`.

- [ ] **Step 4: Commit**

```bash
git add app/trip/ai-generating.tsx
git commit -m "feat: show all destinations on the AI-generating loading screen"
```

---

### Task 3: Full smoke test + manual end-to-end generation

**Files:** none (verification only)

- [ ] **Step 1: Run the full typecheck**

Run: `npx tsc --noEmit`
Expected: zero errors project-wide.

- [ ] **Step 2: Run the functions build**

Run: `cd functions && npm run build`
Expected: exits 0.

- [ ] **Step 3: Manually generate a real single-destination AI trip (regression check)**

Using the running app: Create → Generate with AI, pick exactly one destination, generate. Confirm the
resulting trip and itinerary look exactly as they always have — this is the regression check for the
single-destination path (Global Constraints' most important guarantee), and it's the one thing Task 1's
Step 4 script inspection can't fully substitute for, since only a real Gemini call proves the model
actually behaves the same, not just that the prompt text is identical.

- [ ] **Step 4: Manually generate a real multi-destination AI trip**

Using the manual destination-list editor on the AI-generate form, add 2-3 destinations (e.g. Paris,
Rome, Barcelona), generate. Confirm:
- The loading screen shows all three names.
- The created trip's day count matches the requested duration, spanning all three cities in order.
- At least one `transport`-type activity appears at each city transition, with a plausible departure-city
  transit hub as its title/searchQuery.
- Costs are in a currency plausible for whichever city that activity is actually in (EUR for Paris/Rome,
  EUR for Barcelona too in this example — try a non-Eurozone combination like London → Paris if you want
  to see the currency actually change activity-to-activity).
- Destinations appear in the itinerary in the same order they were added, never reordered or skipped.

Run the `supernova-design` skill's pre-ship checklist against the one changed screen in this plan
(`app/trip/ai-generating.tsx`) before considering this task done.

- [ ] **Step 5: No commit** — verification only.

## Self-Review Notes

**Spec coverage:** every Design Decision row maps to a concrete instruction in `buildMultiCityPrompt`
(Task 1) or the client change (Task 2) — Gemini-holistic day allocation, required transit activity with
a departure-hub `searchQuery`, flat must-see list (unchanged, no per-city tagging added), no new
day-city field (none added), per-city currency, and the single-destination byte-identical guarantee
(the `if` fork plus Task 1 Step 4's script-based verification).

**Placeholder scan:** no TBD/TODO; every step has complete, literal code, including the full verified
single-destination prompt text reproduced exactly as it exists today.

**Type consistency:** `buildMultiCityPrompt`'s signature (`data: GenerateTripRequest, mustSeeStr: string,
prefStr: string`) matches exactly how it's called from `buildPrompt` in the same task's Step 2 — no
drift, since both are written in the same task by the same implementer, but double-checked here per the
skill's requirement to verify signatures match across the tasks that use them.
