import { isNotModified, MAX_DEVICES_PER_PASS, registrationAllowed, parseWalletServicePath, passIdFromSerial, tokenFromAuthHeader, tokensMatch, walletFieldsChanged, serialsUpdatedSince } from '../../functions/src/appleWalletService';

const PT = 'pass.com.supernovatravel.app';
describe('parseWalletServicePath', () => {
  it('register and unregister', () => {
    expect(parseWalletServicePath('POST', `/v1/devices/dev1/registrations/${PT}/bp-1`)).toEqual({ kind: 'register', device: 'dev1', passType: PT, serial: 'bp-1' });
    expect(parseWalletServicePath('DELETE', `/v1/devices/dev1/registrations/${PT}/bp-1`)).toEqual({ kind: 'unregister', device: 'dev1', passType: PT, serial: 'bp-1' });
  });
  it('serials for a device, the latest pass, and logs', () => {
    expect(parseWalletServicePath('GET', `/v1/devices/dev1/registrations/${PT}`)).toEqual({ kind: 'serials', device: 'dev1', passType: PT });
    expect(parseWalletServicePath('GET', `/v1/passes/${PT}/bp-1`)).toEqual({ kind: 'pass', passType: PT, serial: 'bp-1' });
    expect(parseWalletServicePath('POST', '/v1/log')).toEqual({ kind: 'log' });
  });
  it('anything else is not ours', () => {
    expect(parseWalletServicePath('GET', '/v1/devices/dev1')).toBeNull();
    expect(parseWalletServicePath('PUT', `/v1/passes/${PT}/bp-1`)).toBeNull();
    expect(parseWalletServicePath('GET', '/')).toBeNull();
  });
});

describe('helpers', () => {
  it('passIdFromSerial', () => {
    expect(passIdFromSerial('bp-abc')).toBe('abc');
    expect(passIdFromSerial('abc')).toBeNull();
    expect(passIdFromSerial('bp-')).toBeNull();
    expect(passIdFromSerial('bp-a/b')).toBeNull();
  });
  it('tokenFromAuthHeader', () => {
    expect(tokenFromAuthHeader('ApplePass tok123')).toBe('tok123');
    expect(tokenFromAuthHeader('Bearer tok123')).toBeNull();
    expect(tokenFromAuthHeader(undefined)).toBeNull();
  });
});

describe('walletFieldsChanged', () => {
  const pass = { flightNumber: 'KL1357', gate: 'B3', seat: '14A', status: 'upcoming' };
  it('a field shown on the pass', () => {
    expect(walletFieldsChanged(pass, { ...pass, gate: 'B22' })).toBe(true);
    expect(walletFieldsChanged(pass, { ...pass, delayMinutes: 30 })).toBe(true);
    expect(walletFieldsChanged(pass, { ...pass, liveCheckedAtMs: 5 })).toBe(true);
  });
  it('not for fields Wallet never shows, nor its own stamp (no loop)', () => {
    expect(walletFieldsChanged(pass, { ...pass, notes: 'x', tripId: 't' })).toBe(false);
    expect(walletFieldsChanged(pass, { ...pass, walletUpdatedAtMs: 9 })).toBe(false);
    expect(walletFieldsChanged({ ...pass, liveCheckedAtMs: 5 }, { ...pass, liveCheckedAtMs: 6 })).toBe(false);
  });
  it('a new pass has no Wallet copy yet', () => {
    expect(walletFieldsChanged(null, pass)).toBe(false);
  });
});

describe('serialsUpdatedSince', () => {
  const rows = [{ serial: 'bp-1', updatedAtMs: 100 }, { serial: 'bp-2', updatedAtMs: 300 }];
  it('everything when Wallet has no tag yet', () => {
    expect(serialsUpdatedSince(rows, undefined)).toEqual({ serialNumbers: ['bp-1', 'bp-2'], lastUpdated: '300' });
  });
  it('only what changed after the tag', () => {
    expect(serialsUpdatedSince(rows, '100')).toEqual({ serialNumbers: ['bp-2'], lastUpdated: '300' });
  });
  it('nothing new → null (204)', () => {
    expect(serialsUpdatedSince(rows, '300')).toBeNull();
    expect(serialsUpdatedSince([], undefined)).toBeNull();
  });
});

describe('final-review minors (2026-10-23)', () => {
  it('two changes in one second still reach Wallet: only a copy at least as new as the change is unmodified', () => {
    const t = Date.parse('2026-10-23T10:00:10.700Z');
    expect(isNotModified('Fri, 23 Oct 2026 10:00:10 GMT', t)).toBe(false); // Wallet holds the 10.2 s copy; a 10.7 s change came after
    expect(isNotModified('Fri, 23 Oct 2026 10:00:11 GMT', t)).toBe(true);
    expect(isNotModified(undefined, t)).toBe(false);
    expect(isNotModified('garbage', t)).toBe(false);
  });
  it('tokens compare in constant time and never match on length alone', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
    expect(tokensMatch('', '')).toBe(false);
  });
  it('an oversized device id is refused before it reaches Firestore', () => {
    expect(parseWalletServicePath('POST', `/v1/devices/${'a'.repeat(129)}/registrations/${PT}/bp-1`)).toBeNull();
    expect(parseWalletServicePath('POST', `/v1/devices/${'a'.repeat(64)}/registrations/${PT}/bp-1`)).not.toBeNull();
  });
});

describe('registrationAllowed (2026-10-23)', () => {
  it('a pass can live in a handful of wallets, not hundreds (each one is a push on every change)', () => {
    expect(registrationAllowed(false, MAX_DEVICES_PER_PASS - 1)).toBe(true);
    expect(registrationAllowed(false, MAX_DEVICES_PER_PASS)).toBe(false);
  });
  it('a device already registered can always re-register', () => {
    expect(registrationAllowed(true, 500)).toBe(true);
  });
});
