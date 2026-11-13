# Trip extras: Before you go, eSIMs and trains between cities

**Status:** design approved in conversation (2026-11-12); spec for review.

## Why

The owner wants features that make a trip feel looked-after, "ultra premium", at **zero running cost**. Two of the three also earn a commission, the same way the GetYourGuide/Viator tours links do (owner: "such a great idea").

The owner's choices:
- **Partners:** Omio for trains, Airalo for eSIMs.
- **Country guide:** a **chip** that opens a sheet.
- **eSIM nudge:** a dismissible line on Home.

The other nine ideas from the same brainstorm are saved for later (they're not part of this spec).

## What the traveler gets

1. **Before you go:** a chip on the trip page beside Budget and Packing opens a sheet. The sheet has one section per international country on the trip, in trip order. Each section covers:
   - plugs and power, compared with home;
   - money;
   - tipping;
   - the emergency number;
   - the driving side;
   - tap water;
   - an eSIM link.
2. **eSIMs:** an "Get an eSIM for {country} · Airalo" row in each country's section. In the 7 days before an international trip, Home's next-trip card also shows one line: "Staying connected? eSIMs for Czechia and 4 more".
3. **Trains between cities:** on multi-city trips, each city section's **Getting here** block from the 2nd city on shows "Find trains & buses Prague → Budapest · Omio" when nothing is booked for that leg.

## Rules

### Shared rules

- **Free for everyone.** The links earn more with reach, and nothing costs us to run.
- **Upcoming and current trips only.** Past trips never show any of this, the same rule as tours (`tourCities`'s window).
- **Trip members only:** the owner and accepted collaborators (`isTripMember`). Viewers of someone else's trip don't see these. The links are affiliate offers for the people travelling, and the country guide is planning help.
- **Home region:** the phone's locale region (`expo-localization`, as `usesFahrenheit` uses it). A country is **international** when it differs from home. When the phone has no region, every trip country counts as international. Better to show the guide than hide it.
- **Trip countries:** `destination.countryCode`, then each `additionalDestinations[].countryCode`, in order. Duplicates and empty codes are dropped. Codes are upper-cased.
- **No server, no pushes, no new cost.** Links carry only place or country names, our partner tags and a `supernova-app` campaign tag. Nothing about the traveler is sent anywhere.
- **Links work before affiliate accounts exist.** The partner IDs come from build settings (`EXPO_PUBLIC_OMIO_*`, `EXPO_PUBLIC_AIRALO_*`) and are null until the owner signs up. Untagged links work but earn nothing, as with tours and Booking.com. Each partner's exact tag parameter is confirmed from its dashboard when the account exists. Until then the link is the untagged URL.

### Before you go sheet

**When the chip shows:** the trip is upcoming or current, the viewer is a member, and at least one trip country is international. Each international country gets a section, in trip order. Home-country cities are skipped.

**Country table:** a built-in table, `constants/countryInfo.ts`, keyed by ISO-3166 alpha-2. It works offline and has no runtime cost. Each entry holds:

| Field | Coverage |
|---|---|
| `name` | every country |
| `plugs` (IEC letters, e.g. `['C','F']`) | every country |
| `voltage` (e.g. 230) | every country |
| `currency` `{ code, name }` | every country |
| `emergency` (e.g. "112"; several services allowed, e.g. police / ambulance) | every country |
| `drive` (`'left'` / `'right'`) | every country |
| `tipping` (one short line) | only where confident; omitted otherwise |
| `tapWater` (`'safe'` / `'bottled'`) | only where confident; omitted otherwise |
| `airaloSlug` (Airalo's country page path) | only where Airalo sells that country |

Hard facts (plugs, voltage, currency, emergency, drive) cover every country. Judgment fields (tipping, tap water) cover at least every country in the 89-destination catalog and are left out, never guessed, elsewhere. A missing field hides its row.

**Plugs and power, compared with home:**
- Destination plugs sharing no type with home's: **"Bring an adapter — {home} plugs don't fit."**
- Some types shared: **"Your plugs fit some sockets."**
- Same set: **"Same plugs as home."**
- Voltage differs (home 100–127 V vs destination 220–240 V, or the reverse): the line adds **"{voltage} V: check your chargers say 100–240 V."**
- Unknown home: plug types and voltage only.

**Rows and actions:**
- **Emergency:** tapping the number opens the phone dialer (`tel:`).
- **Order:** plugs → money → tipping → emergency → driving → tap water → eSIM.
- **Icons:** Phosphor, no emoji.

### eSIMs

- **The row:** the country's section gets "Get an eSIM for {country name} · Airalo" when the country has an `airaloSlug`. Otherwise the row is hidden.
- **The link:** `https://www.airalo.com/{airaloSlug}`, plus the affiliate tag once it exists.
- **The Home line:** the next-trip card shows "Staying connected? eSIMs for {first international country}" plus " and N more" when there are several. Conditions:
  - the trip starts within 7 days (0–7), or is under way;
  - the viewer is a member;
  - at least one international country has an `airaloSlug`;
  - it hasn't been dismissed for this trip.
- **Tapping the line** opens the Before you go sheet for that trip, scrolled to the first country.
- **An ✕** hides the line for that trip. It's remembered on the phone (`esimLineDismissed:{tripId}`), like the wish-list nudge.

### Trains between cities

**Where:** a multi-city trip's `CitySection` for city index ≥ 1. City 0's "Getting here" is from home and gets no train link.

**When the link shows:**
- the trip is upcoming or current and the viewer is a member;
- that city's **Getting here** is empty, meaning no booking for the leg from the traveler's or a companion's wallet (`cityBookings`);
- both cities have coordinates;
- the straight-line distance is **≤ 800 km**. Farther legs are flight territory, and a train link there would be noise.

**The link:** "Find trains & buses {previous city} → {this city} · Omio".
- **Both cities in the Omio ID table** (`constants/omioCities.ts`): `https://www.omio.com/?departure_fk={id}&arrival_fk={id}`, plus the affiliate tag.
- **Otherwise:** Omio's home page, plus the affiliate tag. The traveler types the cities.
- **No dates are sent:** dateless deep links are Omio's recommended form, and the traveler picks the date.

**The Omio city ID table** starts **empty**. It's filled from Omio's "Deep link Creator" file once the owner has the affiliate account, starting with the 89 catalog destinations. City matching is by name, case and accent folded, plus the catalog slug.

**When something is booked:** the link disappears and the booking shows as today.

## Built from

All of it is pure and unit-tested, except the three UI pieces.

**Rules:**
- `utils/beforeYouGo.ts`: `tripCountries(trip)`, `internationalCountries(countries, home)`, `plugAdvice(home, dest)`, `countrySection(code, home)`, `showBeforeYouGo(trip, today, isMember, home)`.
- `utils/esim.ts`: `airaloUrl(code, ids)`, `esimHomeLine(trip, today, isMember, home, dismissed)`.
- `utils/trainLinks.ts`: `trainLink(prev, city, gettingHereCount, ids)`, which returns `{ label, url } | null`; plus `omioUrl(from, to, ids)` and `omioCityId(name)`.
- `utils/homeRegion.ts`: the phone's region, null when unknown. It reuses what `usesFahrenheit` reads, if that's already factored out.

**Data:**
- `constants/countryInfo.ts`: the country table. Its shape and coverage are checked in tests: every entry has the hard facts; catalog countries have tipping and tap water.
- `constants/omioCities.ts`: the city ID table, starting empty.

**UI:**
- `components/trip/BeforeYouGoSheet.tsx`.
- The chip on `app/trip/[id].tsx`, beside Budget and Packing.
- The link in `components/trip/CitySection.tsx`'s Getting here.
- The line on Home's next-trip card.

**Settings:** affiliate IDs come from build settings (`partnerIdsFromEnv` gains the Omio and Airalo fields). They're documented in CLAUDE.md's environment table as optional.

## Out of scope

- Live exchange rates.
- Visa and entry rules. They change and carry liability; at most a link out, later.
- Pushes.
- Prices inside the app.
- Any server change.
- The nine saved ideas.

## Edge cases

- **Domestic-only trip:** no chip, no eSIM line, but train links still show. Trains matter at home too, e.g. Rome → Florence for an Italian traveler.
- **Unknown country code, or a country missing from the table:** that country's section shows its name only, plus the eSIM row if possible. A trip whose countries are all unknown shows no chip.
- **A country visited twice:** one section only.
- **Trip with no dates:** treat as upcoming, the same as tours' rule. No eSIM line, since there's no start to count down to.
- **Viewer not a member:** none of the three shows.
- **Offline:** the sheet works fully. Links just fail to open, and the OS says so.

## Release

- **App build:** everything is app code, so it needs a store build. Nothing on the server changes.
- **Privacy policy:** names Omio and Airalo next to GetYourGuide and Viator (links only). That's a Hosting deploy, the owner's.
- **Affiliate accounts:** the owner signs up with Omio (e.g. via Travelpayouts) and Airalo, then adds the IDs to the build settings, and the Omio city IDs to `constants/omioCities.ts`. This can happen after release, since links work untagged.
