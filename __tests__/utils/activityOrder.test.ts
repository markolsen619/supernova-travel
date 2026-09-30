import { applyActivityOrder } from '@/utils/activityOrder';

const act = (id: string, order: number) => ({ id, order });
const trip = {
  id: 't',
  days: [
    { id: 'd1', activities: [act('a', 0), act('b', 1000), act('c', 1_727_000_000_000)] },
    { id: 'd2', activities: [act('x', 0)] },
  ],
};

describe('applyActivityOrder', () => {
  it('rewrites the dropped day in the new order, spaced by 1000', () => {
    const next = applyActivityOrder(trip, 'd1', ['c', 'a', 'b']);
    expect(next.days[0].activities).toEqual([act('c', 0), act('a', 1000), act('b', 2000)]);
  });

  it('leaves every other day untouched, by reference', () => {
    const next = applyActivityOrder(trip, 'd1', ['c', 'a', 'b']);
    expect(next.days[1]).toBe(trip.days[1]);
  });

  it('keeps activities the new order does not mention, after the rest', () => {
    // A stop added on another device mid-drag must not vanish from the screen.
    const next = applyActivityOrder(trip, 'd1', ['b', 'a']);
    expect(next.days[0].activities.map((a) => a.id)).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input', () => {
    applyActivityOrder(trip, 'd1', ['c', 'a', 'b']);
    expect(trip.days[0].activities.map((a) => a.order)).toEqual([0, 1000, 1_727_000_000_000]);
  });
});
