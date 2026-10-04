import { useCallback } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { callMatchBooking } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBookingBannerStore } from '@/stores/useBookingBannerStore';
import { isPaidTier } from '@/utils/proFeatures';

/** After a booking is saved: Pro → ask the server which trip it belongs to. Never throws; a failed match leaves the booking as saved. */
export function useBookingMatch() {
  const tier = useAuthStore((s) => s.tier);
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();
  const show = useBookingBannerStore((s) => s.show);

  const afterSave = useCallback(async (kind: 'boarding_pass' | 'reservation', id: string) => {
    if (!isPaidTier(tier)) return;
    try {
      const result = await callMatchBooking(kind, id);
      queryClient.invalidateQueries({ queryKey: [kind === 'boarding_pass' ? 'boardingPasses' : 'reservations', uid] });
      // A new link can be to a trip made moments ago, and shows on its trip page.
      queryClient.invalidateQueries({ queryKey: ['myTrips'] });
      queryClient.invalidateQueries({ queryKey: ['tripBookings'] });
      if (result.kind === 'link') show({ kind, id, trip: result.trip });
      if (result.kind === 'ask') {
        router.push(kind === 'boarding_pass' ? `/(wallet)/boarding-pass/${id}` : `/(wallet)/reservation/${id}`);
      }
    } catch (err) {
      console.warn('[wallet] match failed; the trip trigger or "Add to a trip" covers it', err);
    }
  }, [tier, uid, queryClient, show]);

  return { afterSave };
}
