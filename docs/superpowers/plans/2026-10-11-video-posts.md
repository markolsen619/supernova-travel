# Video Posts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** People post a 30-second travel clip to the feed; it autoplays muted, with a cover frame, and stays cheap to serve.

**Architecture:** Pure rules in `utils/videoPost.ts` (limits, aspect, the post fields, storage paths, progress). `services/postMedia.ts` gains a video upload with progress. `useCreatePost.createVideoPost` compresses (`react-native-compressor`), takes a cover (`expo-video-thumbnails`), uploads both, then writes the post last. `components/feed/VideoPlayer` moves to `expo-video` with a cover overlay and a feed-wide mute flag (`stores/useFeedSoundStore`).

**Tech Stack:** Expo SDK 54, `expo-video` ~3.0.16, `expo-video-thumbnails` ~10.0.8, `react-native-compressor` ~1.19.4 (TurboModule; 2.x needs Nitro — not used), Firebase Storage/Firestore, Jest (pure tests only).

**Spec:** `docs/superpowers/specs/2026-10-10-video-posts-design.md`

## Global Constraints

- Clips: **30 s cap** (`videoMaxDuration: 30`), accept ≤ 30.5 s (picker rounding); one clip per post.
- **Muted until tapped**; the sound choice is one app-wide, unpersisted flag.
- Compression: 720p (max side 1280), ~2.5 Mbps; compressed file ≤ 40 MB.
- Post doc: `mediaType: 'video'`, `mediaUrl` = mp4, `mediaUrls: [cover]`, `thumbnailUrl` = cover, `durationSec`, `aspect`.
- Storage: `posts/{uid}/videos/{ts}.mp4` and `.jpg`; rules allow video ≤ 40 MB.
- Firestore: a `video` post's `durationSec` is a number ≤ 31.
- Design system (`.claude/skills/supernova-design/SKILL.md`): no emoji, sentence case, one primary action, haptics Light/Medium, touch targets ≥ 44 pt, `useTheme()` colours, house spring.
- No component renderer exists: logic goes in `utils/` with pure tests.
- Native modules → ships in the next EAS build; the existing simulator dev build cannot load them.

## Review Focus

1. **Rotated portrait clips** (stored landscape + rotation flag) must read as portrait → aspect comes from the cover frame's width/height, not the asset's. Test in Task 1.
2. **Upload failure mid-way** must not leave a post pointing at a missing file → the Firestore doc is written last; the screen keeps clip and caption. Test (`videoPostFields` only called with both URLs) in Task 1; ordering in Task 3.
3. **Missing duration from the picker** (`asset.duration` null) → fall back to the compressor's metadata; still capped. Test in Task 1 (`clipDurationSec`).
4. **A video post with no `thumbnailUrl`/`aspect`** (older or hand-made doc) → plays portrait with no cover, never crashes. Test in Task 1 (`videoDisplay`).
5. **Mute choice carries across cards** and starts muted on launch. Test in Task 2.

---

### Task 1: Video rules (pure) and dependencies

**Files:**
- Create: `utils/videoPost.ts`
- Test: `__tests__/utils/videoPost.test.ts`
- Modify: `package.json` (via `npx expo install`)

**Interfaces:**
- Produces: `MAX_VIDEO_SECONDS = 30`, `MAX_VIDEO_BYTES = 40 * 1024 * 1024`, `clipDurationSec(pickerMs: number | null | undefined, metaSec: number | null | undefined): number | null`, `videoProblem(p: { durationSec: number | null; bytes: number | null }): string | null`, `videoAspect(w: number | null | undefined, h: number | null | undefined): number`, `videoDisplay(post: { aspect?: number | null; thumbnailUrl?: string | null }): { landscape: boolean; coverUrl: string | null }`, `videoPostFields(p: { videoUrl: string; coverUrl: string; durationSec: number; aspect: number })`, `videoStoragePaths(uid: string, ts: number): { video: string; cover: string }`, `postingProgress(stage: 'compress' | 'upload', fraction: number): number`.

- [ ] **Step 1: Install the native modules**

Run: `npx expo install expo-video expo-video-thumbnails && npx expo install react-native-compressor@~1.19.4`
Expected: `package.json` lists `expo-video` ~3.0.x, `expo-video-thumbnails` ~10.0.x, `react-native-compressor` ~1.19.4.

- [ ] **Step 2: Write the failing tests**

