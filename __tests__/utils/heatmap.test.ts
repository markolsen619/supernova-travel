import { heatFeatures, destinationPinFeatures, destinationSlugFromFeatures, findDestinationAt, DESTINATION_PIN_LAYERS, clusterFlyZoom, globeTapTarget } from '@/utils/heatmap';
import { parseDestination } from '@/utils/destinations';

describe('heatFeatures', () => {
  it('unflattens [lng, lat, w] triples', () => {
    const fc = heatFeatures([-9.1, 38.7, 20, 139.7, 35.6, 3], 3);
    expect(fc.features).toHaveLength(2);
    expect(fc.features[0]).toMatchObject({ geometry: { type: 'Point', coordinates: [-9.1, 38.7] }, properties: { w: 20 } });
  });
  it('draws nothing for a missing, wrong-stride or empty document', () => {
    expect(heatFeatures(undefined, 3).features).toEqual([]);
    expect(heatFeatures([1, 2, 3], 2).features).toEqual([]);
    expect(heatFeatures([], 3).features).toEqual([]);
  });
  it('skips a trailing partial triple and invalid values', () => {
    const fc = heatFeatures([1, 2, 3, 4, 95, 1, 5, NaN, 1, 6, 7, 2, 8], 3);
    expect(fc.features.map((f) => f.geometry.coordinates)).toEqual([[1, 2], [6, 7]]);
  });
});

describe('destination pins', () => {
  const d = parseDestination('lisbon', { name: 'Lisbon', center: { lat: 38.7, lng: -9.1 }, popularity: 82 })!;
  it('puts each destination at its centre, weighted by popularity', () => {
    expect(destinationPinFeatures([d]).features[0]).toMatchObject({
      geometry: { coordinates: [-9.1, 38.7] }, properties: { slug: 'lisbon', name: 'Lisbon', weight: 82 },
    });
  });
  it('reads the slug of a tapped pin, ignoring other features', () => {
    const fc = { type: 'FeatureCollection', features: [
      { type: 'Feature', properties: { class: 'poi' }, geometry: { type: 'Point', coordinates: [0, 0] } },
      { type: 'Feature', properties: { slug: 'lisbon' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ] } as GeoJSON.FeatureCollection;
    expect(destinationSlugFromFeatures(fc)).toBe('lisbon');
    expect(destinationSlugFromFeatures(undefined)).toBeNull();
  });
});

describe('findDestinationAt', () => {
  it('tests the halo too — a tap near a small pin lands on its halo', () => {
    expect(DESTINATION_PIN_LAYERS).toEqual(expect.arrayContaining(['destination-halo', 'destination-pin', 'destination-label']));
  });
  it('returns the slug the query finds', async () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', properties: { slug: 'kyoto' }, geometry: { type: 'Point', coordinates: [0, 0] } }] } as GeoJSON.FeatureCollection;
    await expect(findDestinationAt(async () => fc)).resolves.toBe('kyoto');
  });
  it('treats a failed or empty query as no pin, so the tap carries on to the POI lookup', async () => {
    await expect(findDestinationAt(async () => { throw new Error('no such layer'); })).resolves.toBeNull();
    await expect(findDestinationAt(async () => undefined)).resolves.toBeNull();
  });
});

describe('globe taps at any distance (spec 2026-11-11)', () => {
  const pin = { type: 'Feature', properties: { slug: 'lisbon', name: 'Lisbon' }, geometry: { type: 'Point', coordinates: [-9.1, 38.7] } };
  const bubble = { type: 'Feature', properties: { cluster: true, cluster_id: 42, point_count: 24 }, geometry: { type: 'Point', coordinates: [10, 50] } };
  it('a bubble wins over a pin under the same tap (review focus 4)', () => {
    expect(globeTapTarget({ type: 'FeatureCollection', features: [pin, bubble] } as never)).toEqual({ kind: 'cluster', clusterId: 42, coordinates: [10, 50], count: 24 });
  });
  it('a lone pin opens its destination', () => {
    expect(globeTapTarget({ type: 'FeatureCollection', features: [pin] } as never)).toEqual({ kind: 'destination', slug: 'lisbon' });
  });
  it('nothing for an empty tap', () => {
    expect(globeTapTarget(null)).toBeNull();
    expect(globeTapTarget({ type: 'FeatureCollection', features: [] })).toBeNull();
  });
  it('the tap layers include the bubble layers', () => {
    expect(DESTINATION_PIN_LAYERS).toEqual(expect.arrayContaining(['destination-cluster', 'destination-cluster-count', 'destination-pin']));
  });
  it('clusterFlyZoom: expansion + 0.2, else +2, never past 12 (review focus 1)', () => {
    expect(clusterFlyZoom(4, 1.5)).toBeCloseTo(4.2);
    expect(clusterFlyZoom(null, 1.5)).toBe(3.5);
    expect(clusterFlyZoom(13, 11)).toBe(12);
  });
  it('pin features carry popularity, 0 when missing (review focus 5)', () => {
    const fc = destinationPinFeatures([{ slug: 'a', name: 'A', popularity: 80, center: { lat: 1, lng: 2 } }, { slug: 'b', name: 'B', center: { lat: 3, lng: 4 } }] as never);
    expect(fc.features.map((f) => (f.properties as { popularity?: number }).popularity)).toEqual([80, 0]);
  });
});
