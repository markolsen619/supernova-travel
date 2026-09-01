import { Timestamp } from 'firebase/firestore';
import type { EnrichedPlace } from '@/stores/usePlacesStore';
import type { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import type { TripActivity } from '@/types';
import { buildTextSearchBody, type PlaceBias } from '@/utils/placeQuery';

// COST GUARD: every fetch in this file hits Google Places API (New), which is
// billable per request/session at tiered SKUs. Field masks below are kept
// explicit and deliberately minimal per call site — never widen one without
// checking which SKU tier the added field falls into. This code has no
// client-side spend cap; a daily budget/quota cap must be set in Google Cloud
// Console (billing owner's responsibility, not enforced here).
const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

// Tier 1: minimal identity + type-aware-fly-in fields, all in the cheap SKU
// tier (same class as location/addressComponents). Used for the session-
// terminating Details call when the caller doesn't need photos/rating/hours
// (e.g. the trip-creation destination picker) — keeps that call cheap.
export const TIER1_DETAILS_FIELD_MASK = 'id,displayName,location,addressComponents,primaryType,viewport';

// Tier 2: all fields needed for the enriched place sheet (photos, rating, hours,
// summary) + trip creation. Listed explicitly so we never accidentally request
// costly fields. Higher-cost SKU tier — only requested when the caller actually
// needs sheet-quality data: the search path's session-terminating Details call
// (Flow A), a Text Search on a POI tap (Flow B), or a standalone Place Details
// upgrade call. Never for autocomplete list rows or the cheap destination-picker
// selection path.
const TIER2_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
  'primaryType',
  'viewport',
  'rating',
  'userRatingCount',
  'priceLevel',
  'regularOpeningHours.weekdayDescriptions',
  'photos',
  'editorialSummary',
] as const;

// Single-object endpoints (GET /v1/places/{id}) — unprefixed.
export const TIER2_FIELD_MASK = TIER2_FIELDS.join(',');
// List endpoints (POST /v1/places:searchText) — each field prefixed `places.`.
const TIER2_LIST_FIELD_MASK = TIER2_FIELDS.map((f) => `places.${f}`).join(',');

// Grounding needs an identity and a position — nothing else. Excluding
// rating/priceLevel/openingHours/editorialSummary drops the call from the
// Atmosphere SKU to Text Search Pro ($32/1k, 5,000 free vs 1,000).
const GROUNDING_FIELDS = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'addressComponents',
] as const;

export const GROUNDING_LIST_FIELD_MASK = GROUNDING_FIELDS.map((f) => `places.${f}`).join(',');

type RawAddressComponent = { types: string[]; shortText: string };
type RawLatLng = { latitude?: number; longitude?: number };
export type RawViewport = { low?: RawLatLng; high?: RawLatLng };
type RawPhoto = { name?: string };

export type PlaceViewportBounds = { ne: [number, number]; sw: [number, number] };

/** Google's viewport → Mapbox `fitBounds` corner pairs, as [lng, lat] positions. */
export function viewportToBounds(viewport: RawViewport | undefined): PlaceViewportBounds | null {
  const { low, high } = viewport ?? {};
  if (
    low?.latitude == null || low?.longitude == null ||
    high?.latitude == null || high?.longitude == null
  ) {
    return null;
  }
  return {
    ne: [high.longitude, high.latitude],
    sw: [low.longitude, low.latitude],
  };
}

// ── Zoom ladder (Part A) ──────────────────────────────────────────────────────
// Tuned for Mapbox's globe view — a country needs a wide frame, a restaurant
// needs a tight one. Only used when Google doesn't give us a viewport to fit.
const COUNTRY_TYPES = new Set(['country']);
const REGION_TYPES = new Set([
  'administrative_area_level_1',
  'administrative_area_level_2',
  'administrative_area_level_3',
  'administrative_area_level_4',
  'administrative_area_level_5',
  'administrative_area',
]);
const LOCALITY_TYPES = new Set(['locality', 'postal_town']);
const NEIGHBORHOOD_TYPES = new Set([
  'neighborhood',
  'sublocality',
  'sublocality_level_1',
  'sublocality_level_2',
  'sublocality_level_3',
  'sublocality_level_4',
  'sublocality_level_5',
]);