```ts
import {
  MAX_VIDEO_BYTES, clipDurationSec, postingProgress, videoAspect, videoDisplay,
  videoPostFields, videoProblem, videoStoragePaths,
} from '@/utils/videoPost';

describe('clipDurationSec', () => {
  it('prefers the picker, in seconds', () => expect(clipDurationSec(29_400, 12)).toBe(29.4));
  it('falls back to the file when the picker has none', () => {
    expect(clipDurationSec(null, 18.2)).toBe(18.2);
    expect(clipDurationSec(undefined, undefined)).toBeNull();
  });
});

describe('videoProblem', () => {
  it('accepts a 30 s clip, allowing the picker a little rounding', () => {
    expect(videoProblem({ durationSec: 30.4, bytes: 9_000_000 })).toBeNull();
  });
  it('refuses a longer clip, an unknown length and an oversized file', () => {
    expect(videoProblem({ durationSec: 31, bytes: 1 })).toBe('Clips can be up to 30 seconds. Trim it and try again.');
    expect(videoProblem({ durationSec: null, bytes: 1 })).toBe("That clip couldn't be read. Try another one.");
    expect(videoProblem({ durationSec: 20, bytes: MAX_VIDEO_BYTES + 1 })).toBe('That clip is too large to post. Try a shorter one.');
  });
});

describe('videoAspect', () => {
  // A portrait iPhone clip is often stored 1920x1080 with a rotation flag; the
  // cover frame comes out upright, which is why callers pass its size.
  it('is width over height of the upright frame', () => expect(videoAspect(720, 1280)).toBeCloseTo(0.5625));
  it('assumes portrait when the size is unknown', () => {
    expect(videoAspect(0, 0)).toBeCloseTo(9 / 16);
    expect(videoAspect(null, undefined)).toBeCloseTo(9 / 16);
  });
});

describe('videoDisplay', () => {
  it('shows landscape whole, portrait full-bleed', () => {
    expect(videoDisplay({ aspect: 1.78, thumbnailUrl: 'c.jpg' })).toEqual({ landscape: true, coverUrl: 'c.jpg' });
    expect(videoDisplay({ aspect: 0.56, thumbnailUrl: 'c.jpg' }).landscape).toBe(false);
  });
  it('copes with a post that has neither', () => {
    expect(videoDisplay({})).toEqual({ landscape: false, coverUrl: null });
  });
});

describe('videoPostFields', () => {
  it('keeps older apps working: mediaUrl plays, mediaUrls shows the cover', () => {
    expect(videoPostFields({ videoUrl: 'v.mp4', coverUrl: 'c.jpg', durationSec: 12.345, aspect: 0.56251 })).toEqual({
      mediaType: 'video', mediaUrl: 'v.mp4', mediaUrls: ['c.jpg'], thumbnailUrl: 'c.jpg', durationSec: 12.3, aspect: 0.563,
    });
  });
});

describe('videoStoragePaths', () => {
  it('puts both files in the folder post deletion clears', () => {
    expect(videoStoragePaths('u1', 42)).toEqual({ video: 'posts/u1/videos/42.mp4', cover: 'posts/u1/videos/42.jpg' });
  });
});

describe('postingProgress', () => {
  it('spends 40% on compressing and the rest on uploading', () => {
    expect(postingProgress('compress', 0.5)).toBe(20);
    expect(postingProgress('upload', 0)).toBe(40);
    expect(postingProgress('upload', 1)).toBe(100);
    expect(postingProgress('upload', 7)).toBe(100);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest __tests__/utils/videoPost.test.ts`
Expected: FAIL — "Could not locate module @/utils/videoPost".

- [ ] **Step 4: Write the implementation**

