/**
 * Year in Travel on the phone (spec 2026-11-01-year-in-travel-design.md): which slides show, the story's clock,
 * when Home offers it, and its wording. Pure.
 */
export type SlideId = 'opener' | 'numbers' | 'map' | 'records' | 'taste' | 'photos' | 'companions' | 'next' | 'share';

export function visibleSlides(s: { trips: number; photos: unknown[]; companions: unknown[]; places: unknown[]; longestTrip: unknown }): SlideId[] {
  if (s.trips === 0) return ['opener', 'next'];
  const out: SlideId[] = ['opener', 'numbers'];
  if (s.places.length) out.push('map');
  if (s.longestTrip) out.push('records');
  out.push('taste');
  if (s.photos.length) out.push('photos');
  if (s.companions.length) out.push('companions');
  out.push('next', 'share');
  return out;
}

export const SLIDE_MS = 6000;
export interface StoryState { index: number; elapsed: number; paused: boolean; done: boolean }
export type StoryAction = { type: 'tick'; dt: number; count: number } | { type: 'next' | 'prev'; count: number } | { type: 'pause' | 'resume' };

export function storyStep(s: StoryState, a: StoryAction): StoryState {
  switch (a.type) {
    case 'pause': return { ...s, paused: true };
    case 'resume': return { ...s, paused: false };
    case 'next': return s.index >= a.count - 1 ? { ...s, done: true } : { ...s, index: s.index + 1, elapsed: 0 };
    case 'prev': return { ...s, index: Math.max(0, s.index - 1), elapsed: 0 };
    case 'tick': {
      if (s.paused || s.done) return s;
      const elapsed = s.elapsed + a.dt;
      if (elapsed < SLIDE_MS) return { ...s, elapsed };
      // The last slide (the share card) stays until closed.
      return s.index >= a.count - 1 ? { ...s, elapsed: SLIDE_MS } : { ...s, index: s.index + 1, elapsed: 0 };
    }
  }
}

/** Dec 1 – Jan 15: the year being celebrated (January looks back at last year); otherwise null. */
export function showYearCard(now: Date): number | null {
  const m = now.getMonth(), d = now.getDate();
  if (m === 11) return now.getFullYear();
  if (m === 0 && d <= 15) return now.getFullYear() - 1;
  return null;
}

const EARTH_KM = 40_075;
export function kmLine(km: number): string {
  if (km <= 0) return 'Every journey starts somewhere.';
  const n = km.toLocaleString('en-US');
  const times = Math.floor(km / EARTH_KM);
  if (times >= 2) return `You covered ${n} km, around the Earth ${times === 2 ? 'twice' : `${times} times`}.`;
  if (times === 1) return `You covered ${n} km, more than once around the Earth.`;
  return `You covered ${n} km, about ${Math.max(1, Math.round((km / EARTH_KM) * 100))}% of the way around the Earth.`;
}

const STYLE_NAMES: Record<string, string> = {
  adventure: 'an Adventurer', luxury: 'a Luxury traveler', budget: 'a Budget traveler', family: 'a Family traveler',
  cultural: 'a Culture lover', party: 'a Night owl', relax: 'a Slow traveler', foodie: 'a Foodie', romantic: 'a Romantic',
};
export const styleLine = (style: string | null): string | null => (style && STYLE_NAMES[style] ? `You travel like ${STYLE_NAMES[style]}` : null);

export const countLabel = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

export function typeLine(c: { restaurant: number; activity: number }): string | null {
  const parts = [c.restaurant ? countLabel(c.restaurant, 'restaurant', 'restaurants') : null, c.activity ? countLabel(c.activity, 'sight', 'sights') : null].filter(Boolean);
  return parts.length ? `You saved ${parts.join(' and ')}` : null;
}

/** Whether a trip has already started this year (or crossed into it) — Profile's "Your {year} in travel" row. */
export function hasTripThisYear(trips: { startDate: Date | null; endDate?: Date | null }[], now: Date): boolean {
  const y = now.getFullYear();
  return trips.some((t) => {
    if (!t.startDate || t.startDate > now) return false;
    const end = t.endDate ?? t.startDate;
    return t.startDate.getFullYear() === y || end.getFullYear() === y;
  });
}

/** The share card's three numbers with singular labels ("1 trip", review 2026-11-01). */
export function shareCells(s: { trips: number; cities: number; countries: number }): [string, string][] {
  const cell = (n: number, one: string, many: string): [string, string] => [n.toLocaleString('en-US'), n === 1 ? one : many];
  return [cell(s.trips, 'trip', 'trips'), cell(s.cities, 'city', 'cities'), cell(s.countries, 'country', 'countries')];
}

/**
 * Photo tiles for the best-moments slide: two across on a phone, three on iPad, and never taller than the space
 * for six photos (a 1024-pt iPad drew three rows of ~500 pt; review 2026-11-01).
 */
export function photoTile(a: { width: number; height: number; large: boolean }): { size: number; columns: number } {
  const gap = 12, label = 36, columns = a.large ? 3 : 2, rows = Math.ceil(6 / columns);
  const byWidth = (a.width - gap * (columns - 1)) / columns;
  const byHeight = (a.height - label - gap * (rows - 1)) / rows;
  return { size: Math.floor(Math.min(byWidth, byHeight)), columns };
}
