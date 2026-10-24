// __tests__/functions/googlePass.test.ts
import { CLASS_ID, ISSUER_ID, WALLET_SERVICE_ACCOUNT, formatDeparture, genericClass, genericObject, googleObjectId, inactiveObject, saveJwtClaims } from '../../functions/src/googlePass';

const full = {
  id: 'p1', airline: 'KLM', flightNumber: 'KL1357', origin: 'AMS', originCity: 'Amsterdam', destination: 'LHR', destinationCity: 'London',
  departureTime: '2026-11-01T09:20:00.000Z', seat: '14A', gate: 'D7', terminal: '2', boardingGroup: '3',
  barcode: 'M1OLSEN/MARK EABC123 AMSLHRKL 1357', barcodeFormat: 'pdf417',
};
const mod = (o: Record<string, any>, id: string) => (o.textModulesData as any[]).find((m) => m.id === id);

describe('ids', () => {
  it('one object per boarding pass under our issuer', () => {
    expect(googleObjectId('p1')).toBe(`${ISSUER_ID}.bp_p1`);
    expect(CLASS_ID).toBe('3388000000023211693.supernova_boarding_pass');
  });
  it('refuses ids with characters Wallet rejects', () => {
    expect(googleObjectId('a/b')).toBeNull();
    expect(googleObjectId('')).toBeNull();
  });
});

describe('formatDeparture', () => {
  it('in the traveler\'s zone', () => {
    expect(formatDeparture('2026-11-01T09:20:00.000Z', 'Europe/Amsterdam')).toBe('Sun, Nov 1 · 10:20');
  });
  it('an invalid or missing zone falls back to UTC, labelled', () => {
    expect(formatDeparture('2026-11-01T09:20:00.000Z', 'Mars/Base')).toBe('Sun, Nov 1 · 09:20 UTC');
    expect(formatDeparture('2026-11-01T09:20:00.000Z', null)).toBe('Sun, Nov 1 · 09:20 UTC');
  });
  it('no time, no line', () => {
    expect(formatDeparture('nonsense', 'UTC')).toBeNull();
  });
});

describe('genericObject', () => {
  const o = genericObject(full, 'Europe/Amsterdam') as Record<string, any>;
  it('identifies the pass and its class', () => {
    expect(o.id).toBe(`${ISSUER_ID}.bp_p1`);
    expect(o.classId).toBe(CLASS_ID);
    expect(o.state).toBe('ACTIVE');
  });
  it('route as the header, flight as the subheader', () => {
    expect(o.header.defaultValue.value).toBe('Amsterdam → London');
    expect(o.subheader.defaultValue.value).toBe('KL1357');
    expect(o.cardTitle.defaultValue.value).toBe('Supernova');
  });
  it('the details that matter at the airport', () => {
    expect(mod(o, 'departs').body).toBe('Sun, Nov 1 · 10:20');
    expect(mod(o, 'seat').body).toBe('14A');
    expect(mod(o, 'gate').body).toBe('D7');
    expect(mod(o, 'terminal').body).toBe('2');
    expect(mod(o, 'group').body).toBe('3');
  });
  it('the real barcode format', () => {
    expect(o.barcode).toEqual({ type: 'PDF_417', value: full.barcode });
    expect((genericObject({ ...full, barcodeFormat: 'aztec' }, null) as any).barcode.type).toBe('AZTEC');
    expect((genericObject({ ...full, barcodeFormat: 'weird' }, null) as any).barcode.type).toBe('QR_CODE');
    expect((genericObject({ ...full, barcode: undefined }, null) as any).barcode).toBeUndefined();
  });
  it('leaves out what it does not know', () => {
    const bare = genericObject({ id: 'p2', flightNumber: 'BA1', origin: 'LHR', destination: 'JFK' }, null) as any;
    expect(bare.header.defaultValue.value).toBe('LHR → JFK');
    expect(bare.textModulesData.map((m: any) => m.id)).toEqual([]);
    expect(JSON.stringify(bare)).not.toMatch(/undefined|null/);
  });
  it('a status line once checked live', () => {
    expect(mod(genericObject({ ...full, liveCheckedAtMs: 1 }, null) as any, 'status').body).toBe('On time');
    expect(mod(genericObject({ ...full, delayMinutes: 45, liveDepartureLocal: '14:35' }, null) as any, 'status').body).toBe('Delayed 45 min · 14:35');
  });
  it('expires a day after departure', () => {
    expect(o.validTimeInterval).toEqual({ end: { date: '2026-11-02T09:20:00.000Z' } });
  });
  it('never carries personal fields', () => {
    const j = JSON.stringify(genericObject({ ...full, notes: 'secret', ownerUid: 'u1', recordLocator: 'ABC123' } as never, null));
    expect(j).not.toMatch(/secret|u1|recordLocator|notes/);
  });
});

describe('class and save link', () => {
  it('a generic class with our id', () => {
    expect(genericClass()).toEqual({ id: CLASS_ID });
  });
  it('save-to-wallet claims, valid one hour', () => {
    const c = saveJwtClaims({ id: 'x' }, 1000) as any;
    expect(c).toEqual({ iss: WALLET_SERVICE_ACCOUNT, aud: 'google', typ: 'savetowallet', iat: 1000, exp: 4600, origins: [], payload: { genericObjects: [{ id: 'x' }] } });
  });
});

describe('inactiveObject (final review)', () => {
  it('a deleted pass keeps nothing personal in Google Wallet — no barcode, no details', () => {
    const o = inactiveObject('p1') as Record<string, any>;
    expect(o).toEqual({ id: `${ISSUER_ID}.bp_p1`, classId: CLASS_ID, state: 'INACTIVE', cardTitle: { defaultValue: { language: 'en-US', value: 'Supernova' } }, header: { defaultValue: { language: 'en-US', value: 'Boarding pass removed' } } });
  });
});
