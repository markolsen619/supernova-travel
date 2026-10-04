import { isValidRequestId, existingTripDecision } from '../../functions/src/generationRequest';

describe('isValidRequestId', () => {
  it('accepts a Firestore auto-id, which becomes the trip id', () => {
    expect(isValidRequestId('aB3dE5gH7jK9mN1pQ3sT')).toBe(true);
  });
  it('refuses anything else, so a request id can never name a path', () => {
    expect(isValidRequestId(undefined)).toBe(false);
    expect(isValidRequestId('')).toBe(false);
    expect(isValidRequestId('short')).toBe(false);
    expect(isValidRequestId('aB3dE5gH7jK9mN1pQ3s/')).toBe(false);
    expect(isValidRequestId('aB3dE5gH7jK9mN1pQ3sT0')).toBe(false);
    expect(isValidRequestId(12345)).toBe(false);
  });
});

describe('existingTripDecision', () => {
  it('no trip yet: generate it', () => {
    expect(existingTripDecision(undefined, 'me')).toBe('create');
  });
  it('my trip already exists for this request: return it, no second generation or quota', () => {
    expect(existingTripDecision({ authorUid: 'me' }, 'me')).toBe('return');
  });
  it("someone else's trip at that id: refuse, never overwrite", () => {
    expect(existingTripDecision({ authorUid: 'other' }, 'me')).toBe('conflict');
  });
});