```ts
/** Video posts' rules (docs/superpowers/specs/2026-10-10-video-posts-design.md). */

export const MAX_VIDEO_SECONDS = 30;
/** The picker rounds; a "30 s" trim can come back as 30.2. */
const DURATION_SLACK_SEC = 0.5;
export const MAX_VIDEO_BYTES = 40 * 1024 * 1024;
const PORTRAIT = 9 / 16;
const COMPRESS_SHARE = 40;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** expo-image-picker reports milliseconds; the compressor's metadata, seconds. */
export function clipDurationSec(pickerMs: number | null | undefined, metaSec: number | null | undefined): number | null {
  if (typeof pickerMs === 'number' && pickerMs > 0) return Math.round(pickerMs / 100) / 10;
  if (typeof metaSec === 'number' && metaSec > 0) return metaSec;
  return null;
}

export function videoProblem(p: { durationSec: number | null; bytes: number | null }): string | null {
  if (p.durationSec == null) return "That clip couldn't be read. Try another one.";
  if (p.durationSec > MAX_VIDEO_SECONDS + DURATION_SLACK_SEC) return 'Clips can be up to 30 seconds. Trim it and try again.';
  if (p.bytes != null && p.bytes > MAX_VIDEO_BYTES) return 'That clip is too large to post. Try a shorter one.';
  return null;
}

/** Width over height of the upright frame — pass the cover frame's size, not the asset's (rotation flags). */
export function videoAspect(w: number | null | undefined, h: number | null | undefined): number {
  if (!w || !h || w <= 0 || h <= 0) return PORTRAIT;
  return w / h;
}

export function videoDisplay(post: { aspect?: number | null; thumbnailUrl?: string | null }): { landscape: boolean; coverUrl: string | null } {
  return { landscape: (post.aspect ?? PORTRAIT) > 1.05, coverUrl: post.thumbnailUrl ?? null };
}

/** The media fields of a video post. Older apps play `mediaUrl` and show `mediaUrls` as photos (the cover). */
export function videoPostFields(p: { videoUrl: string; coverUrl: string; durationSec: number; aspect: number }) {
  return {
    mediaType: 'video' as const,
    mediaUrl: p.videoUrl,
    mediaUrls: [p.coverUrl],
    thumbnailUrl: p.coverUrl,
    durationSec: Math.round(p.durationSec * 10) / 10,
    aspect: Math.round(p.aspect * 1000) / 1000,
  };
}

export function videoStoragePaths(uid: string, ts: number): { video: string; cover: string } {
  return { video: `posts/${uid}/videos/${ts}.mp4`, cover: `posts/${uid}/videos/${ts}.jpg` };
}

/** One bar for both stages: compressing fills 0–40%, uploading 40–100%. */
export function postingProgress(stage: 'compress' | 'upload', fraction: number): number {
  const f = clamp01(fraction);
  return Math.round(stage === 'compress' ? f * COMPRESS_SHARE : COMPRESS_SHARE + f * (100 - COMPRESS_SHARE));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest __tests__/utils/videoPost.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json utils/videoPost.ts __tests__/utils/videoPost.test.ts
git commit -m "feat(video): rules for video posts; expo-video, thumbnails, compressor"
```

---

### Task 2: Feed playback — expo-video, cover, muted until tapped

**Files:**
- Create: `stores/useFeedSoundStore.ts`
- Test: `__tests__/stores/useFeedSoundStore.test.ts`
- Rewrite: `components/feed/VideoPlayer.tsx`
- Modify: `components/feed/FeedCard.tsx` (the `post.mediaType === 'video'` branch, ~line 138) and `types/index.ts` (`Post`)

**Interfaces:**
- Consumes: `videoDisplay` (Task 1).
- Produces: `useFeedSoundStore` (`{ muted: boolean; toggleMuted(): void }`, starts `true`); `VideoPlayer` props `{ uri: string; shouldPlay: boolean; muted: boolean; coverUrl: string | null; landscape: boolean }`; `Post.durationSec?: number`, `Post.aspect?: number`.

- [ ] **Step 1: Write the failing store test**

```ts
import { useFeedSoundStore } from '@/stores/useFeedSoundStore';

describe('useFeedSoundStore', () => {
  it('starts muted and the choice holds until toggled back', () => {
    expect(useFeedSoundStore.getState().muted).toBe(true);
    useFeedSoundStore.getState().toggleMuted();
    expect(useFeedSoundStore.getState().muted).toBe(false);
    useFeedSoundStore.getState().toggleMuted();
    expect(useFeedSoundStore.getState().muted).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx jest __tests__/stores/useFeedSoundStore.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the store**

```ts
import { create } from 'zustand';

