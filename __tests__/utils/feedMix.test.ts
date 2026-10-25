// __tests__/utils/feedMix.test.ts
import { feedTripPool, mixFeed, tripEyebrow, tripTitle, type FeedTrip } from '@/utils/feedMix';

const trip = (id: string, over: Partial<FeedTrip> = {}): FeedTrip => ({
  id, authorUid: 'a', title: `Trip ${id}`, coverImageUrl: 'https://x/c.jpg', destinationName: 'Lisbon', days: 5,
  isEditorial: false, savesCount: 0, createdAtMs: 0, hasItinerary: true, ...over,
});
const post = (id: string, tripId: string | null = null) => ({ id, tripId });
const kinds = (items: { kind: string }[]) => items.map((i) => i.kind[0]).join('');

describe('feedTripPool', () => {
  it('travelers\' trips newest first, then editorial picks by saves', () => {
    const pool = feedTripPool([
      trip('e1', { isEditorial: true, savesCount: 2 }), trip('t1', { createdAtMs: 1 }),
      trip('e2', { isEditorial: true, savesCount: 9 }), trip('t2', { createdAtMs: 5 }),
    ], 'me');
    expect(pool.map((t) => t.id)).toEqual(['t2', 't1', 'e2', 'e1']);
  });
  it('needs a cover and is never your own', () => {
    expect(feedTripPool([trip('a', { coverImageUrl: null }), trip('b', { authorUid: 'me' }), trip('c')], 'me').map((t) => t.id)).toEqual(['c']);
  });
});

describe('mixFeed', () => {
  const trips = [trip('t1'), trip('t2'), trip('t3')];
  it('a trip card after every 3 posts', () => {
    const items = mixFeed([post('p1'), post('p2'), post('p3'), post('p4'), post('p5'), post('p6'), post('p7')], trips, { postsExhausted: false, showSuggestions: false });
    expect(kinds(items)).toBe('ppptppptp');
  });
  it('once posts run out, trip cards continue', () => {
    expect(kinds(mixFeed([post('p1'), post('p2')], trips, { postsExhausted: true, showSuggestions: false }))).toBe('ppttt');
  });
  it('while more posts may come, trips are not dumped at the end', () => {
    expect(kinds(mixFeed([post('p1'), post('p2')], trips, { postsExhausted: false, showSuggestions: false }))).toBe('pp');
  });
  it('suggestions at index 2 when asked for', () => {
    expect(kinds(mixFeed([post('p1'), post('p2'), post('p3'), post('p4')], trips, { postsExhausted: true, showSuggestions: true }))).toBe('ppsptptt');
  });
  it('suggestions still appear with fewer than two other items', () => {
    expect(kinds(mixFeed([], [], { postsExhausted: true, showSuggestions: true }))).toBe('s');
  });
  it('a trip already shown as a post is not repeated', () => {
    const items = mixFeed([post('p1', 't1'), post('p2'), post('p3')], trips, { postsExhausted: true, showSuggestions: false });
    expect(items.filter((i) => i.kind === 'trip').map((i) => (i as { trip: FeedTrip }).trip.id)).toEqual(['t2', 't3']);
  });
  it('no trips: posts unchanged', () => {
    expect(kinds(mixFeed([post('p1'), post('p2'), post('p3'), post('p4')], [], { postsExhausted: true, showSuggestions: false }))).toBe('pppp');
  });
});

describe('tripEyebrow', () => {
  it('place and length', () => {
    expect(tripEyebrow(trip('a'))).toBe('LISBON · 5 DAYS');
    expect(tripEyebrow(trip('a', { days: 1 }))).toBe('LISBON · 1 DAY');
    expect(tripEyebrow(trip('a', { days: null }))).toBe('LISBON');
  });
});

describe('final review (2026-10-24)', () => {
  it('a trip card keeps its slot when a later post turns out to be that trip', () => {
    const trips3 = [trip('t1'), trip('t2'), trip('t3')];
    const first = mixFeed([post('p1'), post('p2'), post('p3'), post('p4')], trips3, { postsExhausted: false, showSuggestions: false });
    const later = mixFeed([post('p1'), post('p2'), post('p3'), post('p4'), post('p5', 't1'), post('p6')], trips3, { postsExhausted: false, showSuggestions: false });
    const tripAt3 = (items: { kind: string }[]) => (items[3] as unknown as { trip: FeedTrip }).trip.id;
    expect(tripAt3(first)).toBe('t1');
    expect(tripAt3(later)).toBe('t1');
  });
  it('a trip shown as an earlier post is still not repeated', () => {
    const items = mixFeed([post('p1', 't1'), post('p2'), post('p3')], [trip('t1'), trip('t2')], { postsExhausted: true, showSuggestions: false });
    expect(items.filter((i) => i.kind === 'trip').map((i) => (i as { trip: FeedTrip }).trip.id)).toEqual(['t2']);
  });
  it('older trips with no place or title still read well', () => {
    expect(tripEyebrow(trip('a', { destinationName: '' }))).toBe('5 DAYS');
    expect(tripEyebrow(trip('a', { destinationName: '', days: null }))).toBe('');
    expect(tripTitle(trip('a', { title: '  ', destinationName: '' }))).toBe('A trip');
    expect(tripTitle(trip('a', { title: '', destinationName: 'Lisbon' }))).toBe('Trip to Lisbon');
  });
});

describe('only real itineraries in the feed (2026-10-25)', () => {
  it('a trip with no itinerary yet is never a card', () => {
    const pool = feedTripPool([trip('full', { hasItinerary: true }), trip('empty', { hasItinerary: false }), trip('unknown', { hasItinerary: undefined })], null);
    expect(pool.map((t) => t.id)).toEqual(['full']);
  });
});
