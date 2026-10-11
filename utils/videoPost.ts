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
