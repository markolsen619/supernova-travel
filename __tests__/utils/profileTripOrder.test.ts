import { profileTripOrder } from '@/utils/homeState';

const t = (id: string, startDay: string | null, endDay?: string) => ({
  id, startDay, startDate: null,
  endDate: endDay ? { toDate: () => new Date(`${endDay}T12:00:00`) } : null,
});

describe('profileTripOrder (owner, 2026-11-05: like Home)', () => {
  it('Upcoming: the next trip first, then the ones after it, undated last', () => {
    const list = [t('later', '2027-03-01'), t('undated', null), t('next', '2026-12-01'), t('mid', '2027-01-10')];
    expect(profileTripOrder('Upcoming', list).map((x) => x.id)).toEqual(['next', 'mid', 'later', 'undated']);
  });
  it('Past: the most recent first', () => {
    const list = [t('old', '2025-01-01', '2025-01-05'), t('recent', '2026-10-01', '2026-10-05'), t('mid', '2026-03-01', '2026-03-04')];
    expect(profileTripOrder('Past', list).map((x) => x.id)).toEqual(['recent', 'mid', 'old']);
  });
  it('Current: the one that started most recently first, as Home', () => {
    const list = [t('a', '2026-11-01', '2026-11-20'), t('b', '2026-11-04', '2026-11-08')];
    expect(profileTripOrder('Current', list).map((x) => x.id)).toEqual(['b', 'a']);
  });
  it('keeps the input untouched', () => {
    const list = [t('b', '2027-01-01'), t('a', '2026-12-01')];
    profileTripOrder('Upcoming', list);
    expect(list.map((x) => x.id)).toEqual(['b', 'a']);
  });
});
