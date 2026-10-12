import { DEMO_REVIEW_UID, editorialEyebrow, itineraryPreview, pickCommunityFaces } from '@/utils/onboardingShowcase';

/** A seeded generator, so a "random" draw is the same on every run. */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const face = (uid: string, extra: Partial<Parameters<typeof pickCommunityFaces>[0][number]> = {}) => ({
  uid, name: uid, avatarUrl: `https://x/${uid}.jpg`, ...extra,
});

describe('pickCommunityFaces', () => {
  const pool = Array.from({ length: 20 }, (_, i) => face(`u${i}`));

  it('draws a different set of travelers on different launches', () => {
    const a = pickCommunityFaces(pool, 6, { selfUid: null, random: seeded(1) }).map((f) => f.uid);
    const b = pickCommunityFaces(pool, 6, { selfUid: null, random: seeded(2) }).map((f) => f.uid);
    expect(a).toHaveLength(6);
    expect(new Set(a).size).toBe(6);
    expect(a).not.toEqual(b);
  });

  it('only shows real, public people with a photo — never yourself, the editorial account or the review account', () => {
    const picked = pickCommunityFaces(
      [
        face('me'),
        face('nophoto', { avatarUrl: null }),
        face('private', { isPrivate: true }),
        face('editorial', { isEditorial: true }),
        face('hidden', { moderationHidden: true }),
        face(DEMO_REVIEW_UID),
        face('ok'),
        face('ok'), // the pool is two queries; the same person can be in both
      ],
      6,
      { selfUid: 'me', random: seeded(3) },
    ).map((f) => f.uid);
    expect(picked).toEqual(['ok']);
  });
});

describe('editorialEyebrow', () => {
  const trip = { destination: { name: 'Rome', countryCode: 'IT' }, destinationKeys: ['rome'] };
  it('names the country from the catalog, then the city', () => {
    expect(editorialEyebrow(trip, { rome: 'Italy' })).toBe('ITALY · ROME');
  });
  it('falls back to the country code, then the city alone', () => {
    expect(editorialEyebrow(trip, {})).toBe('IT · ROME');
    expect(editorialEyebrow({ destination: { name: 'Rome', countryCode: null } }, {})).toBe('ROME');
  });
});

describe('itineraryPreview', () => {
  it('shows the first stops of the day with their venue, in order', () => {
    const rows = itineraryPreview([
      { type: 'hotel', title: 'Check into Hotel Artemide', placeName: 'Hotel Artemide', order: 1000 },
      { type: 'activity', title: 'Explore the Colosseum', placeName: 'Colosseum', order: 2000 },
      { type: 'restaurant', title: 'Dinner at Luzzi dal 1945', placeName: null, order: 3000 },
      { type: 'free', title: 'Evening stroll', order: 4000 },
      { type: 'activity', title: 'Trevi Fountain', order: 5000 },
    ]);
    expect(rows.map((r) => r.title)).toEqual([
      'Check into Hotel Artemide', 'Explore the Colosseum', 'Dinner at Luzzi dal 1945', 'Evening stroll',
    ]);
    expect(rows[0].place).toBe('Hotel Artemide');
    expect(rows[2].place).toBeNull();
  });
  it('keeps the plan order even when the stops arrive out of order', () => {
    expect(itineraryPreview([{ type: 'activity', title: 'B', order: 2 }, { type: 'activity', title: 'A', order: 1 }]).map((r) => r.title))
      .toEqual(['A', 'B']);
  });
});
