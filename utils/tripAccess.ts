import type { Trip } from '@/types';

/**
 * Taking the trip: its owner, or someone who accepted an invite. Only members
 * see or change the budget, expenses and packing list — matching
 * firestore.rules, which refuses everyone else. Following the owner, or the
 * trip being public, is not membership.
 */
export function isTripMember(trip: Pick<Trip, 'authorUid' | 'collaborators'> | undefined | null, uid: string): boolean {
  if (!trip || !uid) return false;
  return trip.authorUid === uid || (Array.isArray(trip.collaborators) && trip.collaborators.includes(uid));
}
