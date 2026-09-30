import { displayStatus, STATUS_LABEL } from '@/utils/tripStatus';

const d = (m: number, day: number, h = 12) => new Date(2026, m - 1, day, h);

describe('displayStatus', () => {
  const trip = { status: 'planning' as const, startDate: d(10, 15, 0), endDate: d(10, 21, 0) };

  it('is upcoming before the first day', () => {
    expect(displayStatus(trip, d(10, 14, 23))).toBe('planning');
  });

  it('is live from the first day through the last, whatever was stored', () => {
    expect(displayStatus(trip, d(10, 15, 0))).toBe('active');
    expect(displayStatus(trip, d(10, 18))).toBe('active');
    // Late evening of the last day is still the trip.
    expect(displayStatus(trip, d(10, 21, 23))).toBe('active');
  });

  it('is completed once the last day is over', () => {
    expect(displayStatus(trip, d(10, 22, 0))).toBe('completed');
  });

  it('keeps a trip marked completed early as completed', () => {
    expect(displayStatus({ ...trip, status: 'completed' }, d(10, 18))).toBe('completed');
  });

  it('falls back to the stored status without dates', () => {
    expect(displayStatus({ status: 'active', startDate: null, endDate: null }, d(10, 18))).toBe('active');
    expect(displayStatus({ status: 'planning', startDate: d(10, 15), endDate: null }, d(10, 18))).toBe('planning');
  });

  it('treats a missing stored status as planning', () => {
    expect(displayStatus({ startDate: null, endDate: null }, d(10, 18))).toBe('planning');
  });
});

describe('STATUS_LABEL', () => {
  it('reads Upcoming, Live and Completed', () => {
    expect(STATUS_LABEL).toEqual({ planning: 'Upcoming', active: 'Live', completed: 'Completed' });
  });
});
