# Video posts — design

Approved in chat 2026-10-10 (30 s cap, muted until tapped).

## Goal

People post a short travel clip to the feed: a screen recording of their trip flyover, or any clip from
their camera roll. Clips look good and play smoothly in a scrolling feed, and stay cheap to serve.

## Posting

- **Add to feed** (`app/add-to-feed.tsx`) gets a third option, **Post a video** ("Share a clip from your
  trip"), between Post a photo and Share a trip. It opens `app/post/create-video.tsx` (modal, like
  `create-photo`).
- The screen opens iOS's video picker (`expo-image-picker`, `mediaTypes: ['videos']`,
  `allowsEditing: true`, `videoMaxDuration: 30`): the system trim bar, and nothing over 30 s can be
  chosen. Cancelling the picker with no clip closes the screen.
- Compose screen: the clip looping (muted) at the top, caption, optional place — the same fields and
  objectionable-text check as a photo post. One clip per post. **Post** is the one primary action;
  "Choose another clip" is a text link.
- On Post: compress → cover frame → upload clip and cover with a real progress bar
  ("Uploading 64%") → create the post → `router.dismissAll()` to the feed, which refetches.
  A failure says what happened ("Your video didn't upload. Check your connection and try again.")
  and keeps the clip and caption for a retry.

## Processing on the phone

- **Compression** — `react-native-compressor` `Video.compress` to 720p (longest side 1280) at about
  2.5 Mbps: a 30 s clip ≈ 7–10 MB. Unbounded, an iPhone clip is 50–150 MB, and upload time and serving
  cost scale with it.
- **Cover** — `expo-video-thumbnails` at 0.5 s (a frame, not the first black one), JPEG ~0.8.
- **Checks before upload** (pure, `utils/videoPost.ts`): duration ≤ 30.5 s (the picker's rounding),
  compressed size ≤ 40 MB, and an aspect taken from the asset's width/height. A clip that fails a check
  gets a sentence, not an upload.
- Storage paths: `posts/{uid}/videos/{ts}.mp4` and `posts/{uid}/videos/{ts}.jpg` — inside the folder
  post deletion already clears.

## The post document

```
mediaType: 'video'
mediaUrl:  <the mp4>            // older apps' FeedCard plays mediaUrl when mediaType is 'video'
mediaUrls: [<the cover jpg>]    // older apps' post screen shows mediaUrls as photos → the cover
thumbnailUrl: <the cover jpg>   // already on Post; notifications use it (coverUrlFor)
durationSec: number             // new
aspect: number                  // new, width / height
```

Everything else as a photo post (visibility, counts, tags, place). `Post` gains optional `durationSec`
and `aspect`.

**Older apps (1.0.2–1.0.4):** the feed plays the clip (with sound, as they do today); the post screen
shows the cover; profile-grid tiles are blank, because those grids draw `mediaUrl` as an image. Making
`mediaUrl` the cover instead would break the old feed card, which is worse.

## Playing

- `components/feed/VideoPlayer` moves from `expo-av` (deprecated, removed in a coming SDK) to
  `expo-video` (`useVideoPlayer`, `VideoView`): loops, plays only while its card is the active one,
  pauses and rewinds when it leaves.
- **Muted until tapped.** A 44 pt speaker button on the card (accessibility label "Turn sound on" /
  "Turn sound off"); the choice is one app-wide flag (`stores/useFeedSoundStore`, not persisted), so it
  holds while scrolling and resets next launch. Double tap still likes.
- The cover shows immediately (`thumbnailUrl`) and fades out when the first frame renders, so a card is
  never black.
- **Portrait** clips fill the card (`contentFit: 'cover'`). **Landscape** (`aspect > 1`) shows the whole
  frame (`contain`) over the blurred cover, rather than cropping the sides away.
- The next card's player is created while its predecessor is on screen (FlashList renders it), so it
  is buffered by the time it is reached. No further preloading.
- Profile grids (`PostsGrid`, own profile) use `thumbnailUrl` for video posts with a small play badge;
  the post screen plays the clip with the same player.

## Rules

- **Storage** `posts/{userId}/**`: video ≤ 40 MB (images unchanged).
- **Firestore** posts create: when `mediaType == 'video'`, `durationSec` is a number ≤ 31.

## Cost

Firebase Storage as today: about 8 MB per view. Within the free download allowance at roughly 10k
views a month, about $60 a month at 100k. If video takes off, Cloudflare Stream (adaptive streaming)
is the next step — out of scope here.

## Out of scope

In-app recording of the flyover (people use iOS screen recording), music/effects/editing beyond
trimming, several clips per post, Android-specific polish, server-side transcoding.

## Ships in

The next EAS build: `expo-video`, `expo-video-thumbnails` and `react-native-compressor` are native.

## Testing

Pure tests: `utils/videoPost.ts` (duration/size/aspect checks, landscape decision, the post document
for a clip — including `mediaUrls: [cover]`), storage path builder, and the sound-flag store's
toggling. Rules tests are not set up in this repo; the rules change is checked by reading. Device
check on the next TestFlight build: post a 30 s screen recording, scroll the feed muted, tap sound,
landscape clip, profile grid.
