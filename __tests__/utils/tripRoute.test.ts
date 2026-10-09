import {
  cityRanges, nightsFromDays, evenNights, routeNights, planRoute, endDateFor, absorbEndDateChange,
  bookingCityIndex, citySummary, moveRow, setRowNights, removeRow, addRow, rowsToEntries, routeDatesLine, dropsWarning, routeLayout, type RouteDay,
} from '@/utils/tripRoute';

describe('cityRanges', () => {
  it('gives each city its dates and day numbers; the last city keeps the departure day', () => {
    const r = cityRanges([3, 2, 1], '2026-11-18');
    expect(r).toEqual([
      { index: 0, nights: 3, firstDay: 1, lastDay: 3, arrive: '2026-11-18', leave: '2026-11-21' },
      { index: 1, nights: 2, firstDay: 4, lastDay: 5, arrive: '2026-11-21', leave: '2026-11-23' },
      { index: 2, nights: 1, firstDay: 6, lastDay: 7, arrive: '2026-11-23', leave: '2026-11-24' },
    ]);
  });
  it('works on day numbers alone for a trip without dates', () => {
    expect(cityRanges([2, 1], null)[1]).toEqual({ index: 1, nights: 1, firstDay: 3, lastDay: 4, arrive: null, leave: null });
  });
  it('crosses month ends', () => {
    expect(cityRanges([3], '2026-11-29')[0].leave).toBe('2026-12-02');
  });
});

describe('nights for a trip saved before nights existed', () => {
  it('counts each city’s days (the last city’s last day is departure)', () => {
    expect(nightsFromDays([0, 0, 0, 1, 1, 2, 2], 3)).toEqual([3, 2, 1]);
  });
  it('never gives a city fewer than one night', () => {
    expect(nightsFromDays([0, 0, 0], 3)).toEqual([3, 1, 1]);
  });
  it('splits a date range evenly, remainder to the earlier cities', () => {
    expect(evenNights(17, 7)).toEqual([3, 3, 3, 2, 2, 2, 2]);
    expect(evenNights(2, 4)).toEqual([1, 1, 1, 1]);
  });
  it('prefers saved nights, then days, then the trip’s dates', () => {
    expect(routeNights({ nights: [2, 3], dayCities: [0, 0, 0, 0], start: '2026-11-18', end: '2026-12-05' })).toEqual([2, 3]);
    expect(routeNights({ nights: [null, null], dayCities: [0, 0, 1, 1], start: null, end: null })).toEqual([2, 1]);
    expect(routeNights({ nights: [null, null, null], dayCities: [], start: '2026-11-18', end: '2026-12-05' })).toEqual([6, 6, 5]);
    expect(routeNights({ nights: [null, null], dayCities: [], start: null, end: null })).toEqual([1, 1]);
  });
});

const day = (id: string, dayNumber: number, city: number, stops = 0): RouteDay => ({ id, dayNumber, city, stops });

