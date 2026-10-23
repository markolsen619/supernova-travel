import { walletAddOutcome } from '@/utils/appleWalletOutcome';

describe('walletAddOutcome', () => {
  it('says nothing when the person cancels the Add sheet', () => {
    expect(walletAddOutcome('USER_CANCELLED')).toBe('quiet');
  });
  it('says it is already there instead of opening a browser', () => {
    expect(walletAddOutcome('PASS_ALREADY_EXISTS')).toBe('already');
  });
  it('shows an error for network problems', () => {
    expect(walletAddOutcome('NETWORK_ERROR')).toBe('error');
    expect(walletAddOutcome('HTTP_ERROR')).toBe('error');
  });
  it('falls back to the browser only when the in-app sheet itself could not run', () => {
    for (const c of ['NO_VIEW_CONTROLLER', 'CONTROLLER_ERROR', 'INVALID_PASS', undefined]) expect(walletAddOutcome(c)).toBe('browser');
  });
});
