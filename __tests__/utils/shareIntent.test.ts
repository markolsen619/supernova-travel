import { shareRedirect } from '@/utils/shareIntent';

it('the share extension\'s own link opens the tabs (not a "not found" screen); every other link is untouched', () => {
  expect(shareRedirect('supernova://dataUrl=supernovaShareKey#text')).toBe('/(tabs)');
  expect(shareRedirect('/dataUrl=supernovaShareKey')).toBe('/(tabs)');
  expect(shareRedirect('/join/abc123')).toBe('/join/abc123');
  expect(shareRedirect('/trip/xyz')).toBe('/trip/xyz');
});
