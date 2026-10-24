// __tests__/utils/googleWalletOutcome.test.ts
import { googleWalletOutcome, showGoogleWalletButton } from '@/utils/googleWalletOutcome';

describe('googleWalletOutcome', () => {
  it('backing out is silent', () => expect(googleWalletOutcome('RESULT_CANCELED')).toBe('cancelled'));
  it('another add already running is silent', () => expect(googleWalletOutcome('ADD_PASS_IN_PROGRESS')).toBe('cancelled'));
  it('anything else is an error worth saying', () => {
    expect(googleWalletOutcome('API_ERROR')).toBe('error');
    expect(googleWalletOutcome(undefined)).toBe('error');
  });
});

describe('showGoogleWalletButton (final review: demo mode)', () => {
  const base = { platform: 'android', canAdd: true, live: false, testerUids: ['owner'], uid: 'owner' };
  it('while Google Wallet is in demo mode only testers see it', () => {
    expect(showGoogleWalletButton(base)).toBe(true);
    expect(showGoogleWalletButton({ ...base, uid: 'someone' })).toBe(false);
  });
  it('once live, every Android phone that can save passes', () => {
    expect(showGoogleWalletButton({ ...base, live: true, uid: 'someone' })).toBe(true);
    expect(showGoogleWalletButton({ ...base, live: true, canAdd: false })).toBe(false);
  });
  it('never on iPhone, and not without the config', () => {
    expect(showGoogleWalletButton({ ...base, platform: 'ios' })).toBe(false);
    expect(showGoogleWalletButton({ ...base, live: undefined, testerUids: undefined })).toBe(false);
  });
});
