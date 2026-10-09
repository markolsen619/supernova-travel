import { resolveDayDestinationIndices, daysInDestination, filterableCities } from '@/utils/dayDestination';

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

  it('prefers the longest matching destination name', () => {
    const days = [day(), day({ activities: [{ type: 'transport', title: 'Travel from Boston to New York' }] })];
    expect(resolveDayDestinationIndices(days, ['York', 'New York'])).toEqual([0, 1]);
  });

  it('does not match a city name embedded in a longer word', () => {
    const days = [day(), day({ activities: [{ type: 'transport', title: 'Travel from Paris to Rometown' }] })];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 0]);
  });

  it('demotes to inference when an explicit index is not an integer', () => {
    const days = [day({ destinationIndex: 1.5 }), day()];
    expect(resolveDayDestinationIndices(days, CITIES)).toEqual([0, 0]);
  });
});

describe('daysInDestination', () => {
  const days = [{ id: 'd1' }, { id: 'd2' }, { id: 'd3' }, { id: 'd4' }];
  const indices = [0, 0, 1, 2];
  it('keeps only the chosen city’s days, in order', () => {
    expect(daysInDestination(days, indices, 0).map((d) => d.id)).toEqual(['d1', 'd2']);
    expect(daysInDestination(days, indices, 2).map((d) => d.id)).toEqual(['d4']);
  });
  it('shows every day when no city is chosen', () => {
    expect(daysInDestination(days, indices, null)).toHaveLength(4);
  });
});

describe('filterableCities', () => {
  it('lets you pick a city only when it holds some, but not all, of the days', () => {
    expect(filterableCities([0, 0, 1, 2], 3)).toEqual([true, true, true]);
    // A manual trip: every day is in the first city, so no pill filters anything.
    expect(filterableCities([0, 0, 0], 3)).toEqual([false, false, false]);
    expect(filterableCities([0, 1, 1], 3)).toEqual([true, true, false]);
  });
});
