import { tripStyleLabel } from '@/utils/tripStyle';

describe('tripStyleLabel (the label on trip cards)', () => {
  it('names the first known style', () => {
    expect(tripStyleLabel({ travelStyles: ['cultural', 'foodie'] })).toBe('Cultural');
    expect(tripStyleLabel({ travelStyles: ['relax'] })).toBe('Relaxed');
    expect(tripStyleLabel({ travelStyles: ['party'] })).toBe('Nightlife');
  });
  it('nothing for trips without styles or with unknown ones', () => {
    expect(tripStyleLabel({})).toBeNull();
    expect(tripStyleLabel({ travelStyles: ['spaceflight'] })).toBeNull();
    expect(tripStyleLabel({ travelStyles: 'cultural' })).toBeNull();
  });
});
