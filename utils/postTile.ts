/** Explore's From travelers tiles (spec 2026-10-29). */
import { firstName } from '@/utils/greeting';

export function postTileLabel(p: { authorDisplayName?: string | null; placeName?: string | null }): string {
  const parts = [firstName(p.authorDisplayName), p.placeName?.trim() || null].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : 'A traveler';
}

export function fromTravelers<T>(posts: T[], n = 10): T[] {
  return posts.slice(0, n);
}

/** Where a finished post lands (final review): Explore, whose From travelers row shows it — not Home, which has no feed now. */
export const AFTER_POST_ROUTE = '/(tabs)/explore' as const;
