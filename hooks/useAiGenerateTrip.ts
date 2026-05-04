import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { router } from 'expo-router';
import { callGenerateTrip } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { GenerateTripRequest } from '@/types/ai';

export function useAiGenerateTrip() {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);

  const mutation = useMutation({
    mutationFn: (request: GenerateTripRequest) => callGenerateTrip(request),
    onSuccess: () => {
      if (uid) {
        queryClient.invalidateQueries({ queryKey: ['trips', uid] });
      }
    },
    onError: (error: unknown) => {
      // resource-exhausted means free tier quota exceeded — redirect to paywall
      if (
        error instanceof FirebaseError &&
        error.code === 'functions/resource-exhausted'
      ) {
        router.replace('/paywall');
      }
    },
  });

  return {
    generateTrip: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
