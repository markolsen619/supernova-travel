// Relative path: functions/ is a separate package; tripDocs imports no firebase-admin.
import { parseGeneratedTrip, tripDocuments } from '../../functions/src/tripDocs';

const generated = {
  title: 'Lisbon in Three Days',
  description: 'Hills, trams and tiles.',
  days: [
    {
      dayNumber: 1, title: 'Alfama', notes: 'Start slow',
      activities: [
        { type: 'hotel', title: 'Check into Memmo Alfama', address: null, rationale: 'Central', searchQuery: 'Memmo Alfama, Lisbon', startTime: '15:00', endTime: null, notes: 'Views', cost: null, currency: null },
      ],
    },
  ],
};
const request = {
  destination: 'Lisbon', countryCode: 'PT', additionalDestinations: [], startDate: null, endDate: null,
  durationDays: 3, travelStyle: 'cultural', travelStyles: ['cultural'], pace: 'moderate', mustSee: [], preferences: '',
  visibility: 'public',
} as const;

describe('parseGeneratedTrip', () => {
  it('reads plain and fenced JSON', () => {
    expect(parseGeneratedTrip(JSON.stringify(generated))?.title).toBe('Lisbon in Three Days');
    expect(parseGeneratedTrip('```json\n' + JSON.stringify(generated) + '\n```')?.days).toHaveLength(1);
  });

  it('rejects text that is not a usable trip', () => {
    expect(parseGeneratedTrip('Sorry, I cannot help with that.')).toBeNull();
    expect(parseGeneratedTrip(JSON.stringify({ title: 'x' }))).toBeNull();
    expect(parseGeneratedTrip(JSON.stringify({ days: [] }))).toBeNull();
  });
});

describe('tripDocuments', () => {
  const NOW = 'NOW';
  const docs = tripDocuments('u1', request as never, generated as never, NOW);

  it('writes the trip exactly as generateTrip does', () => {
    expect(docs.trip).toMatchObject({
      authorUid: 'u1', title: 'Lisbon in Three Days', visibility: 'public', isAiGenerated: true,
      status: 'planning', collaborators: [], likesCount: 0, savesCount: 0, createdAt: NOW, updatedAt: NOW,
      destination: { name: 'Lisbon', placeId: null, lat: null, lng: null, countryCode: 'PT', bounds: null },
    });
  });

  it('writes each stop ungrounded, with its search query and joined notes', () => {
    const [act] = docs.days[0].activities;
    expect(act).toMatchObject({
      type: 'hotel', title: 'Check into Memmo Alfama', lat: null, lng: null, placeId: null,
      searchQuery: 'Memmo Alfama, Lisbon', notes: 'Central — Views', order: 0, visited: false, groundingFailedAt: null,
    });
  });

  it('merges extra fields into the trip (editorial seeding)', () => {
    const d = tripDocuments('u1', request as never, generated as never, NOW, { isEditorial: true, destinationKeys: ['lisbon'] });
    expect(d.trip).toMatchObject({ isEditorial: true, destinationKeys: ['lisbon'] });
  });
});

describe('tripDocuments with a partial stop', () => {
  it('writes null for fields Gemini left out — Firestore rejects undefined and the trip was left without days', () => {
    const partial = { ...generated, days: [{ dayNumber: 1, title: 'Day', notes: 'n', activities: [{ type: 'activity', title: 'Walk' }] }] };
    const docs = tripDocuments('u1', request as never, partial as never, 'NOW');
    const act = docs.days[0].activities[0];
    for (const [k, v] of Object.entries(act)) expect([k, v]).not.toEqual([k, undefined]);
    expect(act).toMatchObject({ address: null, cost: null, currency: null, startTime: null, endTime: null, searchQuery: null, notes: '' });
  });

  it('writes no undefined anywhere in the trip either', () => {
    const docs = tripDocuments('u1', request as never, { title: 'T', days: [] } as never, 'NOW');
    for (const [k, v] of Object.entries(docs.trip)) expect([k, v]).not.toEqual([k, undefined]);
  });
});

describe('the picked destination place', () => {
  const generated = { title: 'T', days: [] };
  it('keeps the place the traveler picked, so it is never re-guessed from its name', () => {
    // "Washington" alone re-grounded to Washington State.
    const req = { destination: 'Washington D.C.', countryCode: 'US', placeId: 'ChIJW-T2Wt7Gt4kRKl2I1CJFUsI', lat: 38.907, lng: -77.037, additionalDestinations: [] };
    const d = tripDocuments('u1', req as never, generated as never, 'NOW').trip.destination;
    expect(d).toMatchObject({ name: 'Washington D.C.', placeId: 'ChIJW-T2Wt7Gt4kRKl2I1CJFUsI', lat: 38.907, lng: -77.037 });
  });
  it('leaves them empty for a request from an older app, as before', () => {
    const req = { destination: 'Lisbon', countryCode: 'PT', additionalDestinations: [] };
    const d = tripDocuments('u1', req as never, generated as never, 'NOW').trip.destination;
    expect(d).toMatchObject({ placeId: null, lat: null, lng: null });
  });
  it('ignores malformed coordinates', () => {
    const req = { destination: 'X', countryCode: 'US', placeId: 42, lat: 'north', lng: null, additionalDestinations: [] };
    const d = tripDocuments('u1', req as never, generated as never, 'NOW').trip.destination;
    expect(d).toMatchObject({ placeId: null, lat: null, lng: null });
  });
});
