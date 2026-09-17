import { AI_CONSENT_VERSION as CLIENT_VERSION, hasAiConsent as clientHas } from '@/utils/aiConsent';
import { AI_CONSENT_VERSION as SERVER_VERSION, hasAiConsent as serverHas } from '../../functions/src/aiConsent';

describe('AI consent', () => {
  it('uses the same version on the client and the server', () => {
    // A mismatch means the app thinks you agreed while the server refuses you.
    expect(CLIENT_VERSION).toBe(SERVER_VERSION);
  });

  it('accepts the current version', () => {
    expect(clientHas(SERVER_VERSION)).toBe(true);
    expect(serverHas({ aiConsentVersion: SERVER_VERSION })).toBe(true);
  });

  it('refuses when never given, withdrawn, or malformed', () => {
    expect(clientHas(null)).toBe(false);
    expect(clientHas(undefined)).toBe(false);
    expect(serverHas({})).toBe(false);
    expect(serverHas(null)).toBe(false);
    expect(serverHas({ aiConsentVersion: '1' })).toBe(false);
  });

  it('asks again after the disclosure changes', () => {
    expect(clientHas(SERVER_VERSION - 1)).toBe(false);
    expect(serverHas({ aiConsentVersion: SERVER_VERSION - 1 })).toBe(false);
  });
});
