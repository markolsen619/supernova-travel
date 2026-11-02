import {
  visibleSlides, storyStep, showYearCard, kmLine, styleLine, typeLine, countLabel, SLIDE_MS, type StoryState,
} from '@/utils/yearInTravel';

const full = { trips: 3, photos: ['p'], companions: [{}], places: [{}], longestTrip: {} };

describe('visibleSlides', () => {
  it('all nine with everything', () => {
    expect(visibleSlides(full)).toEqual(['opener', 'numbers', 'map', 'records', 'taste', 'photos', 'companions', 'next', 'share']);
  });
  it('no photos, companions or places: those slides are left out', () => {
    expect(visibleSlides({ ...full, photos: [], companions: [], places: [] })).toEqual(['opener', 'numbers', 'records', 'taste', 'next', 'share']);
  });
  it('no trips: opener and what comes next only', () => {
    expect(visibleSlides({ trips: 0, photos: [], companions: [], places: [], longestTrip: null })).toEqual(['opener', 'next']);
  });
});

describe('storyStep', () => {
  const s0: StoryState = { index: 0, elapsed: 0, paused: false, done: false };
  it('moves on after 6 s', () => {
    expect(storyStep(s0, { type: 'tick', dt: SLIDE_MS - 1, count: 3 }).index).toBe(0);
    expect(storyStep(s0, { type: 'tick', dt: SLIDE_MS, count: 3 })).toEqual({ index: 1, elapsed: 0, paused: false, done: false });
  });
  it('the last slide stays up until closed; next on it finishes', () => {
    const last = { ...s0, index: 2 };
    expect(storyStep(last, { type: 'tick', dt: SLIDE_MS * 2, count: 3 }).index).toBe(2);
    expect(storyStep(last, { type: 'next', count: 3 }).done).toBe(true);
  });
  it('prev on the first restarts it; pause stops the clock', () => {
    expect(storyStep({ ...s0, elapsed: 3000 }, { type: 'prev', count: 3 })).toEqual(s0);
    const p = storyStep(s0, { type: 'pause' });
    expect(storyStep(p, { type: 'tick', dt: SLIDE_MS * 3, count: 3 }).index).toBe(0);
    expect(storyStep(p, { type: 'resume' }).paused).toBe(false);
  });
});

describe('showYearCard', () => {
  const at = (s: string) => new Date(`${s}T12:00:00`);
  it('Dec 1 – Jan 15 celebrates the year just ending', () => {
    expect(showYearCard(at('2026-11-30'))).toBeNull();
    expect(showYearCard(at('2026-12-01'))).toBe(2026);
    expect(showYearCard(at('2026-12-31'))).toBe(2026);
    expect(showYearCard(at('2027-01-15'))).toBe(2026);
    expect(showYearCard(at('2027-01-16'))).toBeNull();
  });
});

describe('copy', () => {
  it('distance in Earths', () => {
    expect(kmLine(0)).toBe('Every journey starts somewhere.');
    expect(kmLine(18400)).toBe('You covered 18,400 km, about 46% of the way around the Earth.');
    expect(kmLine(80150)).toBe('You covered 80,150 km, around the Earth twice.');
    expect(kmLine(130000)).toBe('You covered 130,000 km, around the Earth 3 times.');
  });
  it('style, types and counts', () => {
    expect(styleLine('foodie')).toBe('You travel like a Foodie');
    expect(styleLine(null)).toBeNull();
    expect(typeLine({ restaurant: 1, activity: 0 })).toBe('You saved 1 restaurant');
    expect(typeLine({ restaurant: 23, activity: 31 })).toBe('You saved 23 restaurants and 31 sights');
    expect(typeLine({ restaurant: 0, activity: 0 })).toBeNull();
    expect(countLabel(1, 'trip', 'trips')).toBe('1 trip');
    expect(countLabel(3, 'trip', 'trips')).toBe('3 trips');
  });
});
