import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FirebaseError } from 'firebase/app';
import { router } from 'expo-router';
import { callParseTravelConfirmation } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';
import { useImportDraftStore } from '@/stores/useImportDraftStore';
import { ParseTravelConfirmationRequest } from '@/types/ai';

export function useParseTravelConfirmation() {
  const queryClient = useQueryClient();
  const uid = useAuthStore((s) => s.user?.uid);
  const setDraft = useImportDraftStore((s) => s.setDraft);

  const mutation = useMutation({
    mutationFn: (request: ParseTravelConfirmationRequest) => callParseTravelConfirmation(request),
    onSuccess: (result) => {
      if (uid) {
        // Keep the "remaining" display in sync — a successful parse just consumed this year's quota.
        queryClient.invalidateQueries({ queryKey: ['importQuota', uid] });
      }
      setDraft(result);
      if (result.kind === 'boarding_pass') {
        router.push('/(wallet)/boarding-pass/add?draft=true');
      } else {
        router.push('/(wallet)/reservation/add?draft=true');
      }
    },
    onError: (error: unknown) => {
      // resource-exhausted means free tier's 1/year limit is used — redirect to paywall
      if (error instanceof FirebaseError && error.code === 'functions/resource-exhausted') {
        if (uid) queryClient.invalidateQueries({ queryKey: ['importQuota', uid] });
        router.replace('/paywall');
      }
    },
  });

  return {
    parseConfirmation: mutation.mutateAsync,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
