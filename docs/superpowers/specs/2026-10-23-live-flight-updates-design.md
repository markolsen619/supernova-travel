# Live flight updates — gate/delay alerts and live Apple Wallet passes — design

Date: 2026-10-23 · Status: approved in conversation · Follows the Apple Wallet pass (spec 2026-10-22)

## Why

The owner asked: once a pass is in Apple Wallet, if the gate changes, does the user get told and does the pass update? Today, no:

- `checkFlightStatus` only reacts to `landed` / `active` / `cancelled`, ignores gate and delay, and **stops polling at departure** (`departureTime >= now`), so "landed" and "boarding" (`active` = airborne) can never fire; only pre-departure cancellations do.
- The Wallet pass is static.
- `app/notification-intro.tsx` promises "Gate changes, delays and boarding, as they happen (Pro)".

## Decisions (owner, 2026-10-23)

- **Stay on AviationStack's free plan (100 calls/month)** for now. Polling is designed around that; adding checks later is a constant change.
- Live gate/delay data stays **Pro only** (as now). Wallet passes update for **everyone** when they edit a pass in the app.
- Build all three parts together, before the 1.0.8 build.

## 1. Checks that fit the free plan (`flightPolling.ts`, `checkFlightStatus.ts`)

- Three checkpoints per flight, relative to its times: **T−120 min**, **T−45 min** (scheduled departure), **arrival + 30 min** (only when `arrivalTime` is known). ≈ 3 calls per flight → ≈ 33 Pro flights/month.
- Pure `dueCheckpoint(departureMs, arrivalMs | null, nowMs, runMinutes = 30)` → the checkpoint whose time falls in `(now − 30 min, now]`, else null. Deterministic from the clock: no extra writes; a missed run skips that checkpoint.
- Query widens to passes with `status in ['upcoming', 'boarded']` and `departureTime` between **now − 20 h and now + 3 h** (arrival checks happen after departure). Composite index if needed.
- Free owners are dropped before any call, one call per real flight (`groupPassesByFlight`) — unchanged.
- AviationStack reports the free-plan limit as an error body (`usage_limit_reached` / HTTP 4xx). On that, stop the run and `console.warn` once with the code; no retries.

## 2. What a check reads and changes

- From AviationStack `data[0]`: `flight_status`, `departure.gate`, `departure.terminal`, `departure.delay` (minutes), `departure.estimated`, `arrival.estimated`. AviationStack's times carry the **airport's local clock** behind a `+00:00` label, so only the `HH:MM` text is used for display (`liveDepartureLocal`), never parsed as UTC.
- Pure `flightChanges(pass, live)` → `{ patch, alerts[] }`:
  - `gate` changed (non-empty, differs case-insensitively) → patch `gate`, `gateSource: 'live'`; alert `gate`.
  - `terminal` changed → patch only.
  - `delayMinutes ≥ 15` and `≥ lastDelayAlerted + 15` → patch `delayMinutes`, `liveDepartureLocal`, `delayAlertedMinutes`; alert `delay`.
  - status: `active` → `boarded` (no alert — it's airborne, not boarding); `landed` → `completed`, alert `landed`; `cancelled` → `cancelled`, alert `cancelled`.
  - patch always gets `liveCheckedAtMs`.
- New fields sit beside old ones; the status enum gains nothing (shipped apps index it).
- Alerts use `notifyUser`:
  - gate → type **`flight_change`** `{ passId, flightNumber, change: 'gate', gate }`, push "Gate change · KL1357" / "Now departing from gate B22."
  - delay → `flight_change` `{ change: 'delay' }`, push "KL1357 is delayed" / "About 45 min late — now departing 14:35." (time part omitted when unknown).
  - landed / cancelled → existing `flight_status` (`completed` / `cancelled`), copy "KL1357 has landed." / "KL1357 has been cancelled."
  - Older apps render `flight_change` from the saved title/body (generic fallback) and route unknown types to the notifications list; new apps route it to the pass (`utils/notificationRoute.ts`) and show it with the flight icon.
- Copy fixes: notification intro "Gate changes, delays, landing and cancellations (Pro)."; paywall feature "Gate, delay, landing and cancellation alerts". The in-app `FLIGHT_STATUS_COPY.boarded` becomes "has taken off".

## 3. Live Apple Wallet passes (Apple's PassKit web service)

- `pass.json` adds `webServiceURL` = `https://us-central1-supernova-a2125.cloudfunctions.net/appleWalletService` (direct function URL, so Hosting can't strip the `Authorization` header) and `authenticationToken` = base64url HMAC-SHA256(`WALLET_LINK_SECRET`, `"wallet-auth:" + serial`) (stable, ≥ 16 chars, nothing stored).
- Change messages so Wallet notifies on the lock screen: gate `"Gate changed to %@"`, a new secondary field `STATUS` ("On time" / "Delayed 45 min · 14:35" / "Cancelled") with `"%@"`, departs `"Now departs %@"`.
- `appleWalletService` (onRequest, path routing — pure `parseWalletServicePath`):
  - `POST /v1/devices/{device}/registrations/{passType}/{serial}` `{ pushToken }` → checks auth token; upserts `appleWalletRegistrations/{device}__{serial}` `{ device, pushToken, serial, passId, ownerUid }`; 201 new / 200 existing.
  - `DELETE` same → removes it; 200.
  - `GET /v1/devices/{device}/registrations/{passType}?passesUpdatedSince=` → serials of that device's passes with `walletUpdatedAtMs > since`; `{ serialNumbers, lastUpdated }` or 204.
  - `GET /v1/passes/{passType}/{serial}` → auth; re-reads the pass; signs fresh; `Last-Modified` from `walletUpdatedAtMs`, 304 on `If-Modified-Since`; deleted pass → 401 (Wallet keeps its copy).
  - `POST /v1/log` → logs, 200. Wrong pass type or bad token → 401. Nothing else → 404.
- Trigger `onBoardingPassWrittenWallet`: when a field shown on the pass changes (pure `walletFieldsChanged(before, after)` over the `passJson` inputs plus `delayMinutes`, `liveDepartureLocal`, `status`; ignores `walletUpdatedAtMs` itself so its own write doesn't loop), set `walletUpdatedAtMs = now` and send an APNs push (`{}` payload, topic `pass.com.supernovatravel.app`, HTTP/2 to `api.push.apple.com` with the pass certificate + key already in secrets) to each registration of that serial; drop registrations APNs answers 410. On delete: remove its registrations.
- `deleteAccount` removes `appleWalletRegistrations` where `ownerUid`. Rules: no client access. Privacy policy: one sentence (Wallet device id + push token, only to update passes you added).

## Testing

- Pure (jest): `dueCheckpoint` (each window, no arrival, missed run, outside), `flightChanges` (gate new/same/case, delay thresholds, status map, no alerts when nothing changed), push copy, `walletFieldsChanged`, `walletAuthToken` (stable, differs per serial), `parseWalletServicePath` (each route, wrong segments), `passJson` (webServiceURL, token, change messages, STATUS field), limit-error detection.
- Live: deploy; run the checker once against a real near-departure flight number via a script (counts against 100); `curl` the service routes with a correct and a wrong token.
- Device (1.0.8): add a pass → registration doc appears; edit gate in app → Wallet shows "Gate changed to …".

## Out of scope

Google Wallet (own spec, waiting on the issuer ID), boarding-time alerts (AviationStack has no boarding status), seat changes from the airline, upgrading the API plan.
