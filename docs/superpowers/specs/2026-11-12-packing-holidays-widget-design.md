# Smart packing, holidays and the Home Screen widget

**Status:** design approved in conversation (2026-11-12); spec for review.

## Why

Same brief as trip extras: make the app feel looked-after at little or no running cost. The owner picked:
- the smart packing list;
- holidays and closures;
- a Home Screen widget with the most important info ("a huge win for us").

Golden hour and the jet lag plan stay in the backlog. The work comes in two parts:
- **Part 1** (packing and holidays) is app code only.
- **Part 2** (the widget) is native and needs a store build plus device testing.

Part 1 can ship without Part 2.

## Part 1A: smart packing suggestions

**Today:** `hooks/usePackingList.ts` fills an empty list once, for the owner, from `services/packingTemplates.ts`. That's keyword and month rules, with no forecast and a Northern-hemisphere season.

**What changes:**
- **A "Suggested for this trip" section** at the top of the packing screen (`app/trip/packing.tsx`), for members. Each suggestion shows its reason in muted text and a **+** that adds it to the list as an ordinary item (`isCustom: false`). An **✕** dismisses it.
- **No repeats:** a suggestion whose label is already on the list (case-insensitive) isn't shown. Dismissed ones are remembered on the phone (`packingDismissed:{tripId}`). The packing list is shared with members, and dismissals are a personal preference.
- **A brand-new list** is seeded with the existing templates plus the suggestions, so a new trip starts smarter. Existing lists are never rewritten.

**Rules** (pure `utils/packingSuggestions.ts`; rule-based, no AI):

| Signal | Suggests (reason shown) |
|---|---|
| Forecast within ~9 days (MET Norway, already used for day weather): rain or showers on ≥ 2 trip days | Umbrella or rain jacket ("Rain on 3 days") |
| Forecast: any high ≥ 28° | Sunscreen, sun hat ("Highs of 31°") |
| Forecast: any low ≤ 5° | Warm coat, gloves ("Lows of 2°") |
| No forecast yet: season from the trip's dates and the **hemisphere** of each city (latitude < 0 flips it) | Warm layers (winter), sunscreen (summer) ("Winter in Buenos Aires") |
| A stop titled or typed like a hike or trail (hike, trail, trek, hiking, summit, national park) | Walking shoes, water bottle ("Hike on day 4") |
| A beach stop (beach, playa, praia, plage, snorkel) | Swimsuit, beach towel |
| A fine-dining stop (Michelin, tasting menu, fine dining) | Smart outfit |
| An international trip (trip extras' `internationalCountries`, phone's home region) | Passport |
| Destination plugs differ from home (`plugAdvice`'s rule) | "Plug adapter (type C / E)" |
| 7+ days | Laundry bag |

Suggestions are de-duplicated and capped at 8, ordered as in the table.

## Part 1B: holidays and closures

**What the traveler sees:**
- **On a trip day:** a day that falls on a **nationwide public holiday** in that day's country gets a line under its heading: **"Public holiday: {English name} · many shops and museums may close"**. Uses a calendar icon, Phosphor.
- **On Home:** the Today card shows the same line on the day itself.
- **Who:** anyone who can see the trip. It's harmless public information.

**Rules** (pure `utils/holidays.ts`):
- **A day's country:** the country of its city (`destinationIndex` → that destination's `countryCode`), else the trip's first country.
- **A day's date:** the trip's first day + (day number − 1), the same calendar rule the trip page already uses.
- **What counts:** Nager.Date entries with `global: true` and type `Public`. Regional holidays are ignored.
- **Undated trips:** no holiday lines.

**Data** (`services/holidays.ts`):
- **Source:** Nager.Date's free public API (`https://date.nager.at/api/v3/PublicHolidays/{year}/{CC}`): no key, open-source data, 204 countries.
- **Fetching:** the phone fetches each needed country and year **once**, for the trip's countries and years, then keeps it in AsyncStorage (`holidays:{CC}:{year}`). Holidays don't change, so it's refreshed after 90 days.
- **Failures:** a failed or unavailable fetch shows nothing and retries next time. Holidays never block the screen.
- **Privacy:** only the country code and year are sent. Nager.Date is credited in Settings → About and named in the privacy policy.

