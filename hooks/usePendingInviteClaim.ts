/** Opens an invite that was waiting for this account (spec 2026-10-30): a new account joins at once, others confirm. */
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { checkInstallReferrerOnce, inviteFromClipboardOnce, readPendingInvite } from '@/services/pendingInvite';
import { claimMode } from '@/utils/inviteLinks';

export function usePendingInviteClaim(): void {
  const user = useAuthStore((s) => s.user);
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (!user || ran.current === user.uid) return;
    ran.current = user.uid;
    (async () => {
      await checkInstallReferrerOnce();
      const parsed = Date.parse(user.metadata?.creationTime ?? '');
      const created = Number.isNaN(parsed) ? null : parsed;
      // Not cleared here: the join screen clears it on a final answer, so a join that fails offline is tried next start.
      // Nothing waiting: on iPhone the invite page may have copied the link before the App Store (owner, 2026-10-31).
      const token = (await readPendingInvite()) ?? (await inviteFromClipboardOnce(user.uid, created));
      if (!token) return;
      const mode = claimMode({ createdAtMs: created, nowMs: Date.now() });
      router.push(`/join/${token}${mode === 'auto' ? '?auto=1' : ''}` as never);
    })();
  }, [user]);
}
