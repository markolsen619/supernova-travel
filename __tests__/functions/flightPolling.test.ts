// Relative path, not @/: functions/ is a separate npm package, and
// flightPolling.ts imports no firebase-admin so it can be tested here.
import {
  filterPassesForPaidOwners,
  flightKey,
  groupPassesByFlight,
  isPaidTier,
  dueCheckpoint,
} from '../../functions/src/flightPolling';

type Pass = { id: string; flightNumber: string; departureTime: string };

const at = (iso: string) => new Date(iso);

describe('flightKey', () => {
  it('is the same for two passengers on one flight', () => {
    expect(flightKey('TP204', '2026-10-15T09:30:00.000Z')).toBe(
      flightKey('TP204', '2026-10-15T09:30:00.000Z'),
    );
  });

  it('separates the same flight number on different days', () => {
    expect(flightKey('TP204', '2026-10-15T09:30:00.000Z')).not.toBe(
      flightKey('TP204', '2026-10-16T09:30:00.000Z'),
    );
  });

  it('ignores case and spacing in the flight number', () => {
    // Hand-typed boarding passes arrive as "tp 204", "TP204", "Tp-204".
    // Treating those as different flights would defeat the whole point.
    expect(flightKey('tp 204', '2026-10-15T09:30:00.000Z')).toBe(
      flightKey('TP204', '2026-10-15T09:30:00.000Z'),
    );
  });
});

describe('groupPassesByFlight', () => {
  it('collapses passengers on the same flight into one group', () => {
    const passes: Pass[] = [
      { id: 'a', flightNumber: 'TP204', departureTime: '2026-10-15T09:30:00.000Z' },
      { id: 'b', flightNumber: 'TP204', departureTime: '2026-10-15T09:30:00.000Z' },
      { id: 'c', flightNumber: 'BA478', departureTime: '2026-10-15T11:00:00.000Z' },
    ];

    const groups = groupPassesByFlight(passes);

    expect(groups).toHaveLength(2);
    const tp = groups.find((g) => g.flightNumber === 'TP204');
    expect(tp?.passes.map((p) => p.id)).toEqual(['a', 'b']);
  });

  it('carries the departure date each group needs for the API call', () => {
    const groups = groupPassesByFlight([
      { id: 'a', flightNumber: 'TP204', departureTime: '2026-10-15T09:30:00.000Z' },
    ]);

    expect(groups[0].departureDate).toBe('2026-10-15');
  });

  it('returns nothing for no passes', () => {
    expect(groupPassesByFlight([])).toEqual([]);
  });
});

describe('dueCheckpoint', () => {
  const dep = Date.parse('2026-10-15T12:00:00.000Z');
  const arr = Date.parse('2026-10-15T15:00:00.000Z');
  const at = (iso: string) => Date.parse(iso);
  it('checks two hours before departure, in the run that follows that moment', () => {
    expect(dueCheckpoint(dep, arr, at('2026-10-15T10:00:00.000Z'))).toBe('before120');
    expect(dueCheckpoint(dep, arr, at('2026-10-15T10:29:00.000Z'))).toBe('before120');
    expect(dueCheckpoint(dep, arr, at('2026-10-15T10:30:00.000Z'))).toBeNull();
  });
  it('checks 45 minutes before departure', () => {
    expect(dueCheckpoint(dep, arr, at('2026-10-15T11:30:00.000Z'))).toBe('before45');
  });
  it('checks 30 minutes after the scheduled arrival', () => {
    expect(dueCheckpoint(dep, arr, at('2026-10-15T15:30:00.000Z'))).toBe('afterArrival');
  });
  it('without an arrival time only the two departure checks run', () => {
    expect(dueCheckpoint(dep, null, at('2026-10-15T15:30:00.000Z'))).toBeNull();
    expect(dueCheckpoint(dep, NaN, at('2026-10-15T15:30:00.000Z'))).toBeNull();
    expect(dueCheckpoint(dep, null, at('2026-10-15T10:00:00.000Z'))).toBe('before120');
  });
  it('spends nothing between checkpoints', () => {
    for (const iso of ['2026-10-15T08:00:00.000Z', '2026-10-15T11:00:00.000Z', '2026-10-15T13:00:00.000Z']) {
      expect(dueCheckpoint(dep, arr, at(iso))).toBeNull();
    }
  });
  it('a full day of half-hourly runs makes exactly three checks', () => {
    let n = 0;
    for (let t = at('2026-10-15T00:00:00.000Z'); t < at('2026-10-16T00:00:00.000Z'); t += 30 * 60_000) {
      if (dueCheckpoint(dep, arr, t)) n += 1;
    }
    expect(n).toBe(3);
  });
});

describe('isPaidTier', () => {
  it('treats pro and business as paid', () => {
    expect(isPaidTier('pro')).toBe(true);
    expect(isPaidTier('business')).toBe(true);
  });

  it('treats free as unpaid', () => {
    expect(isPaidTier('free')).toBe(false);
  });

  it('treats a missing tier as unpaid', () => {
    // createUserProfile deliberately omits `tier` on new accounts, so an
    // absent field is the normal shape for a free user, not a broken doc.
    expect(isPaidTier(undefined)).toBe(false);
    expect(isPaidTier(null)).toBe(false);
  });

  it('treats an unrecognised tier as unpaid', () => {
    // Fail closed: a typo or a tier this build predates must not hand out
    // a paid feature.
    expect(isPaidTier('platinum')).toBe(false);
  });
});

describe('filterPassesForPaidOwners', () => {
  const passes = [
    { id: 'a', ownerUid: 'paid', flightNumber: 'TP204', departureTime: '2026-10-15T09:30:00.000Z' },
    { id: 'b', ownerUid: 'freeloader', flightNumber: 'TP204', departureTime: '2026-10-15T09:30:00.000Z' },
    { id: 'c', ownerUid: 'unknown', flightNumber: 'BA478', departureTime: '2026-10-15T11:00:00.000Z' },
  ];

  it('keeps only passes owned by paid users', () => {
    const tiers = new Map([['paid', 'pro'], ['freeloader', 'free']]);
    expect(filterPassesForPaidOwners(passes, tiers).map((p) => p.id)).toEqual(['a']);
  });

  it('drops a pass whose owner could not be read', () => {
    // A deleted or unreadable user doc must not cost an API call.
    const tiers = new Map([['paid', 'pro'], ['freeloader', 'free']]);
    expect(filterPassesForPaidOwners(passes, tiers).some((p) => p.id === 'c')).toBe(false);
  });

  it('returns nothing when no owner is paid', () => {
    expect(filterPassesForPaidOwners(passes, new Map([['freeloader', 'free']]))).toEqual([]);
  });
});
