import { parseDirectionsResponse } from '@/services/mapboxDirections';

describe('parseDirectionsResponse', () => {
  it('takes the first route’s geometry and distance', () => {
    expect(parseDirectionsResponse({ code: 'Ok', routes: [{ geometry: 'abc', distance: 1234.5 }] }))
      .toEqual({ polyline: 'abc', meters: 1234.5 });
  });

  it('is null for no route, an error code, or junk', () => {
    expect(parseDirectionsResponse({ code: 'NoRoute', routes: [] })).toBeNull();
    expect(parseDirectionsResponse({ code: 'Ok', routes: [] })).toBeNull();
    expect(parseDirectionsResponse(null)).toBeNull();
    expect(parseDirectionsResponse({ code: 'Ok', routes: [{ geometry: 42 }] })).toBeNull();
  });
});
