/**
 * Where a newly created trip opens (owner, 2026-11-05): on top of the Profile tab, so Back goes to your trips — not to
 * the create form (manual), the AI form (AI: Create → form → generating → trip) or the photo picker. Finish the modal
 * flow first (Architecture Rule 15), switch tab, then open the trip once the stack has settled: changing the stack
 * while a modal was still re-rendering crashed Android in 1.0.7 ("The specified child already has a parent").
 */
import { router } from 'expo-router';

export function openCreatedTrip(tripId: string, query = ''): void {
  if (router.canDismiss()) router.dismissAll();
  router.navigate('/(tabs)/profile');
  setTimeout(() => router.push(`/trip/${tripId}${query}` as never), 60);
}