/** Feed video sound: muted until someone taps the speaker, then held while they scroll. Not persisted — every launch starts muted. */
export const useFeedSoundStore = create<{ muted: boolean; toggleMuted: () => void }>((set) => ({
  muted: true,
  toggleMuted: () => set((s) => ({ muted: !s.muted })),
}));
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx jest __tests__/stores/useFeedSoundStore.test.ts`
Expected: PASS.

- [ ] **Step 5: Rewrite `VideoPlayer` on expo-video**

```tsx
import { useEffect, useRef } from 'react';
import { Animated, Image, StyleSheet, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';

interface VideoPlayerProps {
  uri: string;
  shouldPlay: boolean;
  muted: boolean;
  coverUrl: string | null;
  /** Landscape clips show whole over their blurred cover instead of losing their sides. */
  landscape: boolean;
}

/** A looping feed clip: cover first, fading out on the first frame; plays only while its card is active. */
export function VideoPlayer({ uri, shouldPlay, muted, coverUrl, landscape }: VideoPlayerProps) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = true;
    p.muted = muted;
  });
  const coverOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (shouldPlay) {
      player.play();
    } else {
      player.pause();
      player.currentTime = 0;
    }
  }, [shouldPlay, player]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  return (
    <View style={StyleSheet.absoluteFill}>
      {landscape && coverUrl ? (
        <Image source={{ uri: coverUrl }} style={StyleSheet.absoluteFill} blurRadius={40} resizeMode="cover" accessibilityIgnoresInvertColors />
      ) : null}
      <VideoView
        player={player}
        style={StyleSheet.absoluteFill}
        contentFit={landscape ? 'contain' : 'cover'}
        nativeControls={false}
        onFirstFrameRender={() => Animated.timing(coverOpacity, { toValue: 0, duration: 180, useNativeDriver: true }).start()}
      />
      {coverUrl ? (
        <Animated.Image
          source={{ uri: coverUrl }}
          style={[StyleSheet.absoluteFill, { opacity: coverOpacity }]}
          resizeMode={landscape ? 'contain' : 'cover'}
          pointerEvents="none"
        />
      ) : null}
    </View>
  );
}
```

Verify `onFirstFrameRender` exists: `grep -n onFirstFrameRender node_modules/expo-video/build/VideoView.types.d.ts`. If it doesn't, use `player.addListener('statusChange', …)` and fade when `status === 'readyToPlay'`.

- [ ] **Step 6: Use it in `FeedCard`, with the speaker button**

Replace `<VideoPlayer uri={post.mediaUrl} shouldPlay={isActive} isMuted={false} />` with:

```tsx
<>
  <VideoPlayer
    uri={post.mediaUrl}
    shouldPlay={isActive}
    muted={muted}
    coverUrl={videoDisplay(post).coverUrl}
    landscape={videoDisplay(post).landscape}
  />
  <TouchableOpacity
    onPress={handleToggleSound}
    style={[styles.soundButton, { top: insets.top + 64 }]}
    accessibilityRole="button"
    accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'}
    hitSlop={8}
  >
    {muted ? <SpeakerSlash size={18} color="#ffffff" weight="bold" /> : <SpeakerHigh size={18} color="#ffffff" weight="bold" />}
  </TouchableOpacity>
</>
```

with, in the component body:

```tsx
const muted = useFeedSoundStore((s) => s.muted);
const toggleMuted = useFeedSoundStore((s) => s.toggleMuted);
const handleToggleSound = useCallback(() => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  toggleMuted();
}, [toggleMuted]);
```

(`insets` from `useSafeAreaInsets()` if the card doesn't already have it; imports `SpeakerHigh`, `SpeakerSlash` from `phosphor-react-native`, `useFeedSoundStore`, `videoDisplay`.) Style, module-level:

```ts
soundButton: {
  position: 'absolute', right: Spacing['4'], width: 44, height: 44, borderRadius: 22,
  alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.45)',
},
```

Check the button isn't under the feed header or the right-hand action column by reading FeedCard's layout first; move `top`/`right` so it sits clear of both.

Add to `Post` in `types/index.ts`, after `thumbnailUrl`:

```ts
  /** Video posts only (utils/videoPost): seconds, and width / height of the upright frame. */
  durationSec?: number;
  aspect?: number;
```

- [ ] **Step 7: Typecheck and test**

Run: `npx tsc --noEmit -p . && npx jest __tests__/stores/useFeedSoundStore.test.ts __tests__/utils/videoPost.test.ts`
Expected: no type errors; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add stores/useFeedSoundStore.ts __tests__/stores/useFeedSoundStore.test.ts components/feed/VideoPlayer.tsx components/feed/FeedCard.tsx types/index.ts
git commit -m "feat(video): feed clips on expo-video — cover first, muted until tapped, landscape shown whole"
```

