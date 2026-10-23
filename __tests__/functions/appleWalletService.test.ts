import { parseWalletServicePath, passIdFromSerial, tokenFromAuthHeader, walletFieldsChanged, serialsUpdatedSince } from '../../functions/src/appleWalletService';

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