/** Starting-point zoom ladder — tune these on device. */
export function zoomForPlaceType(primaryType: string | null | undefined): number {
  if (primaryType && COUNTRY_TYPES.has(primaryType)) return 3.5;
  if (primaryType && REGION_TYPES.has(primaryType)) return 5.5;
  if (primaryType && LOCALITY_TYPES.has(primaryType)) return 9;
  if (primaryType && NEIGHBORHOOD_TYPES.has(primaryType)) return 12;
  // Unknown type falls back to the tightest zoom (establishment/POI) — never
  // buries a point of interest at a wide zoom the way a wrong-direction
  // fallback would.
  return 15.5;
}

/**
 * Flow A (autocomplete selection) — wraps a PlaceSelection into an EnrichedPlace
 * without an extra network call. `sel.tier` reflects which field mask the
 * session-terminating Details call actually requested: 'tier2' when the caller
 * opted into richDetails (search.tsx — photos/rating/hours/summary came back in
 * that same billed call, so the sheet won't need to fetch them again), 'tier1'
 * for the cheap destination-picker path (DestinationPicker.tsx), where address
 * is empty because formattedAddress isn't in the cheap mask.
 */
export function placeFromSelection(sel: PlaceSelection): EnrichedPlace | null {
  if (sel.lat === null || sel.lng === null) return null;
  return {
    placeId: sel.placeId,
    name: sel.name,
    address: sel.address ?? '',
    lat: sel.lat,
    lng: sel.lng,
    countryCode: sel.countryCode,
    tier: sel.tier ?? 'tier1',
    primaryType: sel.primaryType,
    viewport: sel.viewport,
    rating: sel.rating,
    userRatingCount: sel.userRatingCount,
    priceLevel: sel.priceLevel,
    openingHours: sel.openingHours,
    photoNames: sel.photoNames,
    summary: sel.summary,
  };
}

/** Shared Text Search call — both POI-tap grounding and AI-stop grounding
 * (Part B) hit the same endpoint/mask, just with a different query shape. */
async function textSearchFirstResult(
  body: Record<string, unknown>,
  logLabel: string,
  fieldMask: string = TIER2_LIST_FIELD_MASK, // default preserves every existing caller
): Promise<RawTier2Place | null> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`[${logLabel}] HTTP`, res.status, await res.text());
    return null;
  }

  const json = (await res.json()) as { places?: RawTier2Place[] };
  return json.places?.[0] ?? null;
}

/**
 * Flow B (Mapbox POI tap) — Google Places Text Search with a tight location
 * bias. Returns a Tier 2 place (full field mask) or null on failure.
 *
 * Call only on cache miss. The caller is responsible for storing the result in
 * both the reconciliation cache (_reconCache) and the place-detail cache (_placeCache).
 */
export async function enrichPoiByNameAndCoords(
  name: string,
  lat: number,
  lng: number,
): Promise<EnrichedPlace | null> {
  const place = await textSearchFirstResult(
    {
      textQuery: name,
      locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 100.0 } },
      maxResultCount: 1,
      languageCode: 'en',
    },
    'enrichPoiByNameAndCoords',
  );
  if (!place) return null;

  const components = place.addressComponents ?? [];
  const countryCode =
    components.find((c) => c.types.includes('country'))?.shortText ?? null;

  return {
    placeId: place.id ?? '',
    name: place.displayName?.text ?? name,
    address: place.formattedAddress ?? '',
    lat: place.location?.latitude ?? lat,
    lng: place.location?.longitude ?? lng,
    countryCode,
    tier: 'tier2',
    ...tier2FieldsFromRaw(place),
  };
}

