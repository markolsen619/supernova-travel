import { doc, getDoc } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import type * as GeoJSON from 'geojson';
import { db } from '@/services/firebase';
import { heatFeatures } from '@/utils/heatmap';

/**
 * The globe's heat layer: one read of aggregates/heatmap, cached 12 h
 * (aggregateDiscovery rewrites it daily). Null until loaded or when empty —
 * the globe then simply has no heat layer.
 */
export function useHeatmap(): GeoJSON.FeatureCollection<GeoJSON.Point, { w: number }> | null {
  const { data } = useQuery({
    queryKey: ['heatmap'],
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'aggregates', 'heatmap'));
      const d = snap.data();
      return heatFeatures(d?.points, d?.stride);
    },
    staleTime: 12 * 60 * 60 * 1000,
    retry: 1,
  });
  return data && data.features.length > 0 ? data : null;
}
