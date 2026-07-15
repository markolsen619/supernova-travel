import { create } from 'zustand';
import type { PlaceViewportBounds } from '@/services/places/googlePlaces';

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

  setSelectedPlace: (place: EnrichedPlace | null) => void;

  /** Resolve a Mapbox tap cacheKey to a previously seen placeId, if any. */
  getRecon: (cacheKey: string) => string | undefined;
  setRecon: (cacheKey: string, placeId: string) => void;

  /** Look up a cached place by Google placeId. */
  getPlace: (placeId: string) => EnrichedPlace | undefined;
  /** Upsert a place into the detail cache (keyed by place.placeId). */
  setPlace: (place: EnrichedPlace) => void;
}

export const usePlacesStore = create<PlacesState>((set, get) => ({
  selectedPlace: null,
  _reconCache: {},
  _placeCache: {},

  setSelectedPlace: (place) => set({ selectedPlace: place }),

  getRecon: (cacheKey) => get()._reconCache[cacheKey],
  setRecon: (cacheKey, placeId) =>
    set((s) => ({ _reconCache: { ...s._reconCache, [cacheKey]: placeId } })),

  getPlace: (placeId) => get()._placeCache[placeId],
  setPlace: (place) =>
    set((s) => ({ _placeCache: { ...s._placeCache, [place.placeId]: place } })),
}));