/**
 * Tap-anywhere fallback — what is physically near these coordinates?
 *
 * Mapbox Standard declutters labels aggressively, so most POIs it knows about
 * are never drawn and therefore never tappable. When a tap finds no rendered
 * feature, this answers "what is actually here?" instead of the map appearing
 * broken.
 *
 * Uses `places:searchNearby` rather than the shared textSearchFirstResult
 * helper: that helper hits `places:searchText` and returns a single result,
 * and here there is no text to search for and several results are wanted.
 * Same API key, same TIER2 mask, same error posture.
 *
 * Call ONLY on a tap that found nothing, and only above the zoom gate — see
 * shouldFallbackToNearby(). Every call is billed.
 */
export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  radiusM: number,
  maxResults = 5,
): Promise<EnrichedPlace[]> {
  // Clamped here, not only in nearbyRadiusForZoom. This function is exported
  // and every call is billed, so it defends itself rather than trusting each
  // caller to have clamped first. Google's own limits: radius 0-50000m,
  // maxResultCount 1-20 — exceeding either is a 400, i.e. a wasted round trip.
  const radius = Math.min(50000, Math.max(1, radiusM));
  const count = Math.min(20, Math.max(1, Math.trunc(maxResults)));

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': API_KEY,
        'X-Goog-FieldMask': TIER2_LIST_FIELD_MASK,
      },
      body: JSON.stringify({
        locationRestriction: {
          circle: { center: { latitude: lat, longitude: lng }, radius },
        },
        maxResultCount: count,
        rankPreference: 'DISTANCE',
        languageCode: 'en',
      }),
    });

    if (!res.ok) {
      console.error('[searchNearbyPlaces] HTTP', res.status, await res.text());
      return [];
    }

    const json = (await res.json()) as { places?: RawTier2Place[] };
    const places = json.places ?? [];

    return places.map((place) => {
      const components = place.addressComponents ?? [];
      return {
        placeId: place.id ?? '',
        name: place.displayName?.text ?? '',
        address: place.formattedAddress ?? '',
        lat: place.location?.latitude ?? lat,
        lng: place.location?.longitude ?? lng,
        countryCode: components.find((c) => c.types.includes('country'))?.shortText ?? null,
        tier: 'tier2' as const,
        ...tier2FieldsFromRaw(place),
      };
    });
  } catch (error) {
    // Offline or DNS failure. An empty list renders the honest "no places
    // found here" state, which is the right outcome either way.
    console.error('[searchNearbyPlaces] failed', error);
    return [];
  }
}

/**
 * Lazy grounding for AI-generated stops (Part B) — resolves a Gemini-authored
 * searchQuery string (e.g. "Louvre Museum, Paris") to a real Google place,
 * via the SAME Text Search endpoint as the POI-tap path above; no second Text
 * Search implementation. Called once per stop, only on first user interaction
 * with an ungrounded activity (tap in the trip view, add-to-trip, show-on-map)
 * — never at generation time. The caller persists the result
 * (useCreateTrip().updateActivity) and caches it (usePlacesStore.setPlace) so
 * a given stop is never resolved twice.
 *
 * Callers pass the trip destination's centre as `bias` so the search prefers
 * that region — an unbiased call resolves against the whole planet, which is
 * how a trip to La Paz, Baja California Sur used to resolve stops in La Paz,
 * Bolivia.
 *
 * `mask` defaults to `'full'` (TIER2, tier: 'tier2') so every existing caller
 * is unchanged — `useTripCoverResolver` relies on tier2 fields (photoNames)
 * coming back in this same call to skip a separately-billed enrichPlaceById.
 * Pass `mask: 'grounding'` when only coordinates are needed: it uses the
 * cheaper GROUNDING_LIST_FIELD_MASK and returns `tier: 'tier1'` since
 * rating/photos/hours were never requested.
 */
