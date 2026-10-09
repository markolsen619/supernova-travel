import { loyaltyFromParse, matchLoyalty, loyaltyWrite, looksLikeLoyalty, loyaltyPushCopy, mixedPushCopy } from '../../functions/src/loyaltyImport';

const ctx = { uid: 'mark', emailImportId: 'imp1', nowIso: '2026-10-08T18:00:00.000Z' };
const delta = { kind: 'loyalty', fields: { programName: 'Delta SkyMiles', programType: 'airline', memberNumber: '••••4821',
  balance: 45210, unit: 'miles', tier: 'silver', expiryDate: null, statementDate: '2026-10-01' } };

describe('loyaltyFromParse', () => {
  it('reads a statement into an update', () => {
    const [u] = loyaltyFromParse({ bookings: [delta] });
    expect(u).toMatchObject({ programName: 'Delta SkyMiles', programType: 'airline', balance: 45210, unit: 'miles',
      tier: 'silver', memberNumber: '••••4821', masked: true, statementDate: '2026-10-01' });
  });
  it('accepts balances written as text with separators', () => {
    expect(loyaltyFromParse({ bookings: [{ ...delta, fields: { ...delta.fields, balance: '45,210' } }] })[0].balance).toBe(45210);
  });
  it('keeps types, units and tiers to values shipped apps know', () => {
    const [u] = loyaltyFromParse({ bookings: [{ kind: 'loyalty', fields: { programName: 'Hilton Honors', programType: 'hotel_chain',
      balance: 12000, unit: 'credits', tier: 'titanium' } }] });
    expect(u).toMatchObject({ programType: 'other', unit: 'points' });
    expect(u.tier).toBeUndefined();
  });
  it('drops entries without a name or a usable balance, and caps the list', () => {
    expect(loyaltyFromParse({ bookings: [{ kind: 'loyalty', fields: { balance: 5 } }] })).toEqual([]);
    expect(loyaltyFromParse({ bookings: [{ kind: 'loyalty', fields: { programName: 'X', balance: -3 } }] })).toEqual([]);
    expect(loyaltyFromParse({ bookings: Array(9).fill(delta) })).toHaveLength(3);
  });
  it('ignores bookings', () => {
    expect(loyaltyFromParse({ bookings: [{ kind: 'reservation', fields: { title: 'Hotel' } }] })).toEqual([]);
  });
});

describe('matchLoyalty', () => {
  const programs = [
    { id: 'a', programName: 'Delta SkyMiles', memberNumber: '9012344821' },
    { id: 'b', programName: 'Marriott Bonvoy', memberNumber: '' },
    { id: 'c', programName: 'United MileagePlus', memberNumber: 'XK123456' },
  ];
  const upd = (o: object) => ({ ...loyaltyFromParse({ bookings: [delta] })[0], ...o });
  it('matches a masked number on its last digits', () => {
    expect(matchLoyalty(upd({}), programs)).toBe('a');
  });
  it('matches a full number ignoring spaces and case', () => {
    expect(matchLoyalty(upd({ programName: 'Mileage Plus', memberNumber: 'xk 123 456', masked: false }), programs)).toBe('c');
  });
  it('falls back to the one program with that name', () => {
    expect(matchLoyalty(upd({ programName: 'Marriott Bonvoy', memberNumber: undefined, masked: false }), programs)).toBe('b');
  });
  it('does not guess between two programs with the same name', () => {
    const two = [...programs, { id: 'd', programName: 'Marriott Bonvoy', memberNumber: '' }];
    expect(matchLoyalty(upd({ programName: 'Marriott Bonvoy', memberNumber: undefined, masked: false }), two)).toBeNull();
  });
  it('does not take a different number under the same name', () => {
    expect(matchLoyalty(upd({ memberNumber: '••••9999' }), programs)).toBeNull();
  });
});

describe('loyaltyWrite', () => {
  const u = loyaltyFromParse({ bookings: [delta] })[0];
  it('creates a program when nothing matched', () => {
    const w = loyaltyWrite(u, null, ctx)!;
    expect(w.create).toBe(true);
    expect(w.data).toMatchObject({ ownerUid: 'mark', programName: 'Delta SkyMiles', balance: 45210, unit: 'miles',
      isManual: false, source: 'email', balanceAsOf: '2026-10-01', createdAt: ctx.nowIso });
  });
  it('updates the balance and keeps a full number over a masked one', () => {
    const w = loyaltyWrite(u, { memberNumber: '9012344821', balanceAsOf: '2026-09-01' }, ctx)!;
    expect(w.create).toBe(false);
    expect(w.data).toMatchObject({ balance: 45210, tier: 'silver', balanceAsOf: '2026-10-01', emailImportId: 'imp1' });
    expect(w.data).not.toHaveProperty('memberNumber');
    expect(w.data).not.toHaveProperty('createdAt');
  });
  it('fills in a missing number only with an unmasked one', () => {
    expect(loyaltyWrite({ ...u, memberNumber: '9012344821', masked: false }, { memberNumber: '' }, ctx)!.data.memberNumber).toBe('9012344821');
    expect(loyaltyWrite(u, { memberNumber: '' }, ctx)!.data).not.toHaveProperty('memberNumber');
  });
  it('never lets an older statement overwrite a newer balance', () => {
    expect(loyaltyWrite({ ...u, statementDate: '2026-08-01' }, { balanceAsOf: '2026-10-01' }, ctx)).toBeNull();
  });
  it('dates an undated statement by the day it arrived', () => {
    expect(loyaltyWrite({ ...u, statementDate: undefined }, null, ctx)!.data.balanceAsOf).toBe('2026-10-08');
  });
});

describe('looksLikeLoyalty', () => {
  it('spots statements', () => {
    expect(looksLikeLoyalty('Your October SkyMiles statement', '')).toBe(true);
    expect(looksLikeLoyalty('Account summary', 'Your points balance is 12,000')).toBe(true);
    expect(looksLikeLoyalty('Lunch on Friday?', 'see you there')).toBe(false);
  });
});

describe('loyaltyPushCopy', () => {
  it('names the program and the new balance', () => {
    expect(loyaltyPushCopy(loyaltyFromParse({ bookings: [delta] })[0])).toEqual({ title: 'Balance updated', body: 'Delta SkyMiles: 45,210 miles' });
  });
});

describe('a program first saved from a masked number', () => {
  const masked = [{ id: 'a', programName: 'Delta SkyMiles', memberNumber: '••••4821' }];
  const full = { ...loyaltyFromParse({ bookings: [delta] })[0], memberNumber: '9012344821', masked: false };
  it('is the same account when a statement prints the full number', () => {
    expect(matchLoyalty(full, masked)).toBe('a');
  });
  it('takes the full number', () => {
    expect(loyaltyWrite(full, { memberNumber: '••••4821' }, ctx)!.data.memberNumber).toBe('9012344821');
  });
});

describe('mixedPushCopy', () => {
  it('names bookings and balances apart', () => {
    expect(mixedPushCopy(1, 1)).toEqual({ title: 'Added 1 booking to your wallet', body: '1 balance updated too' });
    expect(mixedPushCopy(2, 3)).toEqual({ title: 'Added 2 bookings to your wallet', body: '3 balances updated too' });
  });
});
