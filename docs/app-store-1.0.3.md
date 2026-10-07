# App Store text for 1.0.3

> **Draft 2026-10-05**, not yet entered. Build: the next production build (1.0.3).
> Changes from 1.0.2: What's New; four description bullets (three-week AI trips;
> bookings on trip days; email import; sharing); review notes swap
> "NEW IN 1.0.2" for "NEW IN 1.0.3" (keeps them under 4,000 characters) and
> name Cloudflare and forwarded emails. **App Privacy** needs one addition — see below.

## What's New

Share any trip: send it to a friend in Supernova, or share a link that opens it. Try Supernova Pro free for a week, and redeem offer codes in the app. Pro adds email import — forward your confirmation emails to your own address and they land in your wallet, matched to the right trip and shown on its days. AI itineraries can now cover up to three weeks. Plus a fix for AI trips that showed an error even though they'd been made.

## Promotional text (unchanged)

Watch your trip come alive: every day draws itself on a 3D map, with flights that lift off and land in the next city.

## Description

```
Supernova is where you plan the trip and where you keep it.

Tell it where you're going, when, and how you like to travel. It builds a day-by-day itinerary — places to eat, things to see, and time to do nothing. Then change all of it. Drag activities into a new order, swap the museum for a swim, add the restaurant your friend swears by.

DISCOVER
• Browse destinations by region and vibe — beaches, food, culture, nightlife and more
• Each destination has itineraries from the Supernova team and other travelers, plus the places they keep coming back to
• Spin the globe to see where travelers are heading

PLAN
• Generate a full itinerary with AI from a destination, your dates and a travel style — trips of up to three weeks
• Build trips by hand instead, day by day, with flights, hotels, restaurants, activities and transport
• See every stop on a 3D map, and watch your trip fly by day by day, stop by stop

YOUR TRAVEL WALLET
• Boarding passes with a scannable code, so you're not digging through email at the gate
• Hotel, rental car and restaurant reservations in one list
• Loyalty programs with their balances, all in one place
• Bookings show up on the right days of your trip, with their confirmation numbers
• Forward confirmation emails to your own Supernova address and they land in your wallet, matched to your trip (Pro)

SHARE
• Post photos and clips from the road
• Follow travelers and save the trips you want to take
• Message someone directly about a place they've been
• Reply to comments, and double-tap a post to like it
• Make a trip public, followers-only, or keep it to yourself
• Send any trip to a friend in a message, or share a link that opens it
• Keep your account private and approve who follows you

SUPERNOVA PRO
Free accounts get one AI itinerary a month and two wallet items. Supernova Pro adds unlimited AI itineraries, including multi-city trips across several countries; plan together with friends, with a shared budget and packing list; keep every boarding pass, reservation and loyalty card in one wallet and import bookings straight from your confirmation emails; and get live alerts when your flight boards, lands or changes.

Pro is a monthly or yearly subscription, or a one-time lifetime purchase. Subscriptions renew automatically unless you cancel at least 24 hours before the current period ends. Manage or cancel in your App Store account settings. Deleting your Supernova account does not cancel a subscription.

Terms of use: https://supernova-a2125.web.app/terms
Privacy policy: https://supernova-a2125.web.app/privacy
```

## App Review notes

```
ABOUT THIS APP
A trip planner for independent travelers: it drafts a day-by-day itinerary from a destination and dates, lets you edit it, keeps bookings and boarding passes in one wallet, and lets you share trips. We do not sell travel.

DEMO ACCOUNT
Use the email and password in the Sign-In Information fields above. Profile > Trips holds an AI-generated 7-day Lisbon itinerary. You can also generate a fresh one from the Create tab; the account has consented to AI and has this month's free AI trip available.

FREE VS PRO
Free accounts can plan and share trips, use the maps, browse destinations, post, search and message. They get one AI itinerary a month (one city) and up to two wallet items entered by hand. Pro adds unlimited and multi-city AI itineraries, inviting friends to plan a trip together (shared budget and packing list), an unlimited wallet with AI import from booking confirmations, and live flight alerts. The demo account is on the free plan and already holds five wallet items from before the two-item limit existed; they remain viewable and editable, and adding another opens the paywall. Purchasing Pro in the sandbox unlocks everything immediately.

NEW IN 1.0.3
Share: the share icon on a trip sends it in Messages or as a web link. Email import (Pro): Wallet > Email import creates a personal address; forwarded booking emails become wallet items, linked to matching trips. Buy Pro in the sandbox to try it.

SIGN-IN OPTIONS
Email/password, Google and Sign in with Apple. Please use the demo account.

IN-APP PURCHASES
Supernova Pro is a monthly or yearly subscription (each with a 1-week free trial for new subscribers) or a one-time lifetime purchase, all granting the same entitlement. Offer codes redeem via "Redeem a code" on the paywall or in Settings. To reach the paywall: Settings > Subscription, or on a free account add a third wallet item or generate a second AI trip in a month. "Restore purchases" is on both paywalls and in Settings > Subscription.

USER-GENERATED CONTENT (1.2)
Posts, comments, trips, profiles and DMs are user-generated. Each has a three-dot menu with Report and Block; authors can delete their own posts, and any comment on their own posts. Reported content is hidden from the reporter immediately, and content reported by three distinct users is hidden from everyone pending review. A text filter rejects slurs and sexual content before anything is saved. Our terms (community guidelines, zero tolerance) are at https://supernova-a2125.web.app/terms, linked from the welcome screen, the paywall and Settings.

ACCOUNT DELETION (5.1.1(v))
Settings > Account > Delete account deletes the account and its content in the app. For Sign in with Apple accounts we also revoke the Apple token.

AI AND THIRD-PARTY DATA (5.1.2(i))
Itinerary generation and booking-confirmation parsing (pasted or forwarded to the user's own import address) send trip details to Google Gemini via our server, only after explicit in-app consent. The demo account has consented; to see the sheet, withdraw consent in Settings > Privacy and start a new AI trip.

AGE RATING
13+. Under-13 sign-ups are blocked by a date of birth check; the date is not stored.

LOCATION
Never requested.

SUPPORT
support@galaxielabs.space — https://supernova-a2125.web.app/support

EXTERNAL SERVICES
Firebase: auth, data, functions. Google Gemini: itineraries, server-side, consent required. Google Places: place search, details, photos. Mapbox: maps. Algolia: search. RevenueCat: subscription state over Apple IAP (Apple processes payments). AviationStack: flight status. Expo: push. Cloudflare: receives mail sent to email import addresses. Sign in with Apple, Google Sign-In: optional auth. All in the privacy policy. No ads or analytics.

REGIONAL DIFFERENCES
None; English only.

REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not regulated: a planning tool, not a travel agency.
```


## App Privacy (App Store Connect → App Privacy) — add before submitting

- **Emails or Text Messages** (User Content): collected, **linked to the user**, purpose **App Functionality**, not used for tracking. Why: email import keeps each forwarded email's subject line in the user's import log, and its bookings in their wallet. (The email body isn't stored, but the subject is.)

## Privacy policy

`hosting/privacy.html` updated (effective October 5, 2026): forwarded emails, Cloudflare as a provider, matching bookings to trips, and the public web preview of shared public trips. Deploy with `firebase deploy --only hosting` **before** submitting 1.0.3.
