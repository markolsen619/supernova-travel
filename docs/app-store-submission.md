# App Store submission — Supernova Travel

Live status of the 1.0 submission. **App ID `6810490710`**, bundle
`com.supernovatravel.app`, team **Galaxie Labs LLC**.

Last audited in both dashboards on **2026-09-22**.

---

## What is done

### App Store Connect

| Section | State |
|---|---|
| App record, name, subtitle, categories (Travel / Lifestyle) | done |
| Content rights, Digital Services Act trader status | done |
| Age rating — 13+ (16+ in 2 regions, A16 Brazil, 15+ Korea) | done, incl. the new social-media questions (UGC **yes**, Social Media **yes**) |
| Paid Applications Agreement | **Active**, Sep 9 2026 – Aug 18 2027, bank + W-9 active |
| Pricing | **Free**, 175 countries |
| Availability | all countries, on release |
| Mac / Vision Pro availability | **off** — iPhone and iPad only for 1.0 |
| Privacy Policy URL | `https://supernova-a2125.web.app/privacy` |
| **App Privacy** | **published** — 8 data types, all *App Functionality*, all linked to identity, **none used for tracking** |
| Description, keywords, promotional text, support URL, copyright | done |
| App Review notes | done |
| App Store Server Notifications | both prod and sandbox point at RevenueCat |
| Subscription group `Supernova Pro` | Ready for Review, added to the draft submission |
| `…pro.monthly`, `…pro.yearly`, `…pro.lifetime` | all **Ready to Submit**, priced, localized, review screenshots attached |

The App Privacy declaration was derived from the code, not guessed:

- **Collected:** Name, Email Address, Emails or Text Messages (DMs), Photos or
  Videos, Other User Content, Search History, User ID, Purchase History.
- **Not collected:** device location (`expo-location` is not a dependency —
  it appears only in a comment in `services/mapLighting.ts`), usage/analytics
  (Firebase Analytics is never initialized), diagnostics (no Sentry or
  Crashlytics), Device ID (no ad or attribution SDK, no ATT prompt), and date
  of birth (used for the 13+ gate in local state only — `buildUserProfile()`
  never writes it).

Re-run those checks before changing the declaration; adding an analytics or
crash SDK makes it wrong.

### RevenueCat

Everything in `docs/revenuecat-setup.md` Phases 0–4 is verified. The one thing
that had never been proven — that RevenueCat's copy of the webhook
`Authorization` header matches the deployed secret — now is: the dashboard's
*Send test event* returned **200**, with no `rejected unauthorized webhook call`
in `functions:log`.

### Hosting

`hosting/support.html` was added and deployed. All three pages return 200:

- `https://supernova-a2125.web.app/support` (new — the App Store Support URL)
- `https://supernova-a2125.web.app/terms`
- `https://supernova-a2125.web.app/privacy`

---

## What is left

### ~~1. Screenshots~~ — DONE

**6 uploaded to the iPhone 6.9" slot and 6 to the iPad 13" slot**, verified
persisted through a reload. App Store Connect auto-reuses them for the smaller
slots — the iPhone 6.5" row reads "Using 6.9" Display" and the iPad dialog
confirms the 13" set covers every iPad size — so nothing else needs filling.

Captured from the simulators at exactly the accepted sizes: iPhone 15 Pro Max
**1290x2796**, iPad Pro 12.9" **2048x2732**.

Shot list (iPhone order; the first three show on the install sheet):

1. Lisbon itinerary — hero photo, `OCT 15 - OCT 21 · 7 DAYS` eyebrow, typed activities
2. AI trip generator — Kyoto selected, country auto-filled from Places
3. Travel wallet — boarding pass, reservations, loyalty
4. Mapbox globe — the dark immersive moment
5. Explore — two destinations, two trips
6. Feed

The iPad set holds the same six but ordered AI-generator first; drag the
itinerary to slot 1 in Media Manager if you want it to match the iPhone. The
drag-to-reorder worked for iPhone and would not take for iPad.

**How the capture ran** (repeatable — see `ios-local-verification` memory):
`scratchpad/idbw` wraps `idb` so its CLI works on Python 3.14, and
`scratchpad/tree.sh` dumps the accessibility tree as `label (x,y)` in points.
Screenshots are pixels, points are 1/2 or 1/3 of that; tap using the tree's
frame centres, not screenshot coordinates.

