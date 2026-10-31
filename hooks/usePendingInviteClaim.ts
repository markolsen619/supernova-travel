/** Opens an invite that was waiting for this account (spec 2026-10-30): a new account joins at once, others confirm. */
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { checkInstallReferrerOnce, clearPendingInvite, readPendingInvite } from '@/services/pendingInvite';
import { claimMode } from '@/utils/inviteLinks';

export function usePendingInviteClaim(): void {
  const user = useAuthStore((s) => s.user);
  const ran = useRef<string | null>(null);
  useEffect(() => {
    if (!user || ran.current === user.uid) return;
    ran.current = user.uid;
    (async () => {
      await checkInstallReferrerOnce();
      const token = await readPendingInvite();
      if (!token) return;
      await clearPendingInvite();
      const created = Date.parse(user.metadata?.creationTime ?? '');
      const mode = claimMode({ createdAtMs: Number.isNaN(created) ? null : created, nowMs: Date.now() });
      router.push(`/join/${token}${mode === 'auto' ? '?auto=1' : ''}` as never);
    })();
  }, [user]);
}
