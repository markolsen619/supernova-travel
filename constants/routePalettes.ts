/**
 * Colours a traveler can choose for their trip routes (TripMapView). Every
 * colour clears 4.5:1 against the dark map — enforced by
 * __tests__/constants/routePalettes.test.ts, so a new palette can't ship a
 * line that disappears into the night preset.
 */
export type RoutePaletteId = 'aurora' | 'sunset' | 'ocean' | 'forest' | 'moonlight';

export interface RoutePalette {
  id: RoutePaletteId;
  label: string;
  /** One per day, cycling. */
  days: string[];
  /** The "trip you actually took" line. */
  actual: string;
}

export const ROUTE_PALETTES: RoutePalette[] = [
  { id: 'aurora', label: 'Aurora', days: ['#a78bfa', '#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#c4b5fd', '#f9a8d4', '#93c5fd'], actual: '#f472b6' },
  { id: 'sunset', label: 'Sunset', days: ['#fb923c', '#f472b6', '#facc15', '#f87171', '#fda4af', '#fdba74'], actual: '#fde047' },
  { id: 'ocean', label: 'Ocean', days: ['#38bdf8', '#22d3ee', '#60a5fa', '#2dd4bf', '#a5f3fc', '#93c5fd'], actual: '#34d399' },
  { id: 'forest', label: 'Forest', days: ['#4ade80', '#a3e635', '#34d399', '#facc15', '#86efac', '#bef264'], actual: '#fbbf24' },
  { id: 'moonlight', label: 'Moonlight', days: ['#f5f3f9', '#c4b5fd', '#e9d5ff', '#cbd5e1', '#ddd6fe', '#e2e8f0'], actual: '#a78bfa' },
];

export function routePalette(id: string | null | undefined): RoutePalette {
  return ROUTE_PALETTES.find((p) => p.id === id) ?? ROUTE_PALETTES[0];
}

export function dayRouteColor(palette: RoutePalette, dayIndex: number): string {
  return palette.days[dayIndex % palette.days.length];
}
