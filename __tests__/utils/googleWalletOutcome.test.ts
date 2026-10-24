// __tests__/utils/googleWalletOutcome.test.ts
import { googleWalletOutcome } from '@/utils/googleWalletOutcome';

describe('googleWalletOutcome', () => {
  it('backing out is silent', () => expect(googleWalletOutcome('RESULT_CANCELED')).toBe('cancelled'));
  it('another add already running is silent', () => expect(googleWalletOutcome('ADD_PASS_IN_PROGRESS')).toBe('cancelled'));
  it('anything else is an error worth saying', () => {
    expect(googleWalletOutcome('API_ERROR')).toBe('error');
    expect(googleWalletOutcome(undefined)).toBe('error');
  });
});
