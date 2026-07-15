import { useQuery } from '@tanstack/react-query';
import { callGetAiTripQuota } from '@/services/gemini';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * Reads the SAME quota state generateTrip.ts enforces server-side (via the
 * getAiTripQuota callable), so "remaining" here can never drift from what
 * the server will actually allow — usage_quotas has no direct client access.
 */
export function useAiTripQuota() {
  const uid = useAuthStore((s) => s.user?.uid);
  return useQuery({
    queryKey: ['aiTripQuota', uid],
    queryFn: callGetAiTripQuota,
    enabled: !!uid,
    staleTime: 2 * 60 * 1000,
  });
}
