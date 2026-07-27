import { Timestamp } from 'firebase/firestore';
import { Trip } from '@/types';
import { selectOnboardingCovers } from '@/hooks/useOnboardingContent';

function makeTrip(overrides: Partial<Trip>): Trip {
  const now = Timestamp.fromDate(new Date());
  return {
    id: 'trip-1',
    authorUid: 'author-1',
    title: 'Sample Trip',
    description: '',
    coverImageUrl: null,
    destination: { name: 'Paris', placeId: null, lat: null, lng: null, countryCode: null },
    additionalDestinations: [],
    startDate: null,
    endDate: null,
    visibility: 'public',
    collaborators: [],
    isAiGenerated: false,
    status: 'planning',
    tags: [],
    likesCount: 0,
    savesCount: 0,
    createdAt: now,
    updatedAt: now,
    budgetAmount: null,
    budgetCurrency: null,
    ...overrides,
  };
}

describe('selectOnboardingCovers', () => {
  it('picks the first trip with a cover photo for exploreCoverUrl', () => {
    const trips = [
      makeTrip({ id: 'a', coverImageUrl: null }),
      makeTrip({ id: 'b', coverImageUrl: 'https://example.com/b.jpg' }),
      makeTrip({ id: 'c', coverImageUrl: 'https://example.com/c.jpg' }),
    ];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBe('https://example.com/b.jpg');
  });

  it('picks the first AI-generated trip with a cover photo for aiCoverUrl', () => {
    const trips = [
      makeTrip({ id: 'a', coverImageUrl: 'https://example.com/a.jpg', isAiGenerated: false }),
      makeTrip({ id: 'b', coverImageUrl: 'https://example.com/b.jpg', isAiGenerated: true }),
    ];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBe('https://example.com/a.jpg');
    expect(result.aiCoverUrl).toBe('https://example.com/b.jpg');
  });

  it('never returns the same trip for both slides, even if the top pick is AI-generated', () => {
    const trips = [
      makeTrip({ id: 'a', coverImageUrl: 'https://example.com/a.jpg', isAiGenerated: true }),
      makeTrip({ id: 'b', coverImageUrl: 'https://example.com/b.jpg', isAiGenerated: true }),
    ];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBe('https://example.com/a.jpg');
    expect(result.aiCoverUrl).toBe('https://example.com/b.jpg');
  });

  it('returns null for either slide when no trips qualify', () => {
    const trips = [makeTrip({ id: 'a', coverImageUrl: null })];
    const result = selectOnboardingCovers(trips);
    expect(result.exploreCoverUrl).toBeNull();
    expect(result.aiCoverUrl).toBeNull();
  });
});
