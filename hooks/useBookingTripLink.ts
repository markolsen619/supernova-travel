import { useCallback, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { linkPatch } from '@/utils/walletLink';

/** Link, unlink or dismiss a wallet booking's trip by hand (manual links are never changed automatically). */
export function useBookingTripLink(kind: 'boarding_pass' | 'reservation', id: string) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [pending, setPending] = useState(false);

  const write = useCallback(async (patch: Record<string, unknown>) => {
    setPending(true);
    try {
      await updateDoc(doc(db, kind === 'boarding_pass' ? 'boarding_passes' : 'reservations', id), patch);
      queryClient.invalidateQueries({ queryKey: [kind === 'boarding_pass' ? 'boardingPasses' : 'reservations', uid] });
      queryClient.invalidateQueries({ queryKey: ['tripBookings'] });
    } catch (err) {
      console.warn('[wallet] trip link change failed', err);
    } finally {
      setPending(false);
    }
  }, [kind, id, uid, queryClient]);

  const link = useCallback((tripId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    write(linkPatch('link', tripId));
  }, [write]);
  const unlink = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    write(linkPatch('unlink'));
  }, [write]);
  const notForTrip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    write(linkPatch('not_for_trip'));
  }, [write]);

  return { link, unlink, notForTrip, pending };
}