### 2. No production build has ever been made

Every EAS build so far is `development`. Nothing has been uploaded to App Store
Connect, which is why the Build section of the version page is empty.

```bash
npx eas-cli build --profile production --platform ios
```

`eas.json` has **no iOS `submit` block**, so `eas submit --platform ios` will
stop and ask for `ascAppId`, `appleId` and `appleTeamId`. `ascAppId` is
**6810490710**. Adding it to `eas.json` saves answering the prompt every time.

### ~~3. App Review sign-in credentials~~ — DONE

Sign-in username, password, and the full contact block (name, phone, email)
are saved on the version page.

The password was reset on **2026-09-22T23:41:08Z** (`passwordUpdatedAt` and
`validSince` both moved off the 2026-09-17 creation timestamp, confirming the
write landed). Completing the Firebase reset link also flipped `emailVerified`
to **true**, since clicking it proves control of the mailbox.

Two notes for next time:

- The Firebase Console has **no "Edit user"** option — the row's ⋮ menu offers
  only Reset password / Disable account / Delete account, and clicking the row
  does nothing. There is no way to set a password directly in the console; it
  can only mail a reset link. Setting one directly requires the Admin SDK and a
  service-account key.
- `appreview@galaxielabs.space` had no mailbox, so the reset mail had nowhere
  to go. It is now an **alias on `mark@galaxielabs.space`** (the domain runs on
  Microsoft 365). Keep that alias — without it this account cannot be recovered
  by any console route.

**Still worth doing:** `lastLoginAt` is still the 2026-09-17 creation
timestamp, so the new password has been *set* but never *used*. Prove it before
Apple does:

```bash
read -rs -p "password: " PW; echo
curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=$(grep EXPO_PUBLIC_FIREBASE_API_KEY .env.local | cut -d= -f2)" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"appreview@galaxielabs.space\",\"password\":\"$PW\",\"returnSecureToken\":true}" \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('OK' if 'idToken' in d else d.get('error',{}).get('message','?'))"
unset PW
```

### 4. The sandbox purchase walk-through

`docs/revenuecat-setup.md` Phase 5. Still the one thing that has never been
exercised end to end: no real purchase event has ever reached `syncTier`. Do it
on the production or preview build, not in Expo Go.

### 5. Add everything to the one submission

The draft submission currently holds **only** the `Supernova Pro` subscription
group, and says *Unable to Submit for Review* because a new subscription group
must go up together with an app version. Once the build and screenshots are in,
add the app version **and** the Lifetime non-consumable (App Store Connect also
requires a first non-consumable to ship with a version) to the same submission.

---

## Fixed on 2026-09-22

### The Travel Wallet was broken for every user

`useBoardingPasses`, `useReservations` and `useLoyaltyPrograms` each run an
equality filter on `ownerUid` plus an `orderBy` on a different field
(`departureTime`, `checkIn`, `programName`). Every one of those needs a
composite index, and **none of the three was declared** in
`firestore.indexes.json`. Firestore answers `FAILED_PRECONDITION`, the query
throws, and the screen never renders its list.

It stayed invisible because all three collections were empty — the bug only
becomes reachable the moment somebody adds their first wallet item, which is
exactly what App Review would have done. The three indexes are now declared,
deployed, and **verified `READY`**: each hook's exact query was re-run against
the seeded data and returns correctly ordered results.

**When adding a wallet-style query, declare the index in the same change.** A
`where(...)` plus an `orderBy(...)` on a different field always needs one, and
an empty collection will not warn you.

Two indexes exist in the project that are *not* in `firestore.indexes.json` — a
`posts` index on `authorId` (note: not `authorUid`) and a `conversations` index
on `participants` + `lastMessageAt`. Both look like leftovers from renamed
collections/fields. `firebase deploy --only firestore:indexes --force` would
delete them; that was deliberately not run.

### The hosted paywall had never existed

