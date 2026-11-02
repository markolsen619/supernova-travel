/** One person's travel year (callable yearInTravel, cached a day on the server; an hour here). */
import { useQuery } from '@tanstack/react-query';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import type { YearSummary } from '@/types/yearInTravel';

export function useYearInTravel(year: number, opts: { enabled?: boolean } = {}) {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  return useQuery({
    queryKey: ['yearInTravel', uid, year],
    queryFn: () => httpsCallable<{ year: number }, YearSummary>(functions, 'yearInTravel')({ year }).then((r) => r.data),
    enabled: !!uid && (opts.enabled ?? true),
    staleTime: 3_600_000,
    retry: 1,
  });
}
