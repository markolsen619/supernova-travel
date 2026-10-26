/**
 * Names a past trip's stops and cities with Geocoding v6 reverse: a stop is "Neighbourhood, City" (else "City,
 * Country", else "Stop n") at its neighbourhood's centre; never the nearest business (owner, 2026-10-26).
 */
import type { PastTripDraft } from '@/utils/pastTrip';
import { areaFromGeocode, publicPosition, stopFallbackName, stopNameFor } from '@/utils/pastTripPlaces';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
const areaUrl = (lat: number, lng: number, types: string) => `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=${types}&access_token=${TOKEN}`;

export async function nameDraft(d: PastTripDraft, onStop?: (done: number, total: number) => void): Promise<PastTripDraft> {
  const cities = await Promise.all(d.cities.map(async (c) => {
    const area = areaFromGeocode(await getJson(areaUrl(c.lat, c.lng, 'place')));
    // The city's own centre, never the photos' position (final review C1).
    return { ...c, ...publicPosition(null, area.center, c), name: area.city ?? c.name, countryCode: area.countryCode ?? c.countryCode };
  }));
  const total = d.days.reduce((n, day) => n + day.stops.length, 0);
  let done = 0;
  let index = 0;
  const days = [];
  for (const day of d.days) {
    const stops = [];
    for (const s of day.stops) {
      const i = index++;
      // Named after its neighbourhood and city, never the nearest business (owner, 2026-10-26).
      const area = areaFromGeocode(await getJson(areaUrl(s.lat, s.lng, 'neighborhood,locality')));
      const place = area.city && area.country && area.center ? null : areaFromGeocode(await getJson(areaUrl(s.lat, s.lng, 'place')));
      const name = stopNameFor({
        neighbourhood: area.neighbourhood,
        city: area.city ?? place?.city ?? null,
        country: area.country ?? place?.country ?? null,
      }) ?? stopFallbackName(i);
      stops.push({ ...s, ...publicPosition(null, area.center ?? place?.center ?? null, s), name, placeName: null, type: 'activity' as const });
      onStop?.(++done, total);
    }
    days.push({ ...day, stops });
  }
  return { ...d, cities, days };
}
