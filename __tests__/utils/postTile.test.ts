import { fromTravelers, postTileLabel } from '@/utils/postTile';

it('postTileLabel: first name · place, either alone, never empty', () => {
  expect(postTileLabel({ authorDisplayName: 'Kuba Czerwinski', placeName: 'Brussels' })).toBe('Kuba · Brussels');
  expect(postTileLabel({ authorDisplayName: 'Kuba', placeName: null })).toBe('Kuba');
  expect(postTileLabel({ authorDisplayName: '', placeName: 'Paris' })).toBe('Paris');
  expect(postTileLabel({})).toBe('A traveler');
});
it('fromTravelers: the 10 newest', () => {
  expect(fromTravelers(Array.from({ length: 14 }, (_, i) => i))).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
});
