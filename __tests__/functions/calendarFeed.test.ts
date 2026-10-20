// __tests__/functions/calendarFeed.test.ts
import { buildCalendar, escapeText, foldLine, newFeedToken, type CalTrip } from '../../functions/src/calendarFeed';

const now = new Date('2026-10-19T12:00:00Z');
const day = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const unfold = (ics: string) => ics.replace(/\r\n /g, '');
const events = (ics: string) => unfold(ics).split('BEGIN:VEVENT').slice(1);

const trip = (over: Partial<CalTrip> = {}): CalTrip => ({
  id: 't1', title: 'Lisbon', region: 'Portugal', startDateMs: day('2026-11-02'), endDateMs: day('2026-11-04'), startDay: '2026-11-02',
  days: [
    { id: 'd1', dayNumber: 1, dateMs: null, city: 'Lisbon', stops: [{ id: 's1', title: 'Belém Tower', order: 0 }, { id: 's2', title: 'Dinner, Time Out', startTime: '19:30', order: 1 }] },
    { id: 'd2', dayNumber: 2, dateMs: null, city: 'Sintra', stops: [] },
  ],
  ...over,
});

describe('buildCalendar', () => {
  it('wraps events in a VCALENDAR with CRLF line endings', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [] }, now);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('writes flights in UTC with a 2-hour default when there is no arrival', () => {
    const ics = buildCalendar({ trips: [], reservations: [], passes: [
      { id: 'p1', airline: 'BA', flightNumber: 'BA117', origin: 'LHR', destination: 'JFK', departureTime: '2026-11-01T09:20:00+00:00', seat: '14A', gate: 'B3' },
    ] }, now);
    const [ev] = events(ics);
    expect(ev).toContain('UID:flight-p1@supernovatravel.app');
    expect(ev).toContain('DTSTART:20261101T092000Z');
    expect(ev).toContain('DTEND:20261101T112000Z');
    expect(ev).toContain('SUMMARY:BA117 · LHR → JFK');
    expect(ev).toContain('Seat 14A');
  });

  it('writes hotels as all-day with an exclusive end', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [
      { id: 'r1', type: 'hotel', title: 'Pestana', checkIn: '2026-11-02', checkOut: '2026-11-04' },
    ] }, now);
    const [ev] = events(ics);
    expect(ev).toContain('DTSTART;VALUE=DATE:20261102');
    expect(ev).toContain('DTEND;VALUE=DATE:20261104');
    expect(ev).toContain('SUMMARY:Hotel: Pestana');
  });

  it('writes restaurant times as floating local times, all-day without a time', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [
      { id: 'r2', type: 'restaurant', title: 'Cervejaria', checkIn: '2026-11-03', time: '19:30' },
      { id: 'r3', type: 'activity', title: 'Tram tour', checkIn: '2026-11-03' },
    ] }, now);
    const [a, b] = events(ics);
    expect(a).toContain('DTSTART:20261103T193000\r\n');
    expect(a).toContain('DTEND:20261103T213000\r\n');
    expect(b).toContain('DTSTART;VALUE=DATE:20261103');
  });

  it('writes train tickets by their printed departure time', () => {
    const ics = buildCalendar({ trips: [], passes: [], reservations: [
      { id: 'r4', type: 'activity', transitMode: 'train', title: 'Lisbon → Porto', checkIn: '2026-11-04', departureLocalTime: '09:19' },
    ] }, now);
    expect(events(ics)[0]).toContain('DTSTART:20261104T091900\r\n');
  });

  it('writes the trip span, one event per day listing its stops, and timed stops', () => {
    const ics = buildCalendar({ trips: [trip()], passes: [], reservations: [] }, now);
    const evs = events(ics);
    const tripEv = evs.find((e) => e.includes('UID:trip-t1@'))!;
    expect(tripEv).toContain('DTSTART;VALUE=DATE:20261102');
    expect(tripEv).toContain('DTEND;VALUE=DATE:20261105');
    const d1 = evs.find((e) => e.includes('UID:day-d1@'))!;
    expect(d1).toContain('SUMMARY:Day 1 · Lisbon');
    expect(d1).toContain('Belém Tower\\nDinner\\, Time Out');
    const d2 = evs.find((e) => e.includes('UID:day-d2@'))!;
    expect(d2).toContain('DTSTART;VALUE=DATE:20261103');
    const s2 = evs.find((e) => e.includes('UID:stop-s2@'))!;
    expect(s2).toContain('DTSTART:20261102T193000\r\n');
    expect(s2).toContain('DTEND:20261102T203000\r\n');
    expect(evs.find((e) => e.includes('UID:stop-s1@'))).toBeUndefined();
  });

  it('skips trips with no dates and days it cannot date', () => {
    const ics = buildCalendar({ trips: [trip({ startDateMs: null, endDateMs: null, startDay: null })], passes: [], reservations: [] }, now);
    expect(events(ics)).toHaveLength(0);
  });

  it('honours type switches and the per-booking switch', () => {
    const input = {
      trips: [trip()],
      passes: [{ id: 'p1', flightNumber: 'BA1', departureTime: '2026-11-01T09:00:00Z' }, { id: 'p2', flightNumber: 'BA2', departureTime: '2026-11-01T09:00:00Z', showInCalendar: false }],
      reservations: [{ id: 'r1', type: 'hotel', title: 'H', checkIn: '2026-11-02', checkOut: '2026-11-03' }],
    };
    const all = unfold(buildCalendar(input, now));
    expect(all).toContain('flight-p1@');
    expect(all).not.toContain('flight-p2@');
    const noFlights = unfold(buildCalendar({ ...input, types: { flights: false, tripDays: false } }, now));
    expect(noFlights).not.toContain('flight-p1@');
    expect(noFlights).not.toContain('trip-t1@');
    expect(noFlights).toContain('res-r1@');
  });

  it('leaves out anything that ended more than 30 days ago', () => {
    const ics = buildCalendar({ trips: [], reservations: [], passes: [
      { id: 'old', flightNumber: 'X1', departureTime: '2026-08-01T09:00:00Z' },
      { id: 'recent', flightNumber: 'X2', departureTime: '2026-10-01T09:00:00Z' },
    ] }, now);
    expect(ics).not.toContain('flight-old@');
    expect(ics).toContain('flight-recent@');
  });

  it('never writes codes or booking references', () => {
    const ics = buildCalendar({ trips: [], passes: [
      { id: 'p1', flightNumber: 'BA1', departureTime: '2026-11-01T09:00:00Z', ...( { barcode: 'M1SECRET', confirmationCode: 'ABC123' } as object) },
    ], reservations: [{ id: 'r1', type: 'hotel', title: 'H', checkIn: '2026-11-02', checkOut: '2026-11-03', ...( { confirmationCode: 'XYZ789', address: '1 Rua' } as object) }] }, now);
    expect(ics).not.toMatch(/SECRET|ABC123|XYZ789|1 Rua/);
  });
});

describe('escapeText / foldLine', () => {
  it('escapes backslash, semicolon, comma and newlines', () => {
    expect(escapeText('a\\b;c,d\ne')).toBe('a\\\\b\\;c\\,d\\ne');
  });
  it('folds long lines at 75 octets without splitting a multi-byte character', () => {
    const line = `SUMMARY:${'é'.repeat(100)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(Buffer.byteLength(part, 'utf8')).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('newFeedToken', () => {
  it('is 24 lowercase letters or digits', () => {
    expect(newFeedToken()).toMatch(/^[a-z0-9]{24}$/);
  });
});