describe('planRoute', () => {
  // Prague 2 nights (days 1–2), Vienna 1 night + departure (days 3–4)
  const days = [day('p1', 1, 0, 2), day('p2', 2, 0), day('v1', 3, 1, 1), day('v2', 4, 1)];

  it('lengthening a city adds empty days to it and shifts the rest', () => {
    const p = planRoute(days, [{ from: 0, nights: 3 }, { from: 1, nights: 1 }]);
    expect(p.creates).toEqual([{ dayNumber: 3, city: 0 }]);
    expect(p.updates).toEqual([{ id: 'v1', dayNumber: 4, city: 1 }, { id: 'v2', dayNumber: 5, city: 1 }]);
    expect(p.deletes).toEqual([]);
  });

  it('shortening drops the city’s last days and reports the ones with stops', () => {
    const p = planRoute(days, [{ from: 0, nights: 1 }, { from: 1, nights: 1 }]);
    expect(p.deletes).toEqual(['p2']);
    expect(p.dropsWithStops).toEqual([]);
    const q = planRoute([day('p1', 1, 0), day('p2', 2, 0, 3), day('v1', 3, 1), day('v2', 4, 1)], [{ from: 0, nights: 1 }, { from: 1, nights: 1 }]);
    expect(q.dropsWithStops.map((d) => d.id)).toEqual(['p2']);
  });

  it('reordering keeps every day with its own city', () => {
    const p = planRoute(days, [{ from: 1, nights: 1 }, { from: 0, nights: 2 }]);
    // Vienna first: its two days become 1 night (v1) — v2 (empty) dropped; Prague last gets 2 nights + departure.
    expect(p.updates).toContainEqual({ id: 'v1', dayNumber: 1, city: 0 });
    expect(p.updates).toContainEqual({ id: 'p1', dayNumber: 2, city: 1 });
    expect(p.updates).toContainEqual({ id: 'p2', dayNumber: 3, city: 1 });
    expect(p.deletes).toEqual(['v2']);
    expect(p.creates).toEqual([{ dayNumber: 4, city: 1 }]);
  });

  it('a removed city’s days are deleted, or moved into the next city', () => {
    const three = [...days.slice(0, 3), day('v2', 4, 1), day('s1', 5, 2), day('s2', 6, 2)];
    const del = planRoute(three, [{ from: 0, nights: 2 }, { from: 2, nights: 1 }]);
    expect(del.deletes.sort()).toEqual(['v1', 'v2']);
    expect(del.dropsWithStops.map((d) => d.id)).toEqual(['v1']);
    const move = planRoute(three, [{ from: 0, nights: 2 }, { from: 2, nights: 3, absorbs: [1] }]);
    expect(move.deletes).toEqual([]);
    // v1 is still day 3 of the city at index 1 (now Salzburg), so it needs no write.
    expect(move.updates.find((u) => u.id === 'v1')).toBeUndefined();
    expect(move.updates).toContainEqual({ id: 's2', dayNumber: 6, city: 1 });
    expect(move.updates).toContainEqual({ id: 's1', dayNumber: 5, city: 1 });
  });

  it('the last city’s days move back into the one before it, after its own days', () => {
    const p = planRoute(days, [{ from: 0, nights: 3, absorbsAfter: [1] }]);
    expect(p.deletes).toEqual([]);
    expect(p.updates).toEqual([{ id: 'v1', dayNumber: 3, city: 0 }, { id: 'v2', dayNumber: 4, city: 0 }]);
  });

  it('a new city gets fresh days', () => {
    const p = planRoute(days, [{ from: 0, nights: 2 }, { from: 1, nights: 1 }, { from: null, nights: 1 }]);
    // Vienna loses its departure day (no longer last): v2 is empty, so dropped; the new city gets 2 days.
    expect(p.deletes).toEqual(['v2']);
    expect(p.creates).toEqual([{ dayNumber: 4, city: 2 }, { dayNumber: 5, city: 2 }]);
  });

  it('numbers days 1…N with no gaps', () => {
    const p = planRoute(days, [{ from: 1, nights: 2 }, { from: 0, nights: 1 }]);
    const numbers = [...p.updates.map((u) => u.dayNumber), ...p.creates.map((c) => c.dayNumber),
      ...days.filter((d) => !p.deletes.includes(d.id) && !p.updates.some((u) => u.id === d.id)).map((d) => d.dayNumber)].sort((a, b) => a - b);
    expect(numbers).toEqual([1, 2, 3, 4]); // 3 nights → 4 days
  });

  it('keeps an untouched route untouched', () => {
    const p = planRoute(days, [{ from: 0, nights: 2 }, { from: 1, nights: 1 }]);
    expect(p).toEqual({ creates: [], updates: [], deletes: [], dropsWithStops: [] });
  });
});

describe('dates', () => {
  it('ends the trip after its nights', () => {
    expect(endDateFor('2026-11-18', 17)).toBe('2026-12-05');
  });
  it('a new end date lengthens or shortens the last city', () => {
    expect(absorbEndDateChange([3, 2, 2], '2026-11-18', '2026-11-27')).toEqual([3, 2, 4]);
    expect(absorbEndDateChange([3, 2, 2], '2026-11-18', '2026-11-20')).toEqual([3, 2, 1]);
  });
});