The `default` offering had no paywall attached, so `presentPaywallIfNeeded()`
threw and every quota interception silently took the `/paywall` fallback. A
components-based paywall, **"Supernova Pro — limit interception"**, is now
published and attached. Its template shipped with `https://example.com` on the
Terms and Privacy buttons; both now point at the real hosted pages. See
`docs/revenuecat-setup.md`.

### Demo account content

The account had one **private** trip, an empty wallet and no follows, against a
database holding one post and one public trip in total. Seeded so each tab has
real content:

- Lisbon trip flipped to **public** (`syncTripToAlgolia` fired, so it is in the
  Algolia index and appears in Explore and Search).
- Boarding pass: TAP Air Portugal TP204, JFK → LIS, 2026-10-14, with a
  scannable PDF417 barcode.
- Reservations: Memmo Alfama Hotel (Oct 15–21) and Taberna Sal Grosso.
- Loyalty: TAP Miles&Go (42,150 miles, silver) and Marriott Bonvoy (68,400
  points, gold).

Everything hangs together with the Lisbon itinerary, so the wallet reads as one
real trip rather than filler.

**Not done:** making the demo account follow `fatwalrus`. That write also
mutates the main account's `followersCount`, and it was blocked. Do it from
inside the app if you want a non-zero following count — it is cosmetic.

**Note for the flight-status function:** `checkFlightStatus` runs every 30
minutes over upcoming boarding passes, so it will now start calling
AviationStack for TP204. That is the intended path, but it is the first real
row that scheduler has ever had.

---

## Calendar dates vs instants

A check-in, a check-out and a loyalty expiry are **calendar dates**: 15 October
is the same day in Lisbon and San Diego. They used to be stored as instants and
rendered with `new Date(value).toLocaleDateString(...)`, which converts to the
device's timezone — so anywhere behind UTC they displayed a day early. The
worst case was AI import: `parseTravelConfirmation` asked Gemini for
`"2026-08-15T00:00:00.000Z"`, so every imported reservation was wrong across
the Americas, on a feature sold as one of three Pro benefits.

Fixed 2026-09-23. `utils/calendarDate.ts` is now the only way these fields are
read or written:

- stored as `YYYY-MM-DD` — no time, no timezone
- `toCalendarDate(date)` writes the **local** calendar day (not
  `toISOString().slice(0, 10)`, which would record tomorrow during an American
  evening)
- `parseCalendarDate` / `formatCalendarDate` also accept the old full-ISO rows
  and read their UTC calendar day, so legacy data renders correctly without a
  migration

The four seeded rows were migrated to `YYYY-MM-DD` anyway, so the database
holds one shape. `orderBy('checkIn')` still sorts correctly — ISO dates sort
lexicographically.

**A flight's `departureTime`/`arrivalTime` stay full timestamps.** A departure
really does happen at one instant worldwide; only calendar dates changed.

Verified on an iPad in PDT: a `2026-10-16T00:00:00.000Z` row — the exact shape
Gemini used to emit — now renders "Oct 16, 2026" where it previously showed
Oct 15.

### Still outstanding: trip dates

`Trip.startDate`/`endDate` are Firestore `Timestamp`s written from a local
`Date` and rendered with `toDate().toLocaleDateString(...)`. Same class of
problem, but it only misreads if the user changes timezone between creating and
viewing a trip, and the fix touches seven components (`TripCard`,
`trip/[id]`, `DayTimeline`, `DayPickerSheet`, `EditTripSheet`,
`TripRecapSheet`, `post/create-trip`). Left alone deliberately — it is a
travel-day-only bug, not a wrong-on-arrival one.

## Decisions taken, worth revisiting

- **Release is set to "Automatically release this version"** after approval.
  Switch to manual on the version page if you want to control launch timing.
- **Subtitle is now "Plan the trip, keep the trip"** (28/30 chars), replacing
  "Social Travel/AI Itineraries". It deliberately echoes the first line of the
  description. The search terms it gave up are all still carried by the
  keywords field, which doesn't duplicate them.
- **Marketing URL is deliberately blank.** It's optional and there's no
  marketing site; a link to nothing is worse than no link.
- **Mac and Vision Pro availability turned off.** Both default to on. The app
  uses Mapbox, the camera and push notifications, none verified on macOS or
  visionOS, and App Review does test the platforms you opt into.
