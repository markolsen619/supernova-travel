# Moderation runbook

Supernova is a user-generated-content app, so App Store guideline 1.2 requires
three things, all of which exist:

| Requirement | Where |
|---|---|
| Filter objectionable material | `utils/contentFilter.ts`, run before captions, comments, messages, trip titles, and profile fields are saved |
| Report content, with a timely response | Three-dot menu on posts, comments, messages (long-press), trips, and profiles → `components/moderation/ReportSheet.tsx` |
| Block abusive users | Same menu, plus Settings → Privacy → Blocked accounts |

Plus terms that don't tolerate objectionable content or abuse:
`hosting/terms.html`, served at https://supernova-a2125.web.app/terms.

**The app promises a review within 24 hours.** Apple checks that someone is
actually acting on reports. This runbook is how that promise is kept.

## How a report reaches you

1. A user files a report. The rules allow one per person per target
   (`reports/{reporterUid}__{contentKey}`).
2. `onReportCreated` (`functions/src/moderationEvents.ts`) pushes
   **"New report: post"** (or comment, message, trip, user) to every uid in
   `MODERATOR_UIDS` in `functions/.env`. The push says the reason and the
   running count, never the reporter.
3. At **3 distinct reports**, posts, comments, and trips get
   `moderationHidden: true` and disappear for everyone. Messages and accounts
   are never auto-hidden: a person decides.

If `MODERATOR_UIDS` is empty, the function logs
`MODERATOR_UIDS is not set; report not delivered to anyone` at error level.
Set a log-based alert on that string.

## Reviewing

Firebase console → Firestore → `reports`, filtered on `status == open`,
ordered by `createdAt`.

| `targetType` | Find it at |
|---|---|
| `post` | `posts/{targetId}` |
| `comment` | `posts/{targetParentId}/comments/{targetId}` |
| `message` | `dmThreads/{targetParentId}/messages/{targetId}` |
| `trip` | `trips/{targetId}` |
| `user` | `users/{targetId}` |

Then decide:

- **Breaks the terms:** delete the content document. For a serious or repeat
  offender, also disable the account: Authentication → the user → Disable
  account. Disabling stops sign-in immediately; an open session ends within
  an hour, when its token expires.
- **Doesn't break the terms but was auto-hidden:** set `moderationHidden` back
  to `false` on the content document.
- **Either way:** set the report's `status` to `resolved` or `dismissed`, and
  add `resolvedAt` and a short `resolution` note. Reports for the same target
  share a `targetKey`; resolve them together.

Reports are kept after resolution, including after either account is deleted
(`deleteAccount` doesn't remove them), as the privacy policy says.

## Changing moderators

Edit `MODERATOR_UIDS` (comma-separated uids) in `functions/.env`, then
`npx firebase deploy --only functions:onReportCreated`. A moderator needs to
have signed in to the app on a device with notifications allowed, which is
what registers their push token.
