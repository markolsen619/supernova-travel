import { parseTravelStyles } from '@/utils/travelStyles';

describe('parseTravelStyles', () => {
  it('reads a comma-joined list in order', () => {
    expect(parseTravelStyles('family,cultural')).toEqual(['family', 'cultural']);
  });

  it('drops unknown and repeated values', () => {
    expect(parseTravelStyles('family,party,family, budget')).toEqual(['family', 'budget']);
  });

  it('falls back to the single legacy param, then adventure', () => {
    expect(parseTravelStyles('', 'luxury')).toEqual(['luxury']);
    expect(parseTravelStyles(undefined, 'nonsense')).toEqual(['adventure']);
  });
});