---

### Task 3: Upload and post creation

**Files:**
- Modify: `services/postMedia.ts`, `hooks/useCreatePost.ts`

**Interfaces:**
- Consumes: `videoStoragePaths`, `videoPostFields`, `videoProblem`, `videoAspect`, `clipDurationSec`, `postingProgress` (Task 1).
- Produces: `uploadPostFile(path: string, uri: string, contentType: string, onProgress?: (fraction: number) => void): Promise<string>` (download URL); `useCreatePost().createVideoPost(input: { localUri: string; pickerDurationMs: number | null; caption: string; placeName: string | null }): Promise<string>` (post id). `uploadProgress` (0–100) covers both stages.

- [ ] **Step 1: Add the generic upload with progress to `services/postMedia.ts`**

```ts
/** Uploads a local file to `path` with its content type, reporting 0–1 progress; resolves the download URL. */
export async function uploadPostFile(path: string, uri: string, contentType: string, onProgress?: (fraction: number) => void): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());
  const storageRef = ref(storage, path);
  const task = uploadBytesResumable(storageRef, blob, { contentType });
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      (s) => onProgress?.(s.totalBytes ? s.bytesTransferred / s.totalBytes : 0),
      (err) => reject(new Error(`Storage upload failed: ${err.message}`)),
      resolve,
    );
  });
  return getDownloadURL(storageRef);
}
```

- [ ] **Step 2: Add `createVideoPost` to `useCreatePost`**

```ts
async function createVideoPost(input: CreateVideoPostInput): Promise<string> {
  if (!user) throw new Error('Not authenticated');
  if (containsObjectionableText(input.caption) || containsObjectionableText(input.placeName)) {
    throw new Error(OBJECTIONABLE_TEXT_MESSAGE);
  }
  setIsUploading(true);
  setUploadProgress(0);
  try {
    const compressedUri = await Video.compress(
      input.localUri,
      { compressionMethod: 'manual', maxSize: 1280, bitrate: 2_500_000 },
      (p) => setUploadProgress(postingProgress('compress', p)),
    );
    const meta = await getVideoMetaData(compressedUri);
    const durationSec = clipDurationSec(input.pickerDurationMs, Number(meta.duration) || null);
    const problem = videoProblem({ durationSec, bytes: Number(meta.size) || null });
    if (problem) throw new Error(problem);
    const cover = await VideoThumbnails.getThumbnailAsync(compressedUri, { time: 500, quality: 0.8 });
    const paths = videoStoragePaths(user.uid, Date.now());
    const coverUrl = await uploadPostFile(paths.cover, cover.uri, 'image/jpeg');
    const videoUrl = await uploadPostFile(paths.video, compressedUri, 'video/mp4', (f) => setUploadProgress(postingProgress('upload', f)));
    // Written last: a failed upload never leaves a post pointing at a missing file.
    const docRef = await addDoc(collection(db, 'posts'), {
      authorUid: user.uid,
      authorDisplayName: profile?.fullName ?? user.displayName ?? 'Traveler',
      authorUsername: profile?.username ?? '',
      authorAvatarUrl: profile?.avatarUrl ?? null,
      caption: input.caption.trim(),
      ...videoPostFields({ videoUrl, coverUrl, durationSec: durationSec!, aspect: videoAspect(cover.width, cover.height) }),
      placeName: input.placeName,
      placeId: null, lat: null, lng: null,
      tripId: null, tripTitle: null, tripDestination: null, tripDateRange: null,
      likesCount: 0, commentsCount: 0,
      ...newPostVisibility(isPrivateAccount(profile)),
      tags: [],
      createdAt: serverTimestamp(),
    });
    invalidateFeed();
    return docRef.id;
  } finally {
    setIsUploading(false);
    setUploadProgress(0);
  }
}
```

