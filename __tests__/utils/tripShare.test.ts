import { canShareTrip, tripShareUrl, tripMessagePayload, shareRecipients, summarizeSends } from '@/utils/tripShare';

const ts = (iso: string) => ({ toDate: () => new Date(iso), toMillis: () => new Date(iso).getTime() });

describe('canShareTrip', () => {
  it('shares public and followers-only trips, never private or hidden ones', () => {
    expect(canShareTrip({ visibility: 'public' })).toBe(true);
    expect(canShareTrip({ visibility: 'followers' })).toBe(true);
    expect(canShareTrip({ visibility: 'private' })).toBe(false);
    expect(canShareTrip({ visibility: 'public', moderationHidden: true })).toBe(false);
  });
});

describe('tripShareUrl', () => {
  it('is the web path the app also routes', () => {
    expect(tripShareUrl('abc123')).toBe('https://supernova-a2125.web.app/trip/abc123');
  });
});

describe('tripMessagePayload', () => {
  const trip = {
    id: 't1', title: 'Paris in Spring', coverImageUrl: 'https://x/c.jpg',
    destination: { name: 'Paris' }, additionalDestinations: [], regionName: null,
    startDate: null, endDate: null,
  };
  it('without a note, the text is a readable fallback with the link (for older apps)', () => {
    const p = tripMessagePayload({ trip, note: '  ', senderUid: 'me' });
    expect(p.text).toBe('Shared a trip: Paris in Spring — https://supernova-a2125.web.app/trip/t1');
    expect(p.trip).toEqual({
      tripId: 't1', title: 'Paris in Spring', coverImageUrl: 'https://x/c.jpg',
      placeLabel: 'Paris', dateRange: null, note: false,
    });
  });
  it('with a note, the text is the note and trip.note is true', () => {
    const p = tripMessagePayload({ trip, note: ' You have to see this ', senderUid: 'me' });
    expect(p.text).toBe('You have to see this');
    expect(p.trip.note).toBe(true);
  });
  it('carries the date range when the trip has dates, and null for a missing cover', () => {
    const p = tripMessagePayload({
      trip: { ...trip, coverImageUrl: undefined, startDate: ts('2026-07-25T12:00:00'), endDate: ts('2026-07-30T12:00:00') },
      note: '', senderUid: 'me',
    });
    expect(p.trip.dateRange).toBe('Jul 25 – 30 · 6 days');
    expect(p.trip.coverImageUrl).toBeNull();
  });
});

describe('shareRecipients', () => {
  const t = (id: string, other: string, iso: string) =>
    ({ id, type: 'direct' as const, participants: ['me', other], lastMessageAt: ts(iso) });
  it('lists recent conversations first, then friends without one, each person once, minus blocked', () => {
    const r = shareRecipients(
      [t('a', 'ana', '2026-01-01'), t('b', 'ben', '2026-05-01')],
      ['ana', 'cal', 'dee', 'eve'], 'me', new Set(['eve']),
    );
    expect(r).toEqual([
      { uid: 'ben', threadId: 'b' },
      { uid: 'ana', threadId: 'a' },
      { uid: 'cal', threadId: null },
      { uid: 'dee', threadId: null },
    ]);
  });
  it('skips group threads', () => {
    expect(shareRecipients(
      [{ id: 'g', type: 'group', participants: ['me', 'x', 'y'], lastMessageAt: null }], [], 'me', new Set(),
    )).toEqual([]);
  });
});

describe('summarizeSends', () => {
  it('names one recipient', () => {
    expect(summarizeSends([{ name: 'Ana', ok: true }])).toEqual({ sent: 1, failedNames: [], message: 'Sent to Ana' });
  });
  it('counts several', () => {
    expect(summarizeSends([{ name: 'Ana', ok: true }, { name: 'Ben', ok: true }]).message).toBe('Sent to 2 people');
  });
  it('names who it could not reach, and still counts the rest', () => {
    expect(summarizeSends([{ name: 'Ana', ok: true }, { name: 'Ben', ok: false }, { name: 'Cal', ok: true }]))
      .toEqual({ sent: 2, failedNames: ['Ben'], message: "Sent to 2 people. Couldn't send to Ben." });
  });
  it('when everything failed, says so and what to do', () => {
    expect(summarizeSends([{ name: 'Ana', ok: false }, { name: 'Ben', ok: false }]).message)
      .toBe("Couldn't send to Ana, Ben. Check your connection and try again.");
  });
});
