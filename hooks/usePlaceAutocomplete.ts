import { useState, useEffect, useRef, useCallback } from 'react';
import * as Crypto from 'expo-crypto';

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

type RawAddressComponent = { types: string[]; shortText: string };

async function autocompleteRequest(
  input: string,
  sessionToken: string,
): Promise<PlaceSuggestion[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': API_KEY },
    body: JSON.stringify({ input, sessionToken, languageCode: 'en' }),
  });
  if (!res.ok) throw new Error(`autocomplete ${res.status}`);
  const json = await res.json();
  return ((json.suggestions ?? []) as RawSuggestion[]).map((s) => ({
    placeId: s.placePrediction.placeId,
    mainText: s.placePrediction.structuredFormat.mainText.text,
    secondaryText: s.placePrediction.structuredFormat.secondaryText?.text ?? '',
  }));
}

// Completing a session with a Place Details call groups all autocomplete
// keystrokes + this single details call into one billable session.
async function placeDetailsRequest(
  placeId: string,
  sessionToken: string,
): Promise<PlaceSelection> {
  const res = await fetch(`https://places.googleapis.com/v1/places/${placeId}`, {
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'id,displayName,location,addressComponents',
      'X-Goog-Session-Token': sessionToken,
    },
  });
  if (!res.ok) throw new Error(`place details ${res.status}`);
  const json = await res.json();
  const components = (json.addressComponents as RawAddressComponent[] | undefined) ?? [];
  const countryCode = components.find((c) => c.types.includes('country'))?.shortText ?? null;
  return {
    placeId: (json.id as string | undefined) ?? placeId,
    name: (json.displayName as { text?: string } | undefined)?.text ?? '',
    lat: (json.location as { latitude?: number } | undefined)?.latitude ?? null,
    lng: (json.location as { longitude?: number } | undefined)?.longitude ?? null,
    countryCode,
  };
}

export function usePlaceAutocomplete(debounceMs = 350) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);
  // One token per search session — reused across all autocomplete requests until
  // selectPlace() is called, which closes the billing session.
  const sessionTokenRef = useRef<string>(Crypto.randomUUID());

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
        const results = await autocompleteRequest(query.trim(), sessionTokenRef.current);
        if (!cancelled) setSuggestions(results);
      } catch {
        if (!cancelled) { setError(true); setSuggestions([]); }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, debounceMs);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, debounceMs]);

  const selectPlace = useCallback(async (placeId: string): Promise<PlaceSelection> => {
    const token = sessionTokenRef.current;
    sessionTokenRef.current = Crypto.randomUUID(); // begin fresh session for next search
    const selection = await placeDetailsRequest(placeId, token);
    setSuggestions([]);
    setQuery('');
    return selection;
  }, []);

  const clearQuery = useCallback(() => {
    setQuery('');
    setSuggestions([]);
    setError(false);
  }, []);

  return { query, setQuery, suggestions, isLoading, error, selectPlace, clearQuery };
}