## Part 2: the Home Screen widget

**What it shows.** The widget adapts to the moment:

| Moment (first match wins) | Small | Medium |
|---|---|---|
| **Flight day:** a boarding pass departing within 6 h (not cancelled, not landed) | Flight number, departure time (airport clock) | + route, gate, status line (Pro data when available) |
| **During a trip** | "DAY 3 · PRAGUE" + next stop's name and time | + the stop after, today's weather |
| **Trip ahead** | "6 DAYS" + trip title | + cover photo, dates |
| **Nothing ahead** | "Plan your next trip" | + top wish-list city when there is one |

**Next stop rules:** "next" is the first of today's stops (in order) whose time is still ahead. Untimed stops count in order after the last passed timed stop. With no times at all, it's the first unvisited stop. When today's stops are done, the medium widget shows "Tomorrow: {first stop}".

**Taps:**
- flight → the boarding pass;
- trip → the trip;
- nothing ahead → Create.

These go through the app's existing deep links.

**Free for everyone.** Pro-only data (live gate and status) appears only when the app already has it.

**How it stays current:**
- **The snapshot** (pure `utils/widgetSnapshot.ts`): the app writes a small snapshot whenever it opens, comes to the foreground, or a trip or boarding pass changes. It holds the next trip, today's and tomorrow's stops with times, today's flight, the weather and the top wish-list city, using only data already on the phone.
- **The timeline:** from the snapshot, `widgetTimeline(snapshot, now)` precomputes **entries** for the next 48 h: one per state change (each stop's time passing, midnight, the flight window opening or closing). Each entry holds the exact text to draw. The same pure function drives both platforms, so the widget logic is unit-tested once.
- **iPhone:** a WidgetKit extension added with `@bacons/apple-targets` (Swift in `targets/widget/`, committed). It reads the entries from an **App Group** shared store, written by a small local Expo module (`modules/widget-bridge`: write JSON + `WidgetCenter.reloadAllTimelines()`). It gives WidgetKit those entries as its timeline.
- **Android:** `react-native-android-widget`. Its widget task renders the current entry from the same stored entries, refreshing on its minimum interval (30 min) plus whenever the app writes.
- **The cover photo** is saved into the shared store when the snapshot is written: the key-less photo URL, downloaded once. Without it, the trip's colour is the background.
- **No network from the widget, nothing sent anywhere, no server cost.**

**Risks and their handling:**
- **The App Group is a new iOS capability.** The first iOS build may need the owner to run `npx eas-cli build -p ios` interactively once, to sync the provisioning profile, as with the share extension.
- **Device testing:** the plan budgets one or two iOS test builds. Android's widget can be checked on the internal track.
- **Library compatibility** with the project's Expo SDK (54) is the plan's first task. If a library doesn't fit, the spec's behaviour stands and the plan picks the closest maintained alternative, as a ruling.

## Out of scope

- Golden hour and the jet lag plan (backlog).
- Lock Screen widgets.
- Interactive widget buttons.
- Large widget sizes.
- Regional holidays.
- Opening hours of specific places on holidays.

## Testing

Pure tests:
- `packingSuggestions`: each rule; hemisphere; de-duplication against the list; the cap.
- `holidays`: parse, global-only, day → country/date mapping, undated trips.
- `widgetSnapshot` / `widgetTimeline`: each state, next-stop rules, midnight, flight window edges.

Native and UI pieces are checked on devices.

## Release

- **Part 1:** app code only, so the next store build.
- **Part 2:** a store build with new native code and a `version` bump (OTA updates can't carry it).
- **Privacy policy:** a line naming Nager.Date (country and year only). That's a Hosting deploy, the owner's.
