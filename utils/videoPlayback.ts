/**
 * When a clip may play, and how it shares audio (review of feat/video-posts, 2026-10-11).
 * Only the card on screen, on a visible screen, in a foreground app: the feed kept playing under
 * the post screen and on other tabs, and iOS pauses players in the background without resuming.
 */
export function shouldPlayClip(s: { cardActive: boolean; screenFocused: boolean; appActive: boolean }): boolean {
  return s.cardActive && s.screenFocused && s.appActive;
}

/**
 * expo-video's audioMixingMode for every clip. The default ('doNotMix') took the audio session
 * even while muted and stopped the person's music; 'auto' mixes while the clip is silent.
 */
export const CLIP_AUDIO_MIXING = 'auto' as const;
