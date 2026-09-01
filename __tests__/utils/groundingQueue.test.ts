import { selectStopsToGround } from '@/utils/groundingQueue';

const act = (over: any = {}) => ({
  id: 'a1', lat: null, lng: null, searchQuery: 'Malecón', groundingFailedAt: null, ...over,
});

describe('selectStopsToGround', () => {
  it('selects ungrounded stops that have a searchQuery', () => {
    const days = [{ id: 'd1', activities: [act()] }];
    expect(selectStopsToGround(days, [0])).toEqual([
      { activityId: 'a1', dayId: 'd1', searchQuery: 'Malecón', destinationIndex: 0 },
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

  it('deduplicates repeated queries within the same destination', () => {
    const days = [{ id: 'd1', activities: [act({ id: 'a1' }), act({ id: 'a2' })] }];
    expect(selectStopsToGround(days, [0])).toHaveLength(1);
  });

  it('does not deduplicate the same query across different destinations', () => {
    const days = [
      { id: 'd1', activities: [act({ id: 'a1', searchQuery: 'Central Station' })] },
      { id: 'd2', activities: [act({ id: 'a2', searchQuery: 'Central Station' })] },
    ];
    expect(selectStopsToGround(days, [0, 1])).toHaveLength(2);
  });

  it('carries each day\'s destination index onto its stops', () => {
    const days = [
      { id: 'd1', activities: [act({ id: 'a1' })] },
      { id: 'd2', activities: [act({ id: 'a2', searchQuery: 'Colosseum' })] },
    ];
    expect(selectStopsToGround(days, [0, 1]).map((s) => s.destinationIndex)).toEqual([0, 1]);
  });
});