Imports: `import { Video, getVideoMetaData } from 'react-native-compressor';`, `import * as VideoThumbnails from 'expo-video-thumbnails';`, `uploadPostFile` and the Task 1 helpers. Add `interface CreateVideoPostInput { localUri: string; pickerDurationMs: number | null; caption: string; placeName: string | null }` and return `createVideoPost` from the hook. Check `getVideoMetaData`'s return shape in `node_modules/react-native-compressor/src` and adjust the field names (`duration`, `size`) to match.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add services/postMedia.ts hooks/useCreatePost.ts
git commit -m "feat(video): compress, cover, upload with progress, post written last"
```

---

### Task 4: Post a video screen and entry point

**Files:**
- Create: `app/post/create-video.tsx`
- Modify: `app/add-to-feed.tsx` (options), `app/_layout.tsx` (register `post/create-video` as `presentation: 'modal'`, next to `post/create-photo`)

**Interfaces:**
- Consumes: `useCreatePost().createVideoPost`, `uploadProgress`, `isUploading` (Task 3); `MAX_VIDEO_SECONDS` (Task 1); `VideoPlayer` is not used here — the preview uses `useVideoPlayer` directly.

- [ ] **Step 1: Add the option** in `app/add-to-feed.tsx`, between Post a photo and Share a trip:

```tsx
{
  Icon: VideoCamera,
  iconColor: colors.brand.purple,
  title: 'Post a video',
  description: 'Share a clip from your trip',
  onPress: () => router.push('/post/create-video'),
},
```

(import `VideoCamera` from `phosphor-react-native`.)

- [ ] **Step 2: Register the route** in `app/_layout.tsx`: `<Stack.Screen name="post/create-video" options={{ presentation: 'modal' }} />` after the `post/create-photo` line.

- [ ] **Step 3: Write `app/post/create-video.tsx`**, following `create-photo.tsx`'s header, caption and place fields:
  - On mount (and from "Choose another clip"), `ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], allowsEditing: true, videoMaxDuration: MAX_VIDEO_SECONDS, quality: 1 })`. Cancel with no clip yet → `router.back()`.
  - Keep `{ uri, durationMs: asset.duration ?? null }` in state.
  - Preview: `const player = useVideoPlayer(clip?.uri ?? null, (p) => { p.loop = true; p.muted = true; p.play(); });` in a 9:16 `VideoView` (`contentFit="contain"`, radius 16, `colors.background.sunken` behind), with "Choose another clip" as a text link beneath.
  - Caption (`maxLength={500}`) and place fields as in `create-photo.tsx`.
  - Progress bar and the hero **Post** button labelled `Uploading… {uploadProgress}%` while posting.
  - On failure, an inline error in `colors.semantic.error` with the error's message (`createVideoPost` throws sentences), keeping the clip and caption; not an Alert.
  - On success, `if (router.canDismiss()) router.dismissAll(); router.navigate('/');` (Architecture Rule 15).
  - ScrollView: `automaticallyAdjustKeyboardInsets`, `keyboardDismissMode="on-drag"`, `keyboardShouldPersistTaps="handled"` (Rule 14). Every handler passed down in `useCallback`.

- [ ] **Step 4: Typecheck and lint**

Run: `npx tsc --noEmit -p . && npm run lint 2>&1 | grep -E "error|problems"`
Expected: no type errors; 0 lint errors.

- [ ] **Step 5: Commit**

```bash
git add app/post/create-video.tsx app/add-to-feed.tsx app/_layout.tsx
git commit -m "feat(video): Post a video — pick and trim to 30 s, caption, place, progress"
```

---

### Task 5: Grids and the post screen

**Files:**
- Modify: `components/profile/PostsGrid.tsx`, `app/(tabs)/profile.tsx` (own grid, ~line 456), `app/post/[id].tsx` (media, ~line 533)

**Interfaces:**
- Consumes: `VideoPlayer`, `useFeedSoundStore` (Task 2); `videoDisplay` (Task 1).
- Produces: `gridImageUrl(post: { mediaType?: string; mediaUrl?: string; thumbnailUrl?: string | null }): string | null` in `utils/postImages.ts`.

- [ ] **Step 1: Failing test** in `__tests__/utils/postImages.test.ts` (add to the existing file if there is one):

```ts
import { gridImageUrl } from '@/utils/postImages';