describe('bookingCityIndex', () => {
  const ranges = cityRanges([3, 2, 2], '2026-11-18');
  const names = ['Prague', 'Vienna', 'München'];
  it('places a booking by its city, accent- and case-insensitive', () => {
    expect(bookingCityIndex({ city: 'MUNCHEN', date: null }, names, ranges)).toBe(2);
    expect(bookingCityIndex({ city: 'Vienna, Austria', date: null }, names, ranges)).toBe(1);
  });
  it('falls back to its date', () => {
    expect(bookingCityIndex({ city: 'Somewhere', date: '2026-11-22' }, names, ranges)).toBe(1);
    expect(bookingCityIndex({ city: null, date: '2026-12-25' }, names, ranges)).toBeNull();
  });
});

describe('citySummary', () => {
  it('folds a city into one line', () => {
    expect(citySummary({ days: 3, stops: 12, staying: true })).toBe('3 days · 12 stops · hotel booked');
    expect(citySummary({ days: 1, stops: 1, staying: false })).toBe('1 day · 1 stop');
    expect(citySummary({ days: 2, stops: 0, staying: false })).toBe('2 days · nothing planned yet');
  });
});

describe('route editor operations', () => {
  const rows = () => [
    { key: 'a', from: 0, nights: 3, absorbs: [], absorbsAfter: [], place: 'Prague' },
    { key: 'b', from: 1, nights: 2, absorbs: [], absorbsAfter: [], place: 'Vienna' },
    { key: 'c', from: 2, nights: 2, absorbs: [], absorbsAfter: [], place: 'Munich' },
  ];
  it('moves a city and keeps nights within 1–60', () => {
    expect(moveRow(rows(), 2, -1).map((r) => r.place)).toEqual(['Prague', 'Munich', 'Vienna']);
    expect(moveRow(rows(), 0, -1).map((r) => r.place)).toEqual(['Prague', 'Vienna', 'Munich']);
    expect(setRowNights(rows(), 1, 0)[1].nights).toBe(1);
    expect(setRowNights(rows(), 1, 99)[1].nights).toBe(60);
  });
  it('removing a city hands its days and nights to the next city', () => {
    const r = removeRow(rows(), 1, 'move');
    expect(r.map((x) => x.place)).toEqual(['Prague', 'Munich']);
    expect(r[1]).toMatchObject({ nights: 4, absorbs: [1] });
  });
  it('removing the last city hands them back to the one before', () => {
    const r = removeRow(rows(), 2, 'move');
    expect(r[1]).toMatchObject({ place: 'Vienna', nights: 4, absorbsAfter: [2] });
  });
  it('removing to delete just drops the city', () => {
    expect(removeRow(rows(), 1, 'delete').map((x) => x.nights)).toEqual([3, 2]);
  });
  it('carries cities already absorbed', () => {
    const r = removeRow(removeRow(rows(), 0, 'move'), 0, 'move');
    expect(r[0]).toMatchObject({ place: 'Munich', nights: 7, absorbs: [0, 1] });
  });
  it('adds a city at the end with one night, and turns rows into a plan', () => {
    const r = addRow(rows(), 'Amsterdam', 'd');
    expect(r[3]).toMatchObject({ from: null, nights: 1, place: 'Amsterdam' });
    expect(rowsToEntries(r)[3]).toEqual({ from: null, nights: 1, absorbs: [], absorbsAfter: [] });
  });
});

describe('route editor copy', () => {
  it('sums the route into its dates', () => {
    expect(routeDatesLine('2026-11-18', [3, 3, 3, 2, 2, 2, 2])).toBe('Nov 18 – Dec 5 · 17 nights');
    expect(routeDatesLine(null, [2, 1])).toBe('3 nights · no dates yet');
    expect(routeDatesLine('2026-11-18', [1])).toBe('Nov 18 – Nov 19 · 1 night');
  });
  it('names the days that would lose their stops', () => {
    expect(dropsWarning([{ id: 'x', dayNumber: 3, city: 0, stops: 4 }, { id: 'y', dayNumber: 9, city: 2, stops: 1 }], ['Prague', 'Vienna', 'Munich']))
      .toBe('Day 3 in Prague (4 stops) and Day 9 in Munich (1 stop) will be deleted with everything on them.');
  });
});

