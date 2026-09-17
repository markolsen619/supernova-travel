import { useMemo } from 'react';
import { useModerationStore } from '@/stores/useModerationStore';
import type { ModerationContext } from '@/utils/moderation';

/**
 * The viewer's moderation context for utils/moderation.ts's filters, as Sets.
 * Re-renders whatever uses it the moment someone blocks or reports, so hidden
 * content disappears without a refetch.
 */
export function useModeration(): ModerationContext {
  const blockedUids = useModerationStore((s) => s.blockedUids);
  const hiddenKeys = useModerationStore((s) => s.hiddenKeys);
  return useMemo(
    () => ({ blockedUids: new Set(blockedUids), hiddenKeys: new Set(hiddenKeys) }),
    [blockedUids, hiddenKeys],
  );
}
