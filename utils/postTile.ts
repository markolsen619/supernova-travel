/** Explore's From travelers tiles (spec 2026-10-29). */
import { firstName } from '@/utils/greeting';

export function postTileLabel(p: { authorDisplayName?: string | null; placeName?: string | null }): string {
  const parts = [firstName(p.authorDisplayName), p.placeName?.trim() || null].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : 'A traveler';
}

export function fromTravelers<T>(posts: T[], n = 10): T[] {
  return posts.slice(0, n);
}
