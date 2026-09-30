import type { Tier } from '@/types';

/**
 * What Pro unlocks, as rules the app enforces. Server-side twins: AI trip
 * quota and multi-city (functions/src/generateTrip.ts), trip invites
 * (tripInvites.ts), AI import (quotaUtils FREE_TIER_YEARLY_IMPORT_LIMIT).
 *
 * The wallet's item limit is enforced here, in the app: Firestore rules
 * can't count a user's documents cheaply, and the data is the traveler's own.
 */
export const FREE_WALLET_LIMIT = 2;

export function isPaidTier(tier: Tier | null | undefined): boolean {
  return tier === 'pro' || tier === 'business';
}

/**
 * Whether a traveler may add another wallet item (boarding pass,
 * reservation or loyalty card — one shared allowance). Items saved before
 * the limit existed are never removed; a free traveler over it just can't add.
 */
export function walletAddAllowed(tier: Tier | null | undefined, totalItems: number): boolean {
  return isPaidTier(tier) || totalItems < FREE_WALLET_LIMIT;
}
