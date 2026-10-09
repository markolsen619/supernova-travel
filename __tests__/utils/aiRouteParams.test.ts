import { parseTravelStyles, parseTripVisibility } from '@/utils/aiRouteParams';

describe('parseTravelStyles', () => {
  it('reads a comma-joined list in order', () => {
    expect(parseTravelStyles('family,cultural')).toEqual(['family', 'cultural']);
  });

  it('drops unknown and repeated values', () => {
    expect(parseTravelStyles('family,karaoke,family, budget')).toEqual(['family', 'budget']);
  });

  it('falls back to the single legacy param, then adventure', () => {
    expect(parseTravelStyles('', 'luxury')).toEqual(['luxury']);
    expect(parseTravelStyles(undefined, 'nonsense')).toEqual(['adventure']);
  });
});

describe('parseTripVisibility', () => {
  it('reads a valid visibility and defaults to followers otherwise', () => {
    expect(parseTripVisibility('private')).toBe('private');
    expect(parseTripVisibility(undefined)).toBe('followers');
    expect(parseTripVisibility('everyone')).toBe('followers');
  });
});
