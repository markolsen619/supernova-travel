import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { router } from 'expo-router';
import { useLimitPaywall } from '@/hooks/useLimitPaywall';
import { callGenerateTrip } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { GenerateTripRequest } from '@/types/ai';

// Module-level so useLimitPaywall's callback identity stays stable.
const returnToForm = () => router.back();

export function useAiGenerateTrip() {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  // This hook runs on the generating screen, which has nothing to show once
  // generation is refused, so the paywall returns the user to the form.
  const openLimitPaywall = useLimitPaywall(returnToForm);

  const mutation = useMutation({
    mutationFn: (request: GenerateTripRequest) => callGenerateTrip(request),
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
