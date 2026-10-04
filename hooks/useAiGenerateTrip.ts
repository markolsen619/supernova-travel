import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { router } from 'expo-router';
import { useLimitPaywall } from '@/hooks/useLimitPaywall';
import { callGenerateTrip } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { GenerateTripRequest } from '@/types/ai';
import { collection, doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { isConnectionLoss, waitForGeneratedTrip } from '@/utils/generationRecovery';

/**
 * Generates a trip, surviving a dropped connection. The request carries a
 * requestId that is also the new trip's id, so when the call "fails" with a
 * connection-loss error the server may still have finished: look for the
 * trip (every 3 s for up to 90 s — Gemini can take a minute) before saying
 * it failed. A retry with the same id can't make a duplicate either.
 */
async function generateWithRecovery(request: GenerateTripRequest, uid: string | undefined) {
  const requestId = request.requestId ?? doc(collection(db, 'trips')).id;
  const startedAt = Date.now();
  try {
    return await callGenerateTrip({ ...request, requestId });
  } catch (error) {
    if (!uid || !isConnectionLoss(error)) throw error;
    console.warn('[generateTrip] no answer, checking whether the trip was made', {
      code: (error as { code?: string }).code,
      afterMs: Date.now() - startedAt,
      requestId,
    });
    const found = await waitForGeneratedTrip(
      async () => {
        const snap = await getDoc(doc(db, 'trips', requestId));
        return snap.exists() && snap.data().authorUid === uid;
      },
      { attempts: 30, intervalMs: 3000 },
    );
    if (found) return { tripId: requestId };
    throw error;
  }
}

// Module-level so useLimitPaywall's callback identity stays stable.
const returnToForm = () => router.back();

export function useAiGenerateTrip() {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  // This hook runs on the generating screen, which has nothing to show once
  // generation is refused, so the paywall returns the user to the form.
  const openLimitPaywall = useLimitPaywall(returnToForm);

  const mutation = useMutation({
    mutationFn: (request: GenerateTripRequest) => generateWithRecovery(request, uid),
    onSuccess: () => {
      if (uid) {
        queryClient.invalidateQueries({ queryKey: ['trips', uid] });
        // Keep the "remaining generations" display in sync — a successful
        // generation just consumed this week's quota server-side.
        queryClient.invalidateQueries({ queryKey: ['aiTripQuota', uid] });
      }
    },
    onError: (error: unknown) => {
      // resource-exhausted means the free tier's weekly quota is used up
      if (
        error instanceof FirebaseError &&
        error.code === 'functions/resource-exhausted'
      ) {
        // The client's cached "remaining" was stale (showed >0 but the
        // server rejected) — refresh it so the UI self-corrects to 0.
        if (uid) queryClient.invalidateQueries({ queryKey: ['aiTripQuota', uid] });
        openLimitPaywall();
      }
    },
  });

  return {
    generateTrip: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
