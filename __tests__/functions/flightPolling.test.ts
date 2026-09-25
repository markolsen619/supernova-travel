// Relative path, not @/: functions/ is a separate npm package, and
// flightPolling.ts imports no firebase-admin so it can be tested here.
import { flightKey, groupPassesByFlight, shouldPollFlight } from '../../functions/src/flightPolling';

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

describe('shouldPollFlight', () => {
  // The scheduler fires every 30 minutes, so `now` is always near :00 or :30.
  // Back-off is derived from the clock rather than stored per pass — no extra
  // Firestore write per flight per run just to remember the last check.

  it('polls every run inside the final three hours', () => {
    expect(shouldPollFlight(0.5, at('2026-10-15T07:30:00.000Z'))).toBe(true);
    expect(shouldPollFlight(2.9, at('2026-10-15T09:30:00.000Z'))).toBe(true);
  });

  it('polls hourly between three and twelve hours out', () => {
    expect(shouldPollFlight(6, at('2026-10-15T07:00:00.000Z'))).toBe(true);
    expect(shouldPollFlight(6, at('2026-10-15T07:30:00.000Z'))).toBe(false);
  });

  it('polls every four hours beyond twelve hours out', () => {
    expect(shouldPollFlight(20, at('2026-10-15T08:00:00.000Z'))).toBe(true);
    expect(shouldPollFlight(20, at('2026-10-15T09:00:00.000Z'))).toBe(false);
    expect(shouldPollFlight(20, at('2026-10-15T12:00:00.000Z'))).toBe(true);
  });

  it('does not poll a flight that has already departed', () => {
    expect(shouldPollFlight(-0.1, at('2026-10-15T08:00:00.000Z'))).toBe(false);
  });
});
