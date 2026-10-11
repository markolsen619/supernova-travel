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
