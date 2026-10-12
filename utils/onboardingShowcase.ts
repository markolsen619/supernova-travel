import type { ActivityType } from '@/types';

/**
 * Onboarding's showcase rules (2026-10-11): the slides show Supernova's own editorial trips
 * (no dates, no "Upcoming", nobody's real plans) and a different handful of travelers each time.
 */

/** The App Review demo account (Sam Rivera) — never shown to real people as a traveler to follow. */
export const DEMO_REVIEW_UID = 'BHk0XvWcDUgqs6AW0oH3cqnuEUv1';

export interface FaceCandidate {
  uid: string;
  name: string;
  avatarUrl: string | null;
  isPrivate?: boolean;
  isEditorial?: boolean;
  moderationHidden?: boolean;
}

/**
 * A random draw of `count` travelers from the pool: public people with a photo, never yourself,
 * the editorial account or the review account. `random` is injected so tests can seed it.
 */
export function pickCommunityFaces<T extends FaceCandidate>(
  pool: T[],
  count: number,
  opts: { selfUid: string | null; random: () => number },
): T[] {
  const seen = new Set<string>();
  const eligible = pool.filter((f) => {
    if (seen.has(f.uid)) return false;
    seen.add(f.uid);
    return !!f.avatarUrl && !f.isPrivate && !f.isEditorial && !f.moderationHidden
      && f.uid !== opts.selfUid && f.uid !== DEMO_REVIEW_UID;
  });
  // Fisher–Yates, partial: only the first `count` places need shuffling.
  const a = [...eligible];
  const n = Math.min(count, a.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(opts.random() * (a.length - i));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/** `ITALY · ROME` above an editorial trip's title: the catalog's country name, else its code. */
export function editorialEyebrow(
  trip: { destination: { name: string; countryCode?: string | null }; destinationKeys?: string[] },
  countryBySlug: Record<string, string>,
): string {
  const country = (trip.destinationKeys ?? []).map((k) => countryBySlug[k]).find(Boolean) ?? trip.destination.countryCode ?? null;
  const city = trip.destination.name.toUpperCase();
  return country ? `${country.toUpperCase()} · ${city}` : city;
}

export interface PreviewRow {
  type: ActivityType;
  title: string;
  place: string | null;
}

/** The first stops of a day, in plan order, for the AI itinerary slide. */
export function itineraryPreview(
  activities: { type: ActivityType; title: string; placeName?: string | null; order?: number }[],
  max = 4,
): PreviewRow[] {
  return [...activities]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .slice(0, max)
    .map((a) => ({ type: a.type, title: a.title, place: a.placeName ?? null }));
}
