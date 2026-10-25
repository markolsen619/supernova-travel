// __tests__/functions/tripItinerary.test.ts
import { ITINERARY_MIN_STOPS, itineraryFlagChange } from '../../functions/src/tripItinerary';

describe('itineraryFlagChange', () => {
  it('a trip becomes a real itinerary at 3 stops', () => {
    expect(ITINERARY_MIN_STOPS).toBe(3);
    expect(itineraryFlagChange(2, 3)).toBe(true);
  });
  it('and stops being one below that', () => {
    expect(itineraryFlagChange(3, 2)).toBe(false);
  });
  it('no write while it stays on the same side (no extra trip writes per stop)', () => {
    expect(itineraryFlagChange(0, 1)).toBeNull();
    expect(itineraryFlagChange(5, 6)).toBeNull();
    expect(itineraryFlagChange(6, 5)).toBeNull();
  });
  it('a count never goes below zero', () => {
    expect(itineraryFlagChange(0, -1)).toBeNull();
  });
});
