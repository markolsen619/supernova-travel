import { foldCity, omioUrl, trainLink, TRAIN_MAX_KM } from '@/utils/trainLinks';

const none = { omio: null, airalo: null };
const prague = { name: 'Prague', lat: 50.0755, lng: 14.4378 };
const budapest = { name: 'Budapest', lat: 47.4979, lng: 19.0402 };
const tokyo = { name: 'Tokyo', lat: 35.6762, lng: 139.6503 };

describe('foldCity', () => {
  it('folds case and accents and drops the country part', () => {
    expect(foldCity('Köln')).toBe('koln');
    expect(foldCity('Prague, Czechia')).toBe('prague');
  });
});

describe('omioUrl', () => {
  it('both cities known: a prefilled search, no dates', () => {
    expect(omioUrl('Prague', 'Budapest', none, { prague: 1, budapest: 2 })).toBe('https://www.omio.com/?departure_fk=1&arrival_fk=2');
  });
  it('a city unknown (or the table empty): Omio home', () => {
    expect(omioUrl('Prague', 'Budapest', none, { prague: 1 })).toBe('https://www.omio.com/');
    expect(omioUrl('Prague', 'Budapest', none)).toBe('https://www.omio.com/');
  });
  it('applies the affiliate template', () => {
    expect(omioUrl('Prague', 'Budapest', { omio: '{raw}?mcid=9', airalo: null })).toBe('https://www.omio.com/?mcid=9');
  });
});

describe('trainLink', () => {
  it('a short leg with nothing booked gets a link', () => {
    expect(trainLink(prague, budapest, 0, none)).toEqual({ label: 'Find trains & buses Prague → Budapest · Omio', url: 'https://www.omio.com/' });
  });
  it('names cities without their country (final review M2)', () => {
    expect(trainLink({ ...prague, name: 'Prague, Czechia' }, { ...budapest, name: 'Budapest, Hungary' }, 0, none)?.label).toBe('Find trains & buses Prague → Budapest · Omio');
  });
  it('nothing when the leg is booked or too far', () => {
    expect(trainLink(prague, budapest, 1, none)).toBeNull();
    expect(trainLink(prague, tokyo, 0, none)).toBeNull();
    expect(TRAIN_MAX_KM).toBe(800);
  });
  it('nothing when a city has no coordinates (review focus 4)', () => {
    expect(trainLink({ name: 'Prague', lat: null, lng: null }, budapest, 0, none)).toBeNull();
  });
});
