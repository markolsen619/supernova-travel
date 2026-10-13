import type { TravelStyle } from '@/types/ai';

/**
 * The AI-generating screen's wait (2026-10-12): a story that lasts as long as the wait, progress that
 * keeps moving without claiming to finish, and cards that teach the app. The old screen ran out of
 * messages after nine seconds and said "Finalising your trip..." for up to two minutes.
 */

const STORY_SECONDS = 90;
const CARD_SECONDS = 6;

const STYLE_LINES: Record<TravelStyle, string> = {
  adventure: 'Finding the hikes and adventures worth the effort',
  luxury: 'Picking the most memorable places to stay and dine',
  budget: 'Finding the best things that cost little or nothing',
  family: 'Choosing spots the whole family will enjoy',
  cultural: 'Lining up the museums, history and landmarks',
  party: 'Scouting the bars and nights out',
  relax: 'Leaving room to slow down and unwind',
  foodie: 'Finding the food spots locals swear by',
  romantic: 'Saving the views and dinners made for two',
};

export function generatingMessages(city: string, styles: TravelStyle[]): string[] {
  const styleLines = styles.map((s) => STYLE_LINES[s]).filter(Boolean).slice(0, 3);
  const fillers = ['Finding the places travelers come back to', 'Looking for a few hidden gems', 'Balancing the big sights with quiet corners'];
  const middle = [...styleLines, ...fillers].slice(0, 3);
  return [
    `Mapping ${city}'s neighborhoods`,
    ...middle,
    'Grouping nearby stops so you walk less',
    'Pacing each day so nothing feels rushed',
    'Checking which places suit which time of day',
    'Placing every stop on the map',
    'Writing a few words about each stop',
    'Putting the finishing touches on your trip',
  ];
}

/** Which message to show: the story spreads over ~90 s, then rests on its last line. */
export function messageIndexAt(elapsedSec: number, count: number, spanSec = STORY_SECONDS): number {
  return Math.min(count - 1, Math.floor(Math.max(0, elapsedSec) / (spanSec / count)));
}

/** 0 → about 0.9: moves quickly, then ever more slowly, never past 0.9 until the trip is really ready. */
export function progressAt(elapsedSec: number, expectedSec = 75): number {
  return 0.9 * (1 - Math.exp(-Math.max(0, elapsedSec) / (expectedSec / 2)));
}

export interface WaitCard {
  title: string;
  body: string;
}

const TIPS: WaitCard[] = [
  { title: 'Watch it come alive', body: 'Tap the map on your trip, then play to fly through every day.' },
  { title: 'Make it yours', body: 'Long-press any stop to move it, or add the places you already love.' },
  { title: 'Bring your bookings', body: 'Forward confirmation emails and they land on the right day.' },
  { title: 'Plan it together', body: 'Invite friends to edit the trip with you.' },
];

export function waitCards(topPlaceNames: string[]): WaitCard[] {
  const loved = topPlaceNames.filter(Boolean).slice(0, 3);
  return loved.length > 0 ? [{ title: 'Travelers love here', body: loved.join(' · ') }, ...TIPS] : TIPS;
}

export function waitCardAt(cards: WaitCard[], elapsedSec: number): WaitCard {
  return cards[Math.floor(Math.max(0, elapsedSec) / CARD_SECONDS) % cards.length];
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const km = (aLat: number, aLng: number, bLat: number, bLng: number) => {
  const r = Math.PI / 180;
  const x = (bLng - aLng) * r * Math.cos(((aLat + bLat) / 2) * r);
  const y = (bLat - aLat) * r;
  return 6371 * Math.sqrt(x * x + y * y);
};

/** The catalog destination for a generated trip: within 30 km of its centre, else the same name. */
export function catalogFor<T extends { name: string; center: { lat: number; lng: number } }>(
  list: T[], name: string, lat: number | null, lng: number | null,
): T | null {
  if (lat != null && lng != null) {
    const near = list.find((d) => km(lat, lng, d.center.lat, d.center.lng) <= 30);
    if (near) return near;
  }
  return list.find((d) => fold(d.name) === fold(name)) ?? null;
}
