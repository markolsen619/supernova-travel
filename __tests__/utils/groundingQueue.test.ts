import { selectStopsToGround, manualSearchQuery, typedStopMatches } from '@/utils/groundingQueue';

const act = (over: any = {}) => ({
  id: 'a1', lat: null, lng: null, searchQuery: 'Malecón', groundingFailedAt: null, ...over,
});

describe('selectStopsToGround', () => {
  it('selects ungrounded stops that have a searchQuery', () => {
    const days = [{ id: 'd1', activities: [act()] }];
    expect(selectStopsToGround(days, [0])).toEqual([
      { searchQuery: 'Malecón', destinationIndex: 0, targets: [{ activityId: 'a1', dayId: 'd1' }] },
    ]);
  });

  it('skips stops that already have coordinates', () => {
    const days = [{ id: 'd1', activities: [act({ lat: 24.1, lng: -110.3 })] }];
    expect(selectStopsToGround(days, [0])).toEqual([]);
  });

  it('skips stops already marked as grounding-failed', () => {
    const days = [{ id: 'd1', activities: [act({ groundingFailedAt: { seconds: 1 } })] }];
    expect(selectStopsToGround(days, [0])).toEqual([]);
  });

  it('skips stops with no searchQuery', () => {
    const days = [{ id: 'd1', activities: [act({ searchQuery: '' })] }];
    expect(selectStopsToGround(days, [0])).toEqual([]);
  });

  it('deduplicates repeated queries within the same destination into one entry with all targets', () => {
    const days = [{ id: 'd1', activities: [act({ id: 'a1' }), act({ id: 'a2' })] }];
    const result = selectStopsToGround(days, [0]);
    expect(result).toHaveLength(1);
    expect(result[0].targets).toEqual([
      { activityId: 'a1', dayId: 'd1' },
      { activityId: 'a2', dayId: 'd1' },
    ]);
  });

  it('does not deduplicate the same query across different destinations — each stays its own entry with one target', () => {
    const days = [
      { id: 'd1', activities: [act({ id: 'a1', searchQuery: 'Central Station' })] },
      { id: 'd2', activities: [act({ id: 'a2', searchQuery: 'Central Station' })] },
    ];
    const result = selectStopsToGround(days, [0, 1]);
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.targets)).toEqual([
      [{ activityId: 'a1', dayId: 'd1' }],
      [{ activityId: 'a2', dayId: 'd2' }],
    ]);
  });

  it('carries each day\'s destination index onto its stops', () => {
    const days = [
      { id: 'd1', activities: [act({ id: 'a1' })] },
      { id: 'd2', activities: [act({ id: 'a2', searchQuery: 'Colosseum' })] },
    ];
    expect(selectStopsToGround(days, [0, 1]).map((s) => s.destinationIndex)).toEqual([0, 1]);
  });
});

describe('manualSearchQuery', () => {
  it('lets a typed place be found on the map, in its day’s city', () => {
    expect(manualSearchQuery('activity', 'Sagrada Família', 'Barcelona')).toBe('Sagrada Família, Barcelona');
    expect(manualSearchQuery('restaurant', 'Lokál Dlouhá', 'Prague')).toBe('Lokál Dlouhá, Prague');
  });
  it('does not look up free time, transport, flights, or a title too short to mean a place', () => {
    expect(manualSearchQuery('free', 'Beach afternoon', 'Nice')).toBeNull();
    expect(manualSearchQuery('transport', 'Train to Rome', 'Florence')).toBeNull();
    expect(manualSearchQuery('flight', 'LH 431', 'Munich')).toBeNull();
    expect(manualSearchQuery('activity', 'Go', 'Paris')).toBeNull();
  });
  it('does not repeat the city', () => {
    expect(manualSearchQuery('activity', 'Prague Castle', 'Prague')).toBe('Prague Castle');
  });
});

describe('typedStopMatches', () => {
  it('pins a typed place only to somewhere that shares a real word with it', () => {
    expect(typedStopMatches('Sagrada Família', 'Basílica de la Sagrada Família')).toBe(true);
    expect(typedStopMatches('Lokál Dlouhá', 'Lokál Dlouhááá')).toBe(true);
    expect(typedStopMatches('Dinner with Kelly', 'The Fish Market')).toBe(false);
    expect(typedStopMatches('Drinks with the team', 'Team Rubicon Bar')).toBe(true);
    expect(typedStopMatches('Lunch', 'Lunch Box Cafe')).toBe(false);
  });
});
