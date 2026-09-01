import { create } from 'zustand';
import type { PlaceViewportBounds } from '@/services/places/googlePlaces';
import { nearbyCacheKey } from '@/utils/mapInteraction';

export interface EnrichedPlace {
  placeId: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  countryCode: string | null;
  /** How this place was fetched — controls which fields are populated */
  tier: 'tier1' | 'tier2';

  // ── Type-aware fly-in (Part A) — populated by both tiers ──────────────────
  /** Google's primaryType (e.g. "country", "locality", "restaurant"). */
  primaryType?: string | null;
  /** Bounding box to fit the camera to, when Google provides one. */
  viewport?: PlaceViewportBounds | null;

  // ── Sheet enrichment (Part B) — tier2 only ─────────────────────────────────
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  /** Full week, Monday-first, e.g. ["Monday: 9:00 AM – 5:00 PM", ...]. */
  openingHours?: string[];
  /** Photo resource names (places/{id}/photos/{ref}) — build URLs lazily via photoUrl(). */
  photoNames?: string[];
  summary?: string;
}

interface PlacesState {
  selectedPlace: EnrichedPlace | null;
  /**
   * Reconciliation cache: Mapbox POI cacheKey (name::lat::lng) → Google placeId.
   * Prevents a redundant Text Search on re-tap of the same ambient POI.
   */
  _reconCache: Record<string, string>;
  /**
   * Place-detail cache: Google placeId → EnrichedPlace at its current tier.
   * A tier1 entry can be upgraded to tier2 in-place.
   */
  _placeCache: Record<string, EnrichedPlace>;
  /**
   * Nearby Search results cache, keyed by tap coordinates rounded to 4dp
   * (~11m) via nearbyCacheKey. The results sheet has no dismiss affordance,
   * so tapping the map to close it re-runs handleMapPress's fallback path —
   * without this cache that re-taps the SAME billed Nearby Search every time.
   */
  _nearbyCache: Record<string, EnrichedPlace[]>;

  setSelectedPlace: (place: EnrichedPlace | null) => void;

  /** Resolve a Mapbox tap cacheKey to a previously seen placeId, if any. */
  getRecon: (cacheKey: string) => string | undefined;
  setRecon: (cacheKey: string, placeId: string) => void;

  /** Look up a cached place by Google placeId. */
  getPlace: (placeId: string) => EnrichedPlace | undefined;
  /** Upsert a place into the detail cache (keyed by place.placeId). */
  setPlace: (place: EnrichedPlace) => void;

  /** Look up cached Nearby Search results for a coordinate, if any. */
  getNearby: (lat: number, lng: number) => EnrichedPlace[] | undefined;
  /** Cache Nearby Search results for a coordinate. */
  setNearby: (lat: number, lng: number, results: EnrichedPlace[]) => void;
}

export const usePlacesStore = create<PlacesState>((set, get) => ({
  selectedPlace: null,
  _reconCache: {},
  _placeCache: {},
  _nearbyCache: {},

  setSelectedPlace: (place) => set({ selectedPlace: place }),

  getRecon: (cacheKey) => get()._reconCache[cacheKey],
  setRecon: (cacheKey, placeId) =>
    set((s) => ({ _reconCache: { ...s._reconCache, [cacheKey]: placeId } })),

  getPlace: (placeId) => get()._placeCache[placeId],
  setPlace: (place) =>
    set((s) => ({ _placeCache: { ...s._placeCache, [place.placeId]: place } })),

  getNearby: (lat, lng) => get()._nearbyCache[nearbyCacheKey(lat, lng)],
  setNearby: (lat, lng, results) =>
    set((s) => ({
      _nearbyCache: { ...s._nearbyCache, [nearbyCacheKey(lat, lng)]: results },
    })),
}));
