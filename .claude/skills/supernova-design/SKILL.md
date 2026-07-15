---
name: supernova-design
description: Use this skill whenever building, editing, or reviewing ANY user-facing UI in the Supernova travel app — screens, components, sheets, cards, empty states, buttons, lists, or navigation. Trigger on any task that renders pixels a user will see. This skill defines the light editorial design language and a mandatory pre-ship checklist. Do NOT ship UI without running the checklist in this skill.
---

# Supernova Design System — Light Editorial

## The one-sentence brief

Supernova is a **light, warm, editorial travel app where photography is the hero** — with dark reserved exclusively for immersive moments (the Mapbox globe, splash, AI generation). Think a printed travel magazine, not a dashboard.

## Why light

Dark-navy-with-a-purple-gradient is the default aesthetic of every AI-generated app. It's forgiving — it hides bad spacing, weak type, and low-effort surfaces. Light is harder, which is exactly why it reads as *designed*. And travel photography needs whitespace the way a painting needs a gallery wall. Dark UI competes with photos; light UI frames them.

---

## HARD RULES — violating any of these is a bug

These are not suggestions. Check every one before shipping UI.

### 1. No emoji. Ever.
Emoji in UI chrome is the single fastest way to look unfinished. **Phosphor icons only**, imported from `constants/icons.ts` where a semantic map exists.
- Duotone weight for semantic/type icons (activity types, reservation types)
- Bold/regular weight for small utility icons (X, Plus, chevrons, back arrows)
- ❌ `<Text>🗺️</Text>` ✅ `<MapTrifold size={18} weight="duotone" />`

**Narrow, explicit exception — country flags.** `app/(tabs)/explore.tsx`'s `countryCodeToEmoji()` renders real Unicode flag emoji (🇺🇸, 🇯🇵, …) for destination country identity. This is intentionally kept, not an oversight: a flag is the correct glyph for "this trip is in this country" — it's identity, not decoration, and there's no Phosphor equivalent (a generic globe/pin icon loses the information entirely). Do not "fix" this by swapping in a generic icon or adding a flag-icon library without asking first — both were considered and explicitly deferred. This is the *only* sanctioned emoji use in the app; every other Text-based emoji found during review is a bug per the rule above.

### 2. No dashed borders on actions.
Dashed = dropzone/placeholder semantics. A dashed button reads as a wireframe. Use solid fills, solid hairlines, or plain text links.

### 3. One primary action per screen.
Every screen has exactly ONE visually dominant action. Everything else is secondary (outline/tinted) or tertiary (plain text link). If three buttons look identical, the screen has no hierarchy and the design has failed.

### 4. Every empty state: icon + title + description + action.
Grey text in a box is not an empty state. It's an invitation:
- A muted icon (~26px)
- A title that names the space ("Start your first day") — never "Nothing here yet"
- One line of body copy explaining it
- The primary action

### 5. Photos lead.
Any screen about a place, trip, or post opens with imagery. A trip page with no photo header is a form, not a travel app.

### 6. Motion on every state change.
House spring: `tension: 65, friction: 11`. Sheets spring in, lists stagger, taps respond. Nothing appears instantly.

### 7. Haptics on every meaningful tap.
`Light` for navigation/selection, `Medium` for create/add/follow/destructive-confirm.

### 8. Accessibility floor.
Touch targets ≥44×44pt. Body text contrast ≥4.5:1. Icon-only buttons need `accessibilityLabel`.

---

## The palette

### Light chrome (default — all app surfaces)

Warm neutrals, NOT clinical white. The warmth is what makes it editorial rather than corporate.

| Token | Value | Use |
|---|---|---|
| Canvas | `#FBF9F5` | Page background (warm off-white) |
| Surface | `#FFFFFF` | Cards, sheets |
| Surface sunken | `#F0EAE0` | Chips, inset areas |
| Hairline | `#E5DDD2` | Dividers, borders |
| Text primary | `#1F1C19` | Headings, body (near-black, warm) |
| Text secondary | `#6B6157` | Supporting copy |
| Text muted | `#9A8F82` | Metadata, labels, captions |
| Text disabled | `#C4B8A8` | Empty-state icons, disabled |

**Primary action:** near-black `#1F1C19` with `#FBF9F5` text. Confident, not shouty. Resist the urge to make every CTA a purple gradient — that's the AI-default tell.

### The brand accent — used sparingly

The star's gradient (violet → magenta → pink) is now a **jewel against neutrals**, not wallpaper. Use it for:
- The logo/star mark
- Selected/active states (tab indicator, chosen chip)
- One hero CTA per flow at most (e.g. "Generate with AI")

