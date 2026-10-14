# Ask Supernova — the agent, phase 1: trips (design)

Approved in chat 2026-10-14. Phase 1 of **one app-wide agent**: its first surface is a chat on a trip that
**proposes** changes the person accepts. The agent is built from day one to grow into other surfaces (see
"Built to grow") without a new endpoint, storage or quota. Later phases, each with its own spec: (2) booking hand-off through affiliate links, closing the loop
with email import; (3) proactive on-trip nudges (flight delays, today's plan).

## Goal

People reshape a trip faster by asking than by editing, the feature pushes Pro sign-ups, and it costs us
fractions of a cent per message. **Owner's standing constraint: the best performance for the lowest cost.**

## Decisions (from the brainstorm)

- **Access:** free accounts get **10 messages a month**, Pro **300 a month** (fair use; counter hidden until
  close). Same pattern as AI trips.
- **Abilities (phase 1):** edit stops; reshape the route (nights, cities, dates); answer questions. Not
  phase 1: writing whole new days, booking links, nudges, voice.
- **Memory:** one private thread **per person, per trip**; only the last 10 messages go to the model.
- **Engine:** **one Gemini call per message**, operations returned as structured data (no tool loop, no
  Google Search grounding — both multiply the cost). A look-up tool can be added later without redesign if
  the evaluation shows bad place guesses.
- **The server never edits the trip.** It proposes; the app applies accepted operations through the same
  code and Firestore rules as manual edits.

## What people see

- **Entry:** on a trip page, one **"Ask Supernova"** button with the brand star — the screen's single
  gradient AI action. Shown only to members who can edit (owner + accepted collaborators, `isTripMember`).
- **Sheet** (tall; follows the theme). Empty state: star · "Plan with Supernova" · "Ask for changes —
  nothing happens until you accept." · three suggestion chips built from the trip (e.g. "Make day 2 less
  rushed", "Find dinner near our hotel on Friday", "Add a night in Porto").
- Messages: yours right, Supernova's left, short plain text. A reply with operations shows a **proposal
  card** under it: one line per change with its type icon (`ACTIVITY_ICONS`), each line untickable, and one
  **Apply changes** button. Route lines that delete stops say so ("Lisbon 3 → 2 nights · removes 2 stops").
- After applying: "Changed 3 things · Undo" bar (~10 s); the trip behind updates; the card shows
  "Applied" (or "Partly applied — 1 change no longer fit the trip").
- Questions get text only, no card.
- **Quota:** free shows "4 of 10 left this month"; at 0 the existing limit paywall (`useLimitPaywall`). Pro
  shows nothing until 30 remain.
- **Consent:** the first use goes through `useAiConsentGate` (see Privacy — the version is bumped).
- ⋯ menu: **Clear conversation**.
- Design rules apply: no emoji, Phosphor icons, haptics (Light on send, Medium on Apply), 44 pt targets,
  `keyboardDismissMode="on-drag"` + `keyboardShouldPersistTaps="handled"` on the message list.

## Server: callable `agent`

Request `{ surface: 'trip', subjectId: tripId, message, requestId, capabilities: ['trip.v1'] }`
(`message` ≤ 500 chars; `requestId` a Firestore auto-id). Phase 1 accepts only `surface: 'trip'`; anything
else is refused with `invalid-argument`.

1. **Checks:** signed in; `aiConsentVersion ≥ AI_CONSENT_VERSION`; caller is a trip member; trip not
   `moderationHidden`. One request in flight per user; ≤ 20 messages an hour.
2. **Retry-safe:** `requestId` is the reply's doc id under the thread. If it already exists, return it — no
   quota, no Gemini call (same pattern as `generateTrip`).
3. **Quota** in `usage_quotas/{uid}` (monthly window, policy in `quotaUtils.ts`: `AGENT_FREE_MONTHLY = 10`,
   `AGENT_PAID_MONTHLY = 300`) — **one allowance shared by every surface**. Charged **only on success**.
4. **Context** — the surface's context builder (registry `agentSurfaces.ts`; phase 1: pure
   `agentTripContext.ts`), compact text:
   - cities in order with nights; each day: label `d1…`, date, city, stops `s1…` (title, type, time if set,
     placed or not);
   - the caller's bookings on this trip — own linked bookings plus shared copies — **type, name, date,
     time only** (never codes, addresses, barcodes);
   - top community places for the trip's catalog cities (`destinations/{slug}.topPlaces`, a few per city);
   - the last 10 messages of the thread (operations summarised, with their applied/dismissed status).
   - Real ids are replaced by short labels (saves tokens; the model can't invent ids). A hard size budget
     trims long notes first, then far-away days' detail, so a 21-day trip never makes a large request.
5. **Model** (through `agentModel.ts`, one `generate({ system, prompt, schema })` function — the only file
   that knows the provider): `gemini-2.5-flash`, **thinking budget 0** (thinking tokens bill as output and add latency),
   JSON response schema `{ reply: string, operations: Operation[] }`, low temperature. The model name is
   one constant; `gemini-2.5-flash-lite` is the candidate if the evaluation supports it.
6. **Validate** (the surface's validator; phase 1 pure `agentTripOps.ts`), then **filter to the caller's
   `capabilities`** (an operation of a kind the app doesn't declare is never returned): map labels back to ids; drop unknown stops/days, out-of-range days,
   bad times (`HH:MM`), titles over 80 chars, more than **12** operations, route changes that leave a
   city with < 1 night. Dropped operations add one line to the reply ("1 suggestion didn't fit the trip").
7. **Save, then respond:** one batch writes the user message, the reply (operations, `status:
   'proposed'`) to `users/{uid}/agentThreads/trip_{tripId}/messages/{id}` and the quota increment (~50 ms),
   then returns `{ messageId, reply, operations, quota }`. Not "respond first": a Cloud Function may be
   paused once it has responded, which would lose messages and break the retry rule. Latency is the
   Gemini call; target ~2–4 s per answer.
8. **Logging:** tokens in/out, latency, operation count — never the message text.
9. **Errors:** "Supernova couldn't answer right now. Try again." — no quota used.

### Operations (phase 1, capability `trip.v1`)

Named per surface: `trip.addStop`, `trip.removeStop`, … (prefix omitted below).

| Op | Fields |
|---|---|
| `addStop` | day, title, type (`ActivityType`), searchQuery, afterStop?, time? |
| `removeStop` | stop |
| `moveStop` | stop, toDay, afterStop? |
| `reorderDay` | day, stops[] (all of that day's stops) |
| `updateStop` | stop, time? (`HH:MM` or null), note? — never the title |
| `setNights` | city, nights |
| `addCity` | name, nights, afterCity? |
| `removeCity` | city, mode (`delete` \| `move`) |
| `moveCity` | city, by (-1 \| 1) |
| `shiftDates` | newStart (`YYYY-MM-DD`) |

Stop times stay wall-clock strings (Architecture Rule 13); AI never presets times unless the person asked
for one.

## App: applying a proposal

- Pure `utils/agentApply.ts` turns ticked operations into calls on existing code, in order: removals →
  moves/reorders → updates → additions → route. Each is **re-checked against the trip as it is now**; one
  that no longer fits (a collaborator deleted the stop) is skipped and reported.
- Stops: `useCreateTrip` mutations, exactly as manual edits. New stops get `searchQuery` (title + day's
  city) so the existing background grounding places them (Places cache → Mapbox); no Places calls at
  proposal time.
- Route: `RouteRow` helpers (`setRowNights`, `moveRow`, `removeRow`, `addRow`) → `rowsToEntries` →
  `planRoute` → `saveRoute`. `addCity` resolves the city with the existing place search when applied.
  Deleting days with stops shows the route editor's confirmation (`dropsWithStops`).
- **Undo:** before applying, snapshot the touched stops and route; one tap restores (this session only).
- Then update the saved message's `status` (`applied` / `partial` / `dismissed`) so the next turn knows.
- `useAgent({ surface, subjectId })`: thread (one `getDocs`, newest 30), send, apply, undo, clear, quota.
  The sheet is a general `components/agent/AgentSheet`; the trip surface supplies its suggestions, card
  lines and apply function (`agentTripSurface.ts`).

## Data & rules

- `users/{uid}/agentThreads/{surface}_{subjectId}/messages/{id}`: `{ surface, subjectId, role: 'user'|'assistant', text,
  operations?, status?, createdAt }`. Read: owner only. Create: server only. Update: owner, **`status` field only**.
  Delete: owner (Clear conversation).
- Account deletion: covered by the recursive delete of `users/{uid}`.
- Trip deletion: a trigger deletes every member's `agentThreads/trip_{tripId}` (collection-group query on
  `subjectId` with `surface == 'trip'`; declared field override / index).
- Quota counters are server-only (existing `usage_quotas` rules).

## Privacy

- **Consent version 2** (`AI_CONSENT_VERSION` in `functions/src/aiConsent.ts` and `utils/aiConsent.ts`):
  the agent sends the trip, your messages and booking names/dates, which version 1's wording doesn't
  cover. `AiConsentSheet` gains an `agent` purpose: "Your trip's cities, days and stops, what you ask, and
  the name, date and time of its bookings." Everyone sees the sheet once more on their next AI action.
- Privacy policy: add the agent to the AI section. Play Data safety: unchanged (in-app messages and
  user content are already declared). App Store privacy label: unchanged categories.
- Prompt injection (e.g. a booking name from an email): at worst it proposes odd changes to this trip,
  which the person must still accept; operations can only touch this trip.

## Testing

- Pure tests: `agentTripContext` (labels, budget trimming, booking fields whitelisted), `agentTripOps`
  (every rejection rule, label mapping), capability filtering, the surface registry refusing unknown
  surfaces, `agentApply` (order, re-check skips, undo snapshot), quota policy, suggestion chips.
- Rules tests by hand on the emulator are not set up in this repo; rules are reviewed in the final review.
- **Evaluation script** `scripts/agent-eval.mjs`: ~25 typical requests against a copy of an editorial
  trip; reports valid-proposal rate, tokens in/out, cost per message and latency. Run before launch and
  whenever the model or prompt changes — it decides Flash vs Flash-Lite and whether thinking stays at 0.

## Cost

~3–6k tokens in, a few hundred out, thinking off: about a third of a cent per message on Flash (about a
quarter of that on Flash-Lite). Free user ≤ ~3¢/month; a Pro user at the 300 cap < $1/month. Bounded by
the quotas, the hourly limit, one-at-a-time, the 500-char message cap and the context budget.

## Built to grow

Phase 1 builds the seams only — no extra cost to run:

- **Surfaces:** a new surface (`wallet`, `explore`, `home` = "Ask anything" from the tab bar) adds a context
  builder + validator on the server and an adapter on the app; the endpoint, threads, quota, consent,
  model wrapper and sheet are shared.
- **Operations are namespaced** (`trip.*`, later `wallet.*`, `nav.open` for "take me there", `book.*`).
- **Capabilities, not app versions:** each app build declares what it can apply (`trip.v1`, later
  `wallet.v1`…); the server never returns an operation the app can't handle. Shipped apps therefore survive
  every later expansion — the lesson of the stored `'transit'` type that crashed 1.0.2.
- **Provider-agnostic:** `agentModel.ts` is the only provider-aware file (switch Flash → Flash-Lite →
  another provider by evidence from the evaluation script).
- **Tool loop later:** if a surface needs look-ups mid-answer, `agentModel.generate` gains optional tools
  with a round cap; surfaces that don't need them keep the one-call path.

## Out of scope (phase 1)

Other surfaces and a global "Ask" entry, the tool loop, booking links and partner APIs (phase 2),
proactive nudges (phase 3), writing whole new days, voice, agent on trips you can only view, a shared group
thread.
