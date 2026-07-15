import { useState, useEffect, useRef, useCallback } from 'react';
import * as Crypto from 'expo-crypto';
// COST GUARD: both fetch calls below hit billable Google Places API (New)
// SKUs (see services/places/googlePlaces.ts for the full note). No client-side
// spend cap exists — a daily budget/quota cap must be set in Google Cloud
// Console.
import {
  TIER1_DETAILS_FIELD_MASK,
  TIER2_FIELD_MASK,
  tier2FieldsFromRaw,
  type PlaceViewportBounds,
  type RawTier2Place,
} from '@/services/places/googlePlaces';

export interface PlaceSuggestion {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceSelection {
  placeId: string;
  name: string;
  lat: number | null;
  lng: number | null;
  countryCode: string | null;
  /** Google's primaryType (e.g. "country", "locality", "restaurant") — drives the type-aware fly-in zoom. */
  primaryType?: string | null;
  /** Bounding box to fit the camera to, when Google provides one. */
  viewport?: PlaceViewportBounds | null;
  /** Which field mask the terminating Details call actually used — 'tier2' means
   * rating/photos/hours/summary are already populated below, no need to
   * re-fetch on sheet open. Optional: only richDetails callers set it. */
  tier?: 'tier1' | 'tier2';
  address?: string;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  openingHours?: string[];
  photoNames?: string[];
  summary?: string;
}

const API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type RawSuggestion = {
  placePrediction: {
    placeId: string;
    structuredFormat: {
      mainText: { text: string };
      secondaryText?: { text: string };
    };
  };
};

async function autocompleteRequest(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY },
    body: JSON.stringify({ input, sessionToken, languageCode: 'en' }),
  });
  if (!res.ok) {
    const bodyText = await res.text();
    console.error('[autocompleteRequest] HTTP', res.status, bodyText);
    throw new Error(`autocomplete ${res.status}`);
  }
  const json = await res.json();
  return ((json.suggestions ?? []) as RawSuggestion[]).map((s) => ({
    placeId: s.placePrediction.placeId,
    mainText: s.placePrediction.structuredFormat.mainText.text,
    secondaryText: s.placePrediction.structuredFormat.secondaryText?.text ?? '',
  }));
}

// Completing a session with a Place Details call groups all autocomplete
// keystrokes + this single details call into one billable session — the
// session is billed once, at the SKU tier of THIS call's field mask. `tier`
// and `fieldMask` always travel together (caller picks both via richDetails)
// so the resulting PlaceSelection.tier accurately reflects what was fetched,
// never inferred from which fields happen to be present.
async function placeDetailsRequest(
  placeId: string,
  sessionToken: string,
  fieldMask: string,
  tier: 'tier1' | 'tier2',
): Promise<PlaceSelection> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': fieldMask,
      'X-Goog-Session-Token': sessionToken,
    },
  });
  if (!res.ok) {
    const bodyText = await res.text();
    console.error('[placeDetailsRequest] HTTP', res.status, bodyText);
    throw new Error(`place details ${res.status}`);
  }
  const json = (await res.json()) as RawTier2Place;
  const components = json.addressComponents ?? [];
  const countryCode = components.find((c) => c.types.includes('country'))?.shortText ?? null;
  return {
    placeId: json.id ?? placeId,
    name: json.displayName?.text ?? '',
    lat: json.location?.latitude ?? null,
    lng: json.location?.longitude ?? null,
    countryCode,
    tier,
    // formattedAddress is only in the Tier-2 mask — undefined (not '') on the
    // cheap path, matching PlaceSelection's optional typing; placeFromSelection
    // falls back to '' for display.
    address: json.formattedAddress,
    // Safe when fieldMask was Tier-1: the tier2-only fields just come back
    // undefined, matching PlaceSelection's optional typing.
    ...tier2FieldsFromRaw(json),
  };
}

export interface UsePlaceAutocompleteOptions {
  /**
   * When true, the session-terminating Details call requests the Tier-2 field
   * mask (photos/rating/hours/summary) instead of the cheap Tier-1 mask —
   * collapses what would otherwise be two billed Details calls (one here, one
   * later via enrichPlaceById on sheet open) into one. Only opt in where the
   * sheet is guaranteed to open right after selection (search.tsx's Flow A);
   * leave false for pickers that only need placeId/name/lat/lng/countryCode
   * (e.g. the trip-creation destination picker) to keep that call cheap.
   */
  richDetails?: boolean;
}

export function usePlaceAutocomplete(
  debounceMs = 350,
  options?: UsePlaceAutocompleteOptions,
) {
  const richDetails = options?.richDetails ?? false;
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  // One token per search session — reused across all autocomplete requests until
  // selectPlace() is called, which closes the billing session. Lazy-initialized:
  // a bare `useRef(Crypto.randomUUID())` would call randomUUID() on every
  // render (the arg is evaluated each time even though useRef only keeps the
  // first), needlessly burning a UUID per re-render.
  const sessionTokenRef = useRef<string | null>(null);
  const getSessionToken = useCallback((): string => {
    if (sessionTokenRef.current === null) {
      sessionTokenRef.current = Crypto.randomUUID();
    }
    return sessionTokenRef.current;
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSuggestions([]);
      setError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setError(false);

    const timer = setTimeout(async () => {
      try {
        const results = await autocompleteRequest(query.trim(), getSessionToken());
        if (!cancelled) setSuggestions(results);
      } catch (err) {
        console.error('[usePlaceAutocomplete] search failed:', err);
        if (!cancelled) { setError(true); setSuggestions([]); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, debounceMs);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, debounceMs, getSessionToken]);

  const selectPlace = useCallback(async (placeId: string): Promise<PlaceSelection> => {
    const token = getSessionToken();
    sessionTokenRef.current = Crypto.randomUUID(); // terminating call sent; begin fresh session for next search
    const fieldMask = richDetails ? TIER2_FIELD_MASK : TIER1_DETAILS_FIELD_MASK;
    const tier = richDetails ? 'tier2' : 'tier1';
    const selection = await placeDetailsRequest(placeId, token, fieldMask, tier);
    setSuggestions([]);
    setQuery('');
    return selection;
  }, [getSessionToken, richDetails]);

  const clearQuery = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setError(false);
  }, []);

  return { query, setQuery, suggestions, isLoading, error, selectPlace, clearQuery };
}
