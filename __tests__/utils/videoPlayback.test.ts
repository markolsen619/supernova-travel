import { CLIP_AUDIO_MIXING, shouldPlayClip } from '@/utils/videoPlayback';

describe('shouldPlayClip', () => {
  const on = { cardActive: true, screenFocused: true, appActive: true };
  it('plays the active card on a visible screen in a foreground app', () => {
    expect(shouldPlayClip(on)).toBe(true);
  });
  // Review: the feed kept playing under the post screen (two players, audio twice) and on other tabs.
  it('stops when the screen is covered or another tab is open', () => {
    expect(shouldPlayClip({ ...on, screenFocused: false })).toBe(false);
  });
  // Review: iOS pauses players in the background and never resumes them; tying play to the app state
  // flips this back to true on return, which re-runs the play effect.
  it('stops in the background and resumes on return', () => {
    expect(shouldPlayClip({ ...on, appActive: false })).toBe(false);
  });
  it('stops a card that is not the one on screen', () => {
    expect(shouldPlayClip({ ...on, cardActive: false })).toBe(false);
  });
});

describe('CLIP_AUDIO_MIXING', () => {
  // Review: expo-video's default ('doNotMix') took the audio session even while muted and stopped the
  // person's music. 'auto' mixes while the clip is silent and takes over once they turn sound on.
  it('lets other audio keep playing while a clip is muted', () => {
    expect(CLIP_AUDIO_MIXING).toBe('auto');
  });
});
