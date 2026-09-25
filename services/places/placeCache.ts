import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/services/firebase';
import type { EnrichedPlace } from '@/stores/usePlacesStore';

/**
 * A shared, cross-user cache of Google Places tier2 data.
 *
 * enrichPlaceById() is the app's single most expensive call: the tier2 field
 * mask includes rating, priceLevel, openingHours and editorialSummary, which
 * puts it in the costly Atmosphere SKU. Before this, every user paid it again
 * for every place, every session — so cost scaled with engagement, which is
 * backwards for a subscription.
 *
 * `places/{placeId}` is deliberately a TOP-LEVEL collection, not nested under
 * a user or a trip: the first person to open Lisbon pays for it, and everyone
 * afterwards reads Firestore. A document read is several orders of magnitude
 * cheaper than the API call it replaces, so even a low hit rate pays.
 *
 * Nothing here is authoritative — a miss, a stale entry or a failed read just
 * means the normal Google path runs. Never let the cache break the feature.
 */

/**
 * How long a cached place is trusted.
 *
 * Generous on purpose. Most of what we store never changes — name, address,
 * coordinates, primaryType, viewport, photo names. Only rating and opening
 * hours drift, and a rating being a few weeks out of date costs a trip
 * planner nothing, while a short TTL costs a paid API call per expiry.
 */
export const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Milliseconds since epoch, or null/undefined when the entry has no stamp. */
export function isCacheFresh(cachedAtMs: number | null | undefined, nowMs: number): boolean {
  if (typeof cachedAtMs !== 'number' || Number.isNaN(cachedAtMs)) return false;
  // A future stamp means device clock skew against serverTimestamp, not a
  // stale entry. Refetching to correct a clock would spend real money.
  if (cachedAtMs > nowMs) return true;
  return nowMs - cachedAtMs < CACHE_TTL_MS;
}

/**
 * Firestore rejects `undefined` outright, and tier2FieldsFromRaw returns
 * undefined for every field Google omitted — most places lack at least one.
 * null, 0, '' and [] are kept: they are real values here.
 */
export function stripUndefined<T extends Record<string, unknown>>(value: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (v !== undefined) out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * A cached tier2 payload, or null on a miss, a stale entry, or any failure.
 * Never throws: the caller falls through to Google.
 */
export async function readCachedPlace(placeId: string): Promise<Partial<EnrichedPlace> | null> {
  if (!placeId) return null;
  try {
    const snap = await getDoc(doc(db, 'places', placeId));
    if (!snap.exists()) return null;

    const data = snap.data();
    const cachedAtMs = data.cachedAt?.toMillis?.() ?? null;
    if (!isCacheFresh(cachedAtMs, Date.now())) return null;

    const { cachedAt: _cachedAt, ...fields } = data;
    return fields as Partial<EnrichedPlace>;
  } catch (error) {
    console.warn('[placeCache] read failed, falling through to Google:', error);
    return null;
  }
}

/**
 * Store a freshly fetched place for everyone else. Fire-and-forget by design:
 * the user already has their data, and a failed cache write must never delay
 * or break the sheet that triggered it.
 */
export function writeCachedPlace(placeId: string, fields: Partial<EnrichedPlace>): void {
  if (!placeId) return;
  setDoc(
    doc(db, 'places', placeId),
    { ...stripUndefined(fields as Record<string, unknown>), cachedAt: serverTimestamp() },
    { merge: true },
  ).catch((error) => {
    console.warn('[placeCache] write failed:', error);
  });
}