export async function enrichPlaceByQuery(
  query: string,
  bias?: PlaceBias | null,
  mask: 'grounding' | 'full' = 'full',
): Promise<EnrichedPlace | null> {
  const place = await textSearchFirstResult(
    buildTextSearchBody(query, bias),
    'enrichPlaceByQuery',
    mask === 'grounding' ? GROUNDING_LIST_FIELD_MASK : TIER2_LIST_FIELD_MASK,
  );
  if (!place || place.location?.latitude == null || place.location?.longitude == null) {
    return null;
  }

  const components = place.addressComponents ?? [];
  const countryCode =
    components.find((c) => c.types.includes('country'))?.shortText ?? null;

  return {
    placeId: place.id ?? '',
    name: place.displayName?.text ?? query,
    address: place.formattedAddress ?? '',
    lat: place.location.latitude,
    lng: place.location.longitude,
    countryCode,
    ...(mask === 'grounding'
      ? { tier: 'tier1' as const }
      : { tier: 'tier2' as const, ...tier2FieldsFromRaw(place) }),
  };
}

export type RawTier2Place = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: RawLatLng;
  addressComponents?: RawAddressComponent[];
  primaryType?: string;
  viewport?: RawViewport;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  photos?: RawPhoto[];
  editorialSummary?: { text?: string };
};

/** Shared parsing for the tier2-only fields, reused by the Text Search response,
 * the standalone Place Details (upgrade) response, and the search path's rich
 * session-terminating Details response — all return the same shape. Safe to
 * call on a Tier-1-only response too: the extra fields just come back
 * `undefined`, matching PlaceSelection/EnrichedPlace's optional typing. */
export function tier2FieldsFromRaw(place: RawTier2Place): Partial<EnrichedPlace> {
  return {
    primaryType: place.primaryType ?? null,
    viewport: viewportToBounds(place.viewport),
    rating: place.rating,
    userRatingCount: place.userRatingCount,
    priceLevel: place.priceLevel,
    openingHours: place.regularOpeningHours?.weekdayDescriptions,
    photoNames: place.photos
      ?.map((p) => p.name)
      .filter((n): n is string => !!n),
    summary: place.editorialSummary?.text,
  };
}

/**
 * Sheet-open upgrade path (Part B) — a tier1 selection (from autocomplete) has
 * only the cheap Details field mask. When the sheet opens, fetch the richer
 * tier2 fields by placeId directly (no session token: the autocomplete billing
 * session already closed when the Tier 1 Details call fired on selection).
 */
export async function enrichPlaceById(placeId: string): Promise<Partial<EnrichedPlace> | null> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': TIER2_FIELD_MASK,
    },
  });

  if (!res.ok) {
    console.error('[enrichPlaceById] HTTP', res.status, await res.text());
    return null;
  }

  const place = (await res.json()) as RawTier2Place;
  return tier2FieldsFromRaw(place);
}

/** Builds a Places photo media URL. Call lazily at render time — only for the
 * sheet's own photo rail, never for autocomplete/search list rows. */
export function photoUrl(photoName: string, maxWidthPx = 800): string {
  return `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=${maxWidthPx}&key=${API_KEY}`;
}

/** Maps a resolved place into a TripActivity ready for `addActivity()`. */
export function placeToTripActivity(place: EnrichedPlace): Omit<TripActivity, 'id' | 'order'> {
  return {
    type: 'activity',
    title: place.name,
    placeId: place.placeId,
    address: place.address || null,
    lat: place.lat,
    lng: place.lng,
    startTime: null,
    endTime: null,
    durationMinutes: null,
    notes: '',
    bookingRef: null,
    cost: null,
    currency: null,
    mediaUrls: [],
    createdAt: Timestamp.now(),
    searchQuery: null, // already grounded — came from a resolved EnrichedPlace
    visited: false,
    visitedAt: null,
  };
}
