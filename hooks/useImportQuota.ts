import { useQuery } from '@tanstack/react-query';
import { callGetImportQuota } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Reads the SAME quota state parseTravelConfirmation.ts enforces server-side (via the getImportQuota
 * callable), so "remaining" here can never drift from what the server will actually allow —
 * usage_quotas has no direct client access.
 */
export function useImportQuota() {
  const uid = useAuthStore((s) => s.user?.uid);
  return useQuery({
    queryKey: ['importQuota', uid],
    queryFn: callGetImportQuota,
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
