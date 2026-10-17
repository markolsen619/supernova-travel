import { AI_CONSENT_VERSION as CLIENT_VERSION, hasAiConsent as clientHas } from '@/utils/aiConsent';
import { AI_CONSENT_VERSION as SERVER_VERSION, hasAiConsent as serverHas } from '../../functions/src/aiConsent';

describe('AI consent', () => {
  it('uses the same version on the client and the server', () => {
    // A mismatch means the app thinks you agreed while the server refuses you.
    expect(CLIENT_VERSION).toBe(SERVER_VERSION);
  });

  it('accepts the current version for every feature', () => {
    for (const p of ['trip', 'import', 'agent'] as const) {
      expect(clientHas(SERVER_VERSION, p)).toBe(true);
      expect(serverHas({ aiConsentVersion: SERVER_VERSION }, p)).toBe(true);
    }
  });

  it('refuses when never given, withdrawn, or malformed', () => {
    expect(clientHas(null)).toBe(false);
    expect(clientHas(undefined)).toBe(false);
    expect(serverHas({})).toBe(false);
    expect(serverHas(null)).toBe(false);
    expect(serverHas({ aiConsentVersion: '1' })).toBe(false);
  });

  // Review 2026-10-15: a global bump to 2 would refuse AI trips, AI import and forwarded emails for
  // everyone on 1.0.5 and older — those apps can't ask again. Each feature keeps its own minimum.
  it('keeps AI trips, import and email import working on consent version 1', () => {
    expect(serverHas({ aiConsentVersion: 1 })).toBe(true);
    expect(serverHas({ aiConsentVersion: 1 }, 'import')).toBe(true);
    expect(clientHas(1, 'trip')).toBe(true);
  });

  it('asks again before Ask Nova, which sends more (version 2, now 3)', () => {
    expect(SERVER_VERSION).toBe(3);
    expect(serverHas({ aiConsentVersion: 1 }, 'agent')).toBe(false);
    expect(clientHas(1, 'agent')).toBe(false);
  });
});

describe('consent v3 (Ask Nova sees wallet bookings, 2026-10-17)', () => {
  it('Ask Nova needs v3; older features keep accepting what older apps wrote', () => {
    // The server reads the user doc; the app passes the stored version.
    // Server: plain Ask Nova (1.0.6, trip.v1) keeps v2; wallet-capable apps need v3 (review 2026-10-17).
    expect(serverHas({ aiConsentVersion: 2 }, 'agent')).toBe(true);
    expect(serverHas({ aiConsentVersion: 2 }, 'agentWallet')).toBe(false);
    expect(serverHas({ aiConsentVersion: 3 }, 'agentWallet')).toBe(true);
    expect(serverHas({ aiConsentVersion: 1 }, 'trip')).toBe(true);
    expect(serverHas({ aiConsentVersion: 1 }, 'import')).toBe(true);
    expect(clientHas(2, 'agent')).toBe(false);
    expect(clientHas(3, 'agent')).toBe(true);
    expect(clientHas(1, 'trip')).toBe(true);
    expect(CLIENT_VERSION).toBe(3);
    expect(SERVER_VERSION).toBe(3);
  });
});

import { agentConsentPurpose } from '../../functions/src/aiConsent';

describe('review fix: 1.0.6 keeps Ask Nova on consent v2', () => {
  it('only an app that declares wallet.v1 needs v3', () => {
    expect(agentConsentPurpose(['trip.v1'])).toBe('agent');
    expect(agentConsentPurpose(['trip.v1', 'trip.v2', 'wallet.v1'])).toBe('agentWallet');
    expect(serverHas({ aiConsentVersion: 2 }, 'agent')).toBe(true);
    expect(serverHas({ aiConsentVersion: 2 }, 'agentWallet')).toBe(false);
    expect(serverHas({ aiConsentVersion: 3 }, 'agentWallet')).toBe(true);
  });
});
