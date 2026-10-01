import { heatFeatures, destinationPinFeatures, destinationSlugFromFeatures } from '@/utils/heatmap';
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
