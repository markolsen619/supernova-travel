import { adultCategory, allowedCategories, keepActivity } from '../../functions/src/adultVenues';

describe('adultCategory', () => {
  it('recognises each category by title or search query', () => {
    expect(adultCategory({ title: 'Night at Crazy Horse strip club' })).toBe('strip');
    expect(adultCategory({ title: 'Drinks', searchQuery: "Spearmint Rhino Gentlemen's Club, Las Vegas" })).toBe('strip');
    expect(adultCategory({ title: 'Walk the Red Light District' })).toBe('redlight');
    expect(adultCategory({ title: 'Visit the Sex Museum' })).toBe('redlight');
    expect(adultCategory({ title: 'Coffeeshop stop at The Bulldog' })).toBe('cannabis');
    expect(adultCategory({ title: 'Cannabis tasting tour' })).toBe('cannabis');
    expect(adultCategory({ title: 'Evening at the Casino de Monte-Carlo' })).toBe('casino');
  });
  it('leaves ordinary places alone (false positives that would hurt)', () => {
    for (const title of ['Coffee shop breakfast at Blue Bottle', 'Moulin Rouge cabaret show', 'Strip District market, Pittsburgh', 'Sunset Strip walk', 'Las Vegas Strip at night', 'Dinner at Strip House', 'Weed-free garden tour', 'Red Square']) {
      expect(adultCategory({ title })).toBeNull();
    }
  });
  it('a hotel stay is never removed (a Vegas hotel may be a casino resort)', () => {
    expect(adultCategory({ title: 'Check into Bellagio Hotel & Casino', type: 'hotel' })).toBeNull();
    expect(adultCategory({ title: 'Check out of Bellagio Hotel & Casino' })).toBeNull();
  });
});

describe('allowedCategories', () => {
  it("only the traveler's own words unlock a category", () => {
    expect([...allowedCategories('Bachelor party weekend, lots of bars')]).toEqual(['strip']);
    expect([...allowedCategories('We want a casino night and some poker')]).toEqual(['casino']);
    expect([...allowedCategories('visit a coffeeshop in Amsterdam')]).toEqual(['cannabis']);
    expect([...allowedCategories('see the red light district')]).toEqual(['redlight']);
    expect([...allowedCategories('quiet trip with museums')]).toEqual([]);
    expect([...allowedCategories('')]).toEqual([]);
  });
});

it('keepActivity: removed unless asked', () => {
  const strip = { title: 'Night at Crazy Horse strip club' };
  expect(keepActivity(strip, allowedCategories('party trip'))).toBe(false);
  expect(keepActivity(strip, allowedCategories('bachelor party'))).toBe(true);
  expect(keepActivity({ title: 'Lunch at Time Out Market' }, new Set())).toBe(true);
});

import { withoutUnasked } from '../../functions/src/adultVenues';

describe('withoutUnasked (a whole generated trip)', () => {
  const trip = {
    title: 'Vegas weekend', description: '',
    days: [{ dayNumber: 1, title: 'The Strip', activities: [
      { title: 'Check into Bellagio Hotel & Casino', type: 'hotel' },
      { title: 'Night at Crazy Horse strip club', type: 'activity' },
      { title: 'Blackjack at Caesars Palace casino', type: 'activity' },
      { title: 'Dinner at Lotus of Siam', type: 'restaurant' },
    ] }],
  };
  it('drops what nobody asked for, keeps the rest in order, counts the removals', () => {
    const r = withoutUnasked(trip as never, 'Party style, great food');
    expect(r.trip.days[0].activities.map((a: { title: string }) => a.title)).toEqual(['Check into Bellagio Hotel & Casino', 'Dinner at Lotus of Siam']);
    expect(r.removed).toBe(2);
  });
  it('keeps what was asked for', () => {
    const r = withoutUnasked(trip as never, 'bachelor party with a casino night');
    expect(r.removed).toBe(0);
  });
});

import { keepAgentOp } from '../../functions/src/adultVenues';

describe("keepAgentOp (Nova's suggestions)", () => {
  const add = (title: string, query: string | null = null) => ({ kind: 'trip.addStop', dayId: 'd1', title, type: 'activity', afterStopId: null, time: null, query });
  it('drops an unasked strip club or casino stop, keeps ordinary ones and other kinds of change', () => {
    expect(keepAgentOp(add('Drinks', "Spearmint Rhino Gentlemen's Club, Las Vegas") as never, new Set())).toBe(false);
    expect(keepAgentOp({ kind: 'trip.editStop', dayId: 'd1', stopId: 's1', title: 'Casino night at Bellagio' } as never, new Set())).toBe(false);
    expect(keepAgentOp(add('Dinner at Lotus of Siam') as never, new Set())).toBe(true);
    expect(keepAgentOp({ kind: 'trip.removeStop', dayId: 'd1', stopId: 's1' } as never, new Set())).toBe(true);
  });
  it('keeps them when asked (the message, or the trip itself: "Bachelor party in Vegas")', () => {
    expect(keepAgentOp(add('Drinks', "Spearmint Rhino Gentlemen's Club, Las Vegas") as never, allowedCategories('Bachelor party in Vegas'))).toBe(true);
  });
});
