import { shouldShowPushIntro, notificationSettingAction } from '@/utils/pushIntro';

describe('shouldShowPushIntro', () => {
  it('shows once, to someone iOS has never asked', () => {
    expect(shouldShowPushIntro({ permission: 'undetermined', introShown: false })).toBe(true);
    expect(shouldShowPushIntro({ permission: 'undetermined', introShown: true })).toBe(false);
    expect(shouldShowPushIntro({ permission: 'granted', introShown: false })).toBe(false);
    expect(shouldShowPushIntro({ permission: 'denied', introShown: false })).toBe(false);
  });
});

describe('notificationSettingAction', () => {
  it('asks iOS when it can, and sends you to Settings when iOS already said no', () => {
    expect(notificationSettingAction('granted')).toEqual({ label: 'On', action: 'none' });
    expect(notificationSettingAction('undetermined')).toEqual({ label: 'Turn on', action: 'ask' });
    expect(notificationSettingAction('denied')).toEqual({ label: 'Off · Open Settings', action: 'open_settings' });
  });
});