describe('gridImageUrl', () => {
  it('shows a video by its cover, a photo by itself', () => {
    expect(gridImageUrl({ mediaType: 'video', mediaUrl: 'v.mp4', thumbnailUrl: 'c.jpg' })).toBe('c.jpg');
    expect(gridImageUrl({ mediaType: 'video', mediaUrl: 'v.mp4' })).toBeNull();
    expect(gridImageUrl({ mediaType: 'photo', mediaUrl: 'p.jpg' })).toBe('p.jpg');
  });
});
```

Run: `npx jest __tests__/utils/postImages.test.ts` → FAIL (not exported).

- [ ] **Step 2: Implement** in `utils/postImages.ts`:

```ts
/** A post's grid tile: a video is shown by its cover, never by its mp4 (an Image can't draw one). */
export function gridImageUrl(post: { mediaType?: string; mediaUrl?: string | null; thumbnailUrl?: string | null }): string | null {
  if (post.mediaType === 'video') return post.thumbnailUrl ?? null;
  return post.mediaUrl ?? null;
}
```

Run the test → PASS.

- [ ] **Step 3: Use it in both grids** — replace `post.mediaUrl` / `item.mediaUrl` as the tile `Image` source with `gridImageUrl(post)` (and the `? :` condition with it), add `thumbnailUrl?: string | null` to `PostDoc` and to profile's post type, and for `mediaType === 'video'` overlay a small `Play` icon (`weight="fill"`, white, 14 pt) top-right like the multi-photo `Copy` badge.

- [ ] **Step 4: Play on the post screen** — in `app/post/[id].tsx`, when `post.mediaType === 'video'`, render instead of `PostPhotos`:

```tsx
<View style={styles.media}>
  <VideoPlayer
    uri={post.mediaUrl}
    shouldPlay={isFocused}
    muted={muted}
    coverUrl={videoDisplay(post).coverUrl}
    landscape={videoDisplay(post).landscape}
  />
</View>
```

with `const isFocused = useIsFocused();` (`@react-navigation/native`), `muted` from `useFeedSoundStore`, and the same 44 pt speaker button as the feed card.

- [ ] **Step 5: Test, typecheck, commit**

Run: `npx jest __tests__/utils/postImages.test.ts && npx tsc --noEmit -p .`
Expected: PASS; no errors.

```bash
git add utils/postImages.ts __tests__/utils/postImages.test.ts components/profile/PostsGrid.tsx "app/(tabs)/profile.tsx" "app/post/[id].tsx"
git commit -m "feat(video): grids show the cover with a play badge; the post screen plays the clip"
```

---

### Task 6: Rules, docs, full verification

**Files:**
- Modify: `storage.rules` (`posts/{userId}/**`), `firestore.rules` (`posts/{postId}` create), `CLAUDE.md`

- [ ] **Step 1: Storage** — replace the posts write condition's size line so images keep 100 MB and video gets 40 MB:

```
allow write: if request.auth != null && request.auth.uid == userId
  && request.resource.contentType.matches('image/.*|video/.*')
  && request.resource.size <= (request.resource.contentType.matches('video/.*') ? 40 : 100) * 1024 * 1024;
```

Update the comment above it to say so.

- [ ] **Step 2: Firestore** — append to the posts `allow create` condition:

```
&& (request.resource.data.mediaType != 'video'
    || (request.resource.data.durationSec is number && request.resource.data.durationSec <= 31))
```

- [ ] **Step 3: Deploy only the rules**

Run: `firebase deploy --only firestore:rules,storage --project supernova-a2125`
Expected: both "released".

- [ ] **Step 4: CLAUDE.md** — under Feed components, replace the `VideoPlayer — video playback; uses expo-av` line with: `VideoPlayer` on `expo-video` (cover until the first frame, muted by `useFeedSoundStore`, landscape shown whole over a blurred cover); add a **Video posts** bullet under Cloud Functions' neighbours or Hooks covering `utils/videoPost.ts`, `createVideoPost` (compress → cover → upload → post last), the doc shape for older apps (`mediaUrl` = mp4, `mediaUrls` = [cover]), the 30 s / 40 MB limits and that `expo-av` is gone from the feed.

- [ ] **Step 5: Full verification**

Run: `npx jest --silent && npx tsc --noEmit -p . && npm run lint 2>&1 | grep -E "problems"`
Expected: all suites pass; no type errors; 0 lint errors.

- [ ] **Step 6: Commit**

```bash
git add storage.rules firestore.rules CLAUDE.md
git commit -m "feat(video): rules (40 MB clips, ≤ 31 s) and docs"
```

Device check (next TestFlight build, since the native modules need one): post a 30 s screen recording of a flyover; feed autoplays muted, speaker toggles and holds across cards; a landscape clip shows whole; profile grid shows the cover with a play badge; the post screen plays it; a 1.0.4 phone plays the clip in the feed.