Purple `#7F77DD` · Pink `#D4537E`. On light, these need enough weight to hold — use them as solid fills, not tints, when they carry an action.

### Semantic (activity types — keep the existing map)

Continue using `ACTIVITY_ICONS` from `constants/icons.ts` — blue flights, purple hotels, pink restaurants, teal activities, amber transport. On light backgrounds, use the color for the icon and a 10–12% tint of it for the icon's bubble.

### Dark — immersive moments ONLY

Dark is a *destination*, not the baseline. It earns its place where atmosphere is the point:
- The Mapbox globe / trip map
- The splash screen
- The AI-generating screen

| Token | Value |
|---|---|
| Void | `#0B0A12` |
| Elevated | `#171422` |
| Hairline | `#26232E` |
| Text primary | `#F5F3F9` |
| Text secondary | `#9C95AD` |

The **transition** between light chrome and dark immersion is a signature moment — treat it deliberately (fade/scale, never a hard cut). Dropping into the globe should feel like stepping into space.

---

## Typography

Editorial means **confident type with real hierarchy**. Two weights carry almost everything.

| Role | Size | Weight | Notes |
|---|---|---|---|
| Screen title | 26–30 | 500–600 | Tight tracking (`-0.02em`) |
| Section head | 17 | 500 | |
| Body | 15 | 400 | `lineHeight: 1.5` |
| Meta / eyebrow | 11 | 500 | Letterspaced (`0.08em`), uppercase, muted |
| Caption | 12–13 | 400 | Muted |

**The eyebrow label is the editorial signature.** Small, tracked-out, muted, above a big title — `JUL 25 – 30 · 6 DAYS` above `Trip to Pacific Beach`. This one pattern does more for the editorial feel than anything else.

**Sentence case everywhere.** Never Title Case buttons.

---

## Spacing & shape

- Screen margins: **20px** minimum. Generosity is the whole point — cramped kills editorial.
- Card radius: **16–20px**. Buttons/chips: **12px** or full pill.
- Vertical rhythm: 8 / 12 / 16 / 20 / 32.
- Hairlines are `0.5px` (or `StyleSheet.hairlineWidth`), not 1px.
- **Optical, not mathematical** — a circular icon next to text often needs 1–2px adjustment to *look* aligned.

---

## Copy voice

- Sentence case. Contractions. Active voice, verb first.
- Buttons name the verb: "Find a place", not "Submit" or "OK".
- Empty states invite, never apologize: "Start your first day", not "No activities yet".
- Errors say what happened and what to do — never a raw error string.
- Skip: "successfully", "please", "simply", "just", exclamation marks.

---

## PRE-SHIP CHECKLIST — run this on every UI change

Before you consider a UI task done, verify EVERY line. If any fails, fix it before reporting complete.

```
[ ] Zero emoji anywhere in the UI. Phosphor icons only.
[ ] Zero dashed borders on actions/buttons.
[ ] Exactly one visually dominant primary action on the screen.
[ ] Every empty state has: icon + title + description + action.
[ ] Photos lead on any place/trip/post screen.
[ ] Light chrome (#FBF9F5 canvas); dark ONLY on globe/splash/AI-generating.
[ ] Warm neutrals — no pure #FFF page backgrounds, no cool grays.
[ ] An eyebrow label (small/tracked/muted) above the main title where there's metadata.
[ ] Type hierarchy is obvious: one big title, clear secondary, muted meta.
[ ] Screen margins ≥20px. Nothing is cramped or clipped at edges.
[ ] Motion on state changes (spring: tension 65, friction 11).
[ ] Haptics: Light on nav/select, Medium on create/add/destructive.
[ ] Touch targets ≥44pt. Icon buttons have accessibilityLabel.
[ ] Colors via useTheme() — no hardcoded hex in StyleSheet.create.
[ ] Sentence case. No Title Case buttons. No "!" in system copy.
[ ] Loading = skeletons in brand style, not bare spinners.
```

**Report the checklist explicitly when completing a UI task.** If a line doesn't apply, say so — don't silently skip it.

---

## Anti-patterns — the AI-generated tells

Avoid these. They are why AI-built apps look AI-built:
- Dark navy + purple gradient on everything
- Glassmorphism/blur used decoratively rather than functionally
- Gradient on every button (gradient is for the *brand mark* and at most one hero CTA)
- Emoji as icons
- Dashed placeholder boxes shipped as real UI
- Three equal-weight buttons in a row
- Grey "No items yet" text as an empty state
- Perfectly even 16px spacing everywhere with no rhythm or emphasis
- Cards with borders AND shadows AND fills (pick one)
