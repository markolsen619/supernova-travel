import { catalogFor, generatingMessages, messageIndexAt, progressAt, waitCardAt, waitCards } from '@/utils/generatingStory';

describe('generatingMessages', () => {
  it('tells a ten-step story about their city and styles', () => {
    const m = generatingMessages('Rome', ['foodie', 'cultural']);
    expect(m).toHaveLength(10);
    expect(m[0]).toBe("Mapping Rome's neighborhoods");
    expect(m.some((x) => x.includes('food'))).toBe(true);
    expect(m.some((x) => x.includes('museums'))).toBe(true);
    expect(m[9]).toBe('Putting the finishing touches on your trip');
  });
  it('still reads well with no style', () => {
    expect(generatingMessages('Lisbon', [])).toHaveLength(10);
  });
});

describe('messageIndexAt', () => {
  // The old screen ran out of messages after 9 seconds and said "Finalising" for up to two minutes.
  it('spreads the story over about ninety seconds and stays on the last step', () => {
    expect(messageIndexAt(0, 10)).toBe(0);
    expect(messageIndexAt(9, 10)).toBe(1);
    expect(messageIndexAt(45, 10)).toBe(5);
    expect(messageIndexAt(300, 10)).toBe(9);
  });
});

describe('progressAt', () => {
  it('keeps moving but never claims to be done', () => {
    expect(progressAt(0)).toBe(0);
    expect(progressAt(30)).toBeGreaterThan(0.4);
    expect(progressAt(75)).toBeGreaterThan(progressAt(30));
    expect(progressAt(600)).toBeLessThan(0.9);
  });
});

describe('waitCards', () => {
  it('leads with what travelers love there, then tips', () => {
    const cards = waitCards(['Colosseum', 'Trastevere', 'Pantheon', 'Villa Borghese']);
    expect(cards[0]).toEqual({ title: 'Travelers love here', body: 'Colosseum · Trastevere · Pantheon' });
    expect(cards.length).toBeGreaterThan(3);
  });
  it('shows only tips when the place is not in the catalog', () => {
    expect(waitCards([]).every((c) => c.title !== 'Travelers love here')).toBe(true);
  });
  it('turns a card every six seconds, round and round', () => {
    const cards = waitCards([]);
    expect(waitCardAt(cards, 0)).toBe(cards[0]);
    expect(waitCardAt(cards, 6)).toBe(cards[1]);
    expect(waitCardAt(cards, 6 * cards.length)).toBe(cards[0]);
  });
});

describe('catalogFor', () => {
  const rome = { slug: 'rome', name: 'Rome', center: { lat: 41.9, lng: 12.48 } };
  const list = [rome];
  it('finds the destination within 30 km of its centre, else by its name', () => {
    expect(catalogFor(list, 'Roma', 41.9, 12.5)).toBe(rome);
    expect(catalogFor(list, 'rome', null, null)).toBe(rome);
    expect(catalogFor(list, 'Lyon', 45.7, 4.8)).toBeNull();
  });
});
