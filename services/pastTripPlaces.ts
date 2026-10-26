/**
 * Names a past trip's stops and cities: one Search Box reverse (POIs) per stop, one Geocoding v6 reverse per stop
 * for its neighbourhood and per city for its name. A failed lookup names the stop after its area, else "Stop n".
 */
import type { PastTripDraft } from '@/utils/pastTrip';
import { areaFromGeocode, poiFromSearchBox, stopFallbackName } from '@/utils/pastTripPlaces';

const TOKEN = process.env.EXPO_PUBLIC_MAPBOX_TOKEN ?? '';

async function getJson(url: string): Promise<unknown> {
  try {
    const res = await fetch(url);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
const poiUrl = (lat: number, lng: number) => `https://api.mapbox.com/search/searchbox/v1/reverse?longitude=${lng}&latitude=${lat}&types=poi&limit=5&access_token=${TOKEN}`;
const areaUrl = (lat: number, lng: number, types: string) => `https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=${types}&access_token=${TOKEN}`;

export async function nameDraft(d: PastTripDraft, onStop?: (done: number, total: number) => void): Promise<PastTripDraft> {
  const cities = await Promise.all(d.cities.map(async (c) => {
    const area = areaFromGeocode(await getJson(areaUrl(c.lat, c.lng, 'place')));
    return { ...c, name: area.city ?? c.name, countryCode: area.countryCode ?? c.countryCode };
  }));
  const total = d.days.reduce((n, day) => n + day.stops.length, 0);
  let done = 0;
  let index = 0;
  const days = [];
  for (const day of d.days) {
    const stops = [];
    for (const s of day.stops) {
      const i = index++;
      const [poi, area] = await Promise.all([
        getJson(poiUrl(s.lat, s.lng)).then((j) => poiFromSearchBox(j, s)),
        getJson(areaUrl(s.lat, s.lng, 'neighborhood,locality')).then(areaFromGeocode),
      ]);
      const name = poi?.name ?? area.neighbourhood ?? stopFallbackName(i);
      stops.push({ ...s, name, placeName: poi?.name ?? null, type: poi?.type ?? 'activity' });
      onStop?.(++done, total);
    }
    days.push({ ...day, stops });
  }
  return { ...d, cities, days };
}
