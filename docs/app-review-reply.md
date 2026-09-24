# App Review reply — Guideline 2.1, Information Needed

Apple's 2026-09-23 message on the 1.0 submission. Not a content rejection:
the standard request sent to a developer account with **limited App Review
history**. Six items, all to be pasted into the Resolution Center reply **and**
into App Review Information → **Notes**, which Apple says it reads on future
submissions.

Items 2–6 are written out below, ready to paste. Item 1 is a screen recording
only Mark can make.

> **Record on build 3, never build 2.** Apple asks the recording to show
> "accessing paid content or features". Build 2 charges an email-signup user
> and leaves them on the free tier (see the RevenueCat uid-binding fix) — that
> segment would show the paywall failing.

---

## 1. Screen recording — shot list

One continuous take on a physical iPhone, latest iOS, starting from the Home
Screen. Roughly 4–6 minutes. Apple names four things it must contain; the
order below gets all of them with no backtracking.

| # | Segment | What to show |
|---|---|---|
| 1 | **Launch** | Tap the icon from the Home Screen. Let the splash finish. |
| 2 | **Registration** | Welcome → Create account. Fill name, username (wait for the availability tick), email, password, birthday. Submit. Let the 5 onboarding slides play. |
| 3 | **Typical use** | Feed. Open a post. Open Explore. Open the globe and spin it, tap a destination. |
| 4 | **Core feature** | Create → Generate with AI. **Accept the AI consent sheet on camera** — it is the 5.1.2(i) disclosure. Show the generated itinerary, open a day, edit an activity. |
| 5 | **Travel wallet** | Profile → Wallet. Show a boarding pass, a reservation, a loyalty card. |
| 6 | **UGC + moderation** | On someone else's post, tap ⋯ → **Report**, pick a reason, confirm, show it disappear. Then ⋯ → **Block** on another. Settings → Blocked → show the list and unblock. |
| 7 | **Paid features** | Open the paywall. Show the three prices and the legal links. Complete a **sandbox purchase**. Return and show a Pro-only feature working. |
| 8 | **Login** | Settings → Sign out. Sign back in with the same account. |
| 9 | **Account deletion** | Settings → Account → Delete account. Show the warning, confirm, land back on Welcome. |

Segment 9 destroys the account, so it goes last. Use a throwaway account, not
`appreview@` — the reviewer needs that one to keep working.

---

## 2. Purpose and target audience

> **Purpose.** Supernova Travel is a trip planning app. It generates a
> day-by-day itinerary from a destination and a set of dates, lets the traveler
> edit it activity by activity, stores their boarding passes, hotel and rental
> reservations and loyalty program balances in one wallet, and lets them share
> finished trips with people who follow them.
>
> **Target audience.** Independent leisure travelers who plan their own trips
> rather than booking a package — the people currently doing this across a
> notes app, a dozen confirmation emails, screenshots of boarding passes and
> twenty browser tabs.
>
> **The problem it solves.** Trip planning is scattered. The itinerary lives in
> one place, the documents in another, and the inspiration in a third. Nothing
> reconciles them, so travelers arrive with a folder of screenshots and no plan
> for Tuesday.
>
> **The value it provides.** A realistic first-draft itinerary in about a
> minute, which is the hardest part to start and the easiest to edit once it
> exists. Then one place that holds the plan and the paperwork together, so the
> answer to "what are we doing today and where is the confirmation" is one app,
> offline-tolerant, on the phone already in their hand.

## 3. Setup and access instructions