describe('review fixes', () => {
  it('writes the city onto a kept day whose stored city was missing (one null day turns off every explicit city)', () => {
    const p = planRoute([{ id: 'a', dayNumber: 1, city: 0, stops: 0, stored: null }, { id: 'b', dayNumber: 2, city: 0, stops: 0, stored: 0 }], [{ from: 0, nights: 1 }]);
    expect(p.updates).toEqual([{ id: 'a', dayNumber: 1, city: 0 }]);
  });

  it('lays out a trip whose days all sit in the first city by position, keeping its length', () => {
    const l = routeLayout({ nights: [null, null], dayCities: [0, 0, 0, 0, 0], start: null, end: null });
    expect(l.nights).toEqual([2, 2]);
    expect(l.dayCities).toEqual([0, 0, 1, 1, 1]);
    // An untouched save then changes no day count.
    const days = l.dayCities.map((c, i) => ({ id: `d${i}`, dayNumber: i + 1, city: c, stops: 1, stored: 0 }));
    const p = planRoute(days, l.nights.map((n, i) => ({ from: i, nights: n })));
    expect(p.creates).toEqual([]);
    expect(p.deletes).toEqual([]);
  });

  it('keeps days counted per city when they add up', () => {
    expect(routeLayout({ nights: [null, null], dayCities: [0, 0, 1, 1], start: null, end: null }))
      .toEqual({ nights: [2, 1], dayCities: [0, 0, 1, 1] });
  });

  it('a city that stops being last keeps its departure day as a night; the new last city gives one back', () => {
    const rows = [
      { key: 'a', from: 0, nights: 2, absorbs: [], absorbsAfter: [], place: 'Paris' },
      { key: 'b', from: 1, nights: 3, absorbs: [], absorbsAfter: [], place: 'Rome' },
    ];
    expect(moveRow(rows, 1, -1).map((r) => [r.place, r.nights])).toEqual([['Rome', 4], ['Paris', 1]]);
    expect(addRow(rows, 'Florence', 'f').map((r) => r.nights)).toEqual([2, 4, 1]);
    expect(removeRow(rows, 1, 'delete').map((r) => r.nights)).toEqual([1]);
  });

  it('a move conserves every stop', () => {
    const days = [{ id: 'p1', dayNumber: 1, city: 0, stops: 1 }, { id: 'p2', dayNumber: 2, city: 0, stops: 1 },
      { id: 'r1', dayNumber: 3, city: 1, stops: 1 }, { id: 'r2', dayNumber: 4, city: 1, stops: 1 }, { id: 'r3', dayNumber: 5, city: 1, stops: 4 }];
    const rows = moveRow([
      { key: 'a', from: 0, nights: 2, absorbs: [], absorbsAfter: [], place: 'Paris' },
      { key: 'b', from: 1, nights: 2, absorbs: [], absorbsAfter: [], place: 'Rome' },
    ], 1, -1);
    const p = planRoute(days, rowsToEntries(rows));
    expect(p.deletes).toEqual([]);
    expect(p.creates).toEqual([]);
  });

  it('matches whole city names, longest first', () => {
    const ranges = cityRanges([2, 2], '2026-06-01');
    expect(bookingCityIndex({ city: 'Venice', date: null }, ['Nice', 'Venice'], ranges)).toBe(1);
    expect(bookingCityIndex({ city: 'Hotel Danieli, Riva degli Schiavoni, Venice', date: null }, ['Nice', 'Venice'], ranges)).toBe(1);
    expect(bookingCityIndex({ city: 'Frankfurt am Main', date: null }, ['Frankfurt'], cityRanges([1], null))).toBe(0);
  });

  it('a booking dated the trip’s last day can be left out of arrivals (the flight home)', () => {
    const ranges = cityRanges([2, 2], '2026-06-01');
    expect(bookingCityIndex({ city: 'Chicago', date: '2026-06-05' }, ['Paris', 'Rome'], ranges, { departureDay: false })).toBeNull();
    expect(bookingCityIndex({ city: 'Chicago', date: '2026-06-05' }, ['Paris', 'Rome'], ranges)).toBe(1);
  });
});
