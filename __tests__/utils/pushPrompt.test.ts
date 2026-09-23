import { shouldPromptForPush } from '@/utils/pushPrompt';

const base = {
  trigger: 'dm_sent' as const,
  tier: 'free' as const,
  permission: 'undetermined' as const,
  alreadyAsked: false,
};

describe('shouldPromptForPush', () => {
  it('asks after you send a DM, at any tier — DM pushes are not gated', () => {
    expect(shouldPromptForPush(base)).toBe(true);
    expect(shouldPromptForPush({ ...base, tier: 'pro' })).toBe(true);
  });

  it('asks after you send a trip invite, at any tier', () => {
    expect(shouldPromptForPush({ ...base, trigger: 'trip_invite_sent' })).toBe(true);
  });

  it('asks a Pro user who adds a boarding pass — they will actually get flight alerts', () => {
    expect(
      shouldPromptForPush({ ...base, trigger: 'boarding_pass_added', tier: 'pro' }),
    ).toBe(true);
    expect(
      shouldPromptForPush({ ...base, trigger: 'boarding_pass_added', tier: 'business' }),
    ).toBe(true);
  });

  it('stays silent when a free user adds a boarding pass — checkFlightStatus skips free tiers, so the ask would promise nothing', () => {
    expect(
      shouldPromptForPush({ ...base, trigger: 'boarding_pass_added', tier: 'free' }),
    ).toBe(false);
  });

  it('never re-asks once asked, so a decline does not re-prompt on every message sent', () => {
    expect(shouldPromptForPush({ ...base, alreadyAsked: true })).toBe(false);
  });

  it('stays silent when permission is already granted — there is nothing to ask for', () => {
    expect(shouldPromptForPush({ ...base, permission: 'granted' })).toBe(false);
  });

  it('stays silent once denied — iOS resolves the second request without showing a sheet, so it would burn the moment for nothing', () => {
    expect(shouldPromptForPush({ ...base, permission: 'denied' })).toBe(false);
  });
});
