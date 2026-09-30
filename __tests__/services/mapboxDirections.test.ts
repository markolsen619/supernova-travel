import { parseDirectionsResponse, directionsOutcome } from '@/services/mapboxDirections';

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

describe('directionsOutcome', () => {
  it('returns the route on success', () => {
    expect(directionsOutcome(200, { code: 'Ok', routes: [{ geometry: 'abc', distance: 10 }] }))
      .toEqual({ kind: 'route', polyline: 'abc', meters: 10 });
  });

  it('is a definitive "no route" only when Mapbox says so', () => {
    expect(directionsOutcome(200, { code: 'NoRoute', routes: [] })).toEqual({ kind: 'none' });
    expect(directionsOutcome(200, { code: 'NoSegment' })).toEqual({ kind: 'none' });
    expect(directionsOutcome(422, { code: 'InvalidInput' })).toEqual({ kind: 'none' });
  });

  it('asks for a retry on anything temporary, so it is never cached as an arc', () => {
    // A rate limit, an outage, a bad token or a dropped connection used to be
    // cached as a permanent straight arc for every viewer of the trip.
    expect(directionsOutcome(429, { message: 'Too Many Requests' })).toEqual({ kind: 'retry' });
    expect(directionsOutcome(503, null)).toEqual({ kind: 'retry' });
    expect(directionsOutcome(401, { message: 'Not Authorized' })).toEqual({ kind: 'retry' });
    expect(directionsOutcome(200, { code: 'Ok', routes: [] })).toEqual({ kind: 'retry' });
  });
});
