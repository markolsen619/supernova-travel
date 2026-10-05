import { aiTripLengthAllowed, MAX_AI_TRIP_DAYS } from '../../functions/src/quotaUtils';
import { MAX_AI_TRIP_DAYS as CLIENT_MAX } from '@/utils/aiTripLength';

describe('AI trip length', () => {
  it('allows up to three weeks', () => {
    expect(MAX_AI_TRIP_DAYS).toBe(21);
    expect(aiTripLengthAllowed(1)).toBe(true);
    expect(aiTripLengthAllowed(19)).toBe(true); // Nov 17 – Dec 5
    expect(aiTripLengthAllowed(21)).toBe(true);
  });
  it('refuses longer, empty or nonsense lengths', () => {
    expect(aiTripLengthAllowed(22)).toBe(false);
    expect(aiTripLengthAllowed(0)).toBe(false);
    expect(aiTripLengthAllowed(Number.NaN)).toBe(false);
    expect(aiTripLengthAllowed(2.5)).toBe(false);
  });
  it('the form offers exactly what the server accepts', () => {
    expect(CLIENT_MAX).toBe(MAX_AI_TRIP_DAYS);
  });
});
