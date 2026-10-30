import { daysBetween, homeTrips, tripSpan } from '@/utils/homeState';

const ts = (iso: string) => ({ toDate: () => new Date(`${iso}T12:00:00`) });
const trip = (id: string, start: string | null, end: string | null) => ({ id, startDay: start, startDate: start ? ts(start) : null, endDate: end ? ts(end) : null });
const TODAY = '2026-10-29';

describe('tripSpan', () => {
  it('trusts startDay, else startDate; end from endDate, else the start', () => {
    expect(tripSpan(trip('a', '2026-11-18', '2026-11-24'))).toEqual({ start: '2026-11-18', end: '2026-11-24' });
    expect(tripSpan({ startDay: null, startDate: ts('2026-11-18'), endDate: null })).toEqual({ start: '2026-11-18', end: '2026-11-18' });
    expect(tripSpan({ startDay: 'garbage', startDate: ts('2026-11-18'), endDate: ts('2026-11-20') })).toEqual({ start: '2026-11-18', end: '2026-11-20' });
    expect(tripSpan({})).toEqual({ start: null, end: null });
  });
});

describe('homeTrips', () => {
  it('on a trip today: Today card, upcoming soonest first, undated last, past dropped', () => {
    const h = homeTrips([
      trip('past', '2026-09-01', '2026-09-05'),
      trip('later', '2027-02-01', '2027-02-10'),
      trip('undated', null, null),
      trip('now', '2026-10-27', '2026-11-02'),
      trip('soon', '2026-11-18', '2026-11-24'),
    ], TODAY);
    expect(h.today?.id).toBe('now');
    expect(h.next).toBeNull();
    expect(h.comingUp.map((t) => t.id)).toEqual(['soon', 'later', 'undated']);
    expect(h.showInspired).toBe(false);
  });
  it('not travelling: the soonest dated trip is next; Get inspired with 0 or 1 ahead', () => {
    const one = homeTrips([trip('soon', '2026-11-18', '2026-11-24')], TODAY);
    expect(one.next?.id).toBe('soon');
    expect(one.comingUp).toEqual([]);
    expect(one.showInspired).toBe(true);
    const two = homeTrips([trip('soon', '2026-11-18', '2026-11-24'), trip('later', '2027-02-01', '2027-02-10')], TODAY);
    expect(two.next?.id).toBe('soon');
    expect(two.comingUp.map((t) => t.id)).toEqual(['later']);
    expect(two.showInspired).toBe(false);
  });
  it('a trip ending today is still today; one that ended yesterday is past', () => {
    expect(homeTrips([trip('a', '2026-10-25', TODAY)], TODAY).today?.id).toBe('a');
    expect(homeTrips([trip('a', '2026-10-25', '2026-10-28')], TODAY).isEmpty).toBe(true);
  });
  it('two trips overlapping today: the one that started most recently is today', () => {
    const h = homeTrips([trip('long', '2026-10-01', '2026-11-30'), trip('weekend', '2026-10-28', '2026-10-30')], TODAY);
    expect(h.today?.id).toBe('weekend');
    expect(h.comingUp.map((t) => t.id)).toEqual(['long']);
  });
  it('only undated trips: no big card, they are coming up', () => {
    const h = homeTrips([trip('u', null, null)], TODAY);
    expect(h.today).toBeNull();
    expect(h.next).toBeNull();
    expect(h.comingUp.map((t) => t.id)).toEqual(['u']);
    expect(h.isEmpty).toBe(false);
    expect(h.showInspired).toBe(true);
  });
  it('nothing ahead: empty, with Get inspired', () => {
    expect(homeTrips([], TODAY)).toEqual({ today: null, next: null, comingUp: [], showInspired: true, isEmpty: true });
  });
});

it('daysBetween', () => {
  expect(daysBetween('2026-10-27', '2026-10-29')).toBe(2);
  expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2); // across a daylight-saving change
});
