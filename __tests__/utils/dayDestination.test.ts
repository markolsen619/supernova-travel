import { resolveDayDestinationIndices } from '@/utils/dayDestination';

const CITIES = ['Paris', 'Rome', 'Barcelona'];
const day = (over: Partial<{ destinationIndex: number | null; activities: { type: string; title: string }[] }> = {}) => ({
  destinationIndex: null, activities: [], ...over,
});

describe('resolveDayDestinationIndices', () => {
  it('uses explicit destinationIndex when every day has a valid one', () => {
    const days = [day({ destinationIndex: 0 }), day({ destinationIndex: 1 }), day({ destinationIndex: 2 })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 1, 2]);
  });

  it('infers from transport markers when the explicit field is absent', () => {
    const days = [
      day(),
      day({ activities: [{ type: 'transport', title: 'Travel from Paris to Rome' }] }),
      day(),
      day({ activities: [{ type: 'transport', title: 'Travel from Rome to Barcelona' }] }),
    ];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 1, 1, 2]);
  });

  it('matches the arrival city case-insensitively', () => {
    const days = [day(), day({ activities: [{ type: 'transport', title: 'travel from paris to ROME' }] })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 1]);
  });

  it('ignores a transport activity that names no known city', () => {
    const days = [day(), day({ activities: [{ type: 'transport', title: 'Travel to the airport' }] })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 0]);
  });

  it('falls back to index 0 for a single-destination trip with no markers', () => {
    expect(resolveDayDestinationIndices([day(), day()], ['La Paz'])).toEqual([0, 0]);
  });

  it('clamps an out-of-range explicit index rather than trusting it', () => {
    const days = [day({ destinationIndex: 7 })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0]);
  });

  it('returns an empty array for no days', () => {
    expect(resolveDayDestinationIndices([], CITIES)).toEqual([]);
  });

  it('returns all zeros when the destination list is empty', () => {
    expect(resolveDayDestinationIndices([day(), day()], [])).toEqual([0, 0]);
  });
});