> No setup, sample files or special configuration are required. The app is
> usable immediately after creating an account.
>
> **Demo account** (also in the Sign-In Information fields):
> Username: `appreview@galaxielabs.space`
> Password: *(as entered in App Review Information)*
>
> There is only one account type — every account has identical capabilities,
> differing only by subscription state. The demo account is already populated
> with trips, posts, boarding passes, reservations and loyalty cards.
>
> **Where each feature lives:**
> - **Feed** — first tab. Posts from across the app.
> - **Explore** — second tab. Trending public trips and suggested travelers.
> - **Create (+)** — centre tab. "Generate with AI" and manual trip creation.
> - **Globe** — fourth tab. Interactive map; tap anywhere for nearby places.
> - **Profile** — fifth tab. Trips, posts, saved trips, and **Wallet**.
> - **Travel wallet** — Profile → Wallet. Boarding passes, reservations,
>   loyalty programs.
> - **Subscription** — the paywall opens from Profile → Supernova Pro, and
>   automatically when a free-tier AI generation limit is reached.
> - **Report / block** — the ⋯ button on any post, comment, trip or message
>   from another user. Blocked users are managed in Settings → Blocked.
> - **Account deletion** — Settings → Account → Delete account. Permanent and
>   in-app, per guideline 5.1.1(v).
> - **AI consent** — requested in-app before anything is sent to the AI
>   provider, and withdrawable in Settings → Privacy.
>
> **Free vs Pro.** Free accounts generate one AI itinerary per week. Pro
> removes that limit and adds flight status notifications for saved boarding
> passes. Everything else — trips, wallet, feed, globe, search, messaging — is
> available on the free tier.

## 4. External services

> - **Firebase** (Google) — authentication, database, file storage, and the
>   server functions that run all privileged logic.
> - **Google Gemini** — generates the draft itinerary. Called only from the
>   server, never from the device, and refused unless the user has accepted the
>   in-app AI consent disclosure.
> - **Google Places** — place search, place details, and place photography.
> - **Mapbox** — the interactive globe and the per-trip maps.
> - **Algolia** — the search index for public trips and user profiles.
> - **RevenueCat** — subscription state management on top of Apple In-App
>   Purchase. It does not process payments; Apple does.
> - **AviationStack** — flight status for saved boarding passes.
> - **Expo push notification service** — delivery of push notifications.
> - **Sign in with Apple** and **Google Sign-In** — optional authentication,
>   alongside email and password.
>
> Every one of these is named in the privacy policy at
> https://supernova-a2125.web.app/privacy. There is no payment processor other
> than Apple, and no advertising or analytics SDK in the app.

## 5. Regional differences

> There are none. The app offers identical features and identical content in
> every region where it is available, in English only. No feature, screen or
> piece of content is gated, altered or withheld by country, and there is no
> region-specific logic anywhere in the codebase. Subscription prices follow
> Apple's standard regional price equivalents for the tiers selected in App
> Store Connect.

## 6. Regulated industry / protected material

> Supernova Travel does not operate in a regulated industry. It does not sell
> travel, process bookings, take payment for third-party services, or act as a
> travel agency — it is a planning and organisation tool. All payments are
> Apple In-App Purchases for the app's own subscription.
>
> It includes no protected third-party material. Third-party data is licensed
> and used within the providers' terms: flight status from AviationStack, place
> data and photography from Google Places, map tiles from Mapbox.
>
> Travel content — trips, posts, comments, messages — is created by users. Per
> guideline 1.2 the app includes a content filter applied before anything is
> saved, in-app reporting on every piece of user content, user blocking, an
> automatic hide at three distinct reports, and a published acceptable-use
> policy in the terms at https://supernova-a2125.web.app/terms.

---

## Order of operations

1. Merge `fix/revenuecat-uid-binding` — the purchase bug must not be in the
   build the reviewer tests, and must not be in the recording.
2. `eas build --profile production --platform ios` → `eas submit`.
3. Verify the sandbox purchase on build 3: sign up with email, buy Pro,
   confirm `users/{uid}.tier` becomes `pro` in Firestore.
4. Record item 1 on build 3.
5. Paste items 2–6 into App Review Information → **Notes**.
6. Reply in the Resolution Center with items 1–6 and the video.
7. Confirm all five submission items (app version, subscription group, three
   IAPs) are attached before resubmitting.
