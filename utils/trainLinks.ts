import { OMIO_CITY_IDS } from '@/constants/omioCities';
import { applyTemplate, type LinkTemplates } from '@/utils/partnerLinks';
import { haversineMeters } from '@/utils/tripRoutes';

/** Trains & buses between a trip's cities (spec 2026-11-12): Omio, only for short legs with nothing booked. Pure. */
export const TRAIN_MAX_KM = 800;
export type LegCity = { name: string; lat: number | null; lng: number | null };

export const foldCity = (name: string) =>
  name.split(',')[0].normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

export function omioUrl(from: string, to: string, templates: LinkTemplates, ids: Record<string, number> = OMIO_CITY_IDS): string {
  const a = ids[foldCity(from)], b = ids[foldCity(to)];
  const url = a && b ? `https://www.omio.com/?departure_fk=${a}&arrival_fk=${b}` : 'https://www.omio.com/';
  return applyTemplate(url, templates.omio);
}

export function trainLink(prev: LegCity, city: LegCity, gettingHereCount: number, templates: LinkTemplates, ids?: Record<string, number>) {
  if (gettingHereCount > 0) return null;
  if (prev.lat == null || prev.lng == null || city.lat == null || city.lng == null) return null;
  const km = haversineMeters({ lat: prev.lat, lng: prev.lng }, { lat: city.lat, lng: city.lng }) / 1000;
  if (km > TRAIN_MAX_KM) return null;
  return { label: `Find trains & buses ${prev.name} → ${city.name} · Omio`, url: omioUrl(prev.name, city.name, templates, ids) };
}
