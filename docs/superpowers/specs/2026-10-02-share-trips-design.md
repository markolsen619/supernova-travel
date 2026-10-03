# Share a trip — in a message, or as a link

Status: approved in conversation 2026-10-02 · Target: 1.0.3

## Intent

Send a trip — your own, a friend's, or a Supernova pick — to someone without
either of you joining it. Two ways, from one **Share** button on every trip
page:

1. **Send in Supernova**: to people you can message (mutual follows), as a
   trip card in the chat.
2. **Share outside**: the iPhone share sheet with a web link. Someone with
   the app lands on the trip; anyone else sees a preview page with an App
   Store button.

Nothing about membership changes. Viewing the shared trip follows the existing
visibility rules.

## Who can share what

Pure rule `canShareTrip(trip, viewerUid)`:

- **Private** trip: no Share button (nobody else could open it).
- **Followers-only** and **public**: shareable by anyone who can see it. A
  recipient who can't view a followers-only trip gets the existing
  unavailable screen, never the itinerary.
- A trip hidden by moderation (`moderationHidden`): not shareable.

## 1. Trip cards in messages

**Message shape** (`dmThreads/{id}/messages/{id}`), new optional field:

```
trip: { tripId, title, coverImageUrl | null, placeLabel, dateRange | null }
```

A snapshot for rendering the card without a read; tapping opens `/trip/{id}`,
where rules decide.

**Old apps.** 1.0.2 and earlier only read `text`, so a trip message always
carries text too. With a note, the text is the note. Without one, it's
`Shared a trip: {title} — supernova-a2125.web.app/trip/{id}`, so an old app
still shows something meaningful (and a link). New apps render the card, plus
the note only when the sender wrote one (`trip.note: boolean` marks it).

**Rules.** The message create rule keeps `text` required and its size limit,
and allows an optional `trip` map with exactly the keys above (string sizes
capped), and `tripId` a string. Push and the thread preview reuse `text`
unchanged (`onMessageCreated`).

**Send sheet.** Share → "Send in Supernova" opens a sheet:
- your existing conversations first (most recent), then mutual friends without
  a thread yet (the `createDmThread` callable makes one);
- multi-select, an optional note field, **Send**;
- each recipient gets their own message; haptic Medium; toast-style
  confirmation "Sent to 2 people".

## 2. Share link

**URL**: `https://supernova-a2125.web.app/trip/{tripId}` — the same path as the
app's route, so Expo Router opens `app/trip/[id]` from a universal link with
no extra mapping.

**Universal links** (needs a new build):
- `app.json` → `ios.associatedDomains: ["applinks:supernova-a2125.web.app"]`
- Hosting serves `/.well-known/apple-app-site-association` (JSON, no
  extension, `appID: <TeamID>.com.supernovatravel.app`, paths `/trip/*`).

**Preview page** — Hosting rewrite `/trip/**` → Cloud Function `tripPreview`
(onRequest):
- Public trip by a public account, not moderation-hidden: HTML with the cover,
  title, `PARIS · 5 DAYS` eyebrow, author, first few stops, **Open in
  Supernova** (`supernova://trip/{id}`) and **Get the app** (App Store link).
  Open Graph / Twitter tags so iMessage and WhatsApp show a rich preview.
- Anything else (followers-only, private, missing): a generic Supernova page
  with the same two buttons and no trip details — the page must never leak
  what the app's rules would hide.
- Every value HTML-escaped; `Cache-Control: public, max-age=300`.
- Light editorial styling matching the app (canvas `#FBF9F5`, near-black CTA).

**Share sheet** text: `{title} on Supernova` + the URL.

## Error handling

Card for a deleted trip → the trip screen's not-found state. Failed send →
inline error on the sheet, nothing half-sent is retried silently. Preview
function errors → the generic page (200), never a stack trace.

## Testing (pure, Jest)

`canShareTrip`, `tripShareUrl`, `tripMessagePayload` (text fallback, note
flag, snapshot fields), `previewEligibility` (public + public author + not
hidden), `renderTripPreview` (escaping, OG tags, generic page shape),
`shareRecipients` (threads first, then friends without a thread, no
duplicates, blocked users excluded).

## Out of scope

Group threads; sharing posts the same way; Android App Links; a "copy this
trip into my trips" action (Plan my trip here already covers it for
destinations).
