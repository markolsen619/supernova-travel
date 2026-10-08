import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { collection, doc, getDoc, getDocs, limit, orderBy, query } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { callCreateImportAddress, callRotateImportAddress } from '@/services/gemini';
import { reconcileServerTier } from '@/services/tier';
import { addressFor, gmailCodeFresh, safeGmailLink, type EmailImportEntry } from '@/utils/emailImport';

interface EmailImportState { address: string | null; gmailCode: string | null; gmailLink: string | null; entries: EmailImportEntry[] }

/** Your forwarding address, Gmail's pending code and the import log. The token lives in users/{uid}/private/emailImport (owner-only). */
export function useEmailImport() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['emailImport', uid],
    enabled: !!uid,
    staleTime: 30 * 1000,
    queryFn: async (): Promise<EmailImportState> => {
      const [priv, log] = await Promise.all([
        getDoc(doc(db, 'users', uid!, 'private', 'emailImport')),
        getDocs(query(collection(db, 'users', uid!, 'emailImports'), orderBy('receivedAt', 'desc'), limit(50))),
      ]);
      const p = priv.data();
      const codeAt: Date | null = p?.gmailForwardingCode?.at?.toDate?.() ?? null;
      const fresh = !!p?.gmailForwardingCode && gmailCodeFresh(codeAt, new Date());
      return {
        address: addressFor(p?.token),
        gmailLink: fresh ? safeGmailLink(p?.gmailForwardingCode?.link) : null,
        gmailCode: p?.gmailForwardingCode?.code && gmailCodeFresh(codeAt, new Date()) ? String(p.gmailForwardingCode.code) : null,
        entries: log.docs.map((d) => {
          const e = d.data();
          return {
            id: d.id,
            receivedAt: e.receivedAt?.toDate?.() ?? null,
            subject: String(e.subject ?? ''),
            status: e.status,
            items: Array.isArray(e.items) ? e.items : [],
            ...(e.tripTitle ? { tripTitle: String(e.tripTitle) } : {}),
          } as EmailImportEntry;
        }),
      };
    },
  });

  const run = useCallback(async (fn: () => Promise<unknown>, failure: string) => {
    setBusy(true);
    setError(null);
    try {
      try {
        await fn();
      } catch (err) {
        // Just bought Pro? The server may not have heard yet — sync the tier and try once more.
        if ((err as { code?: string }).code !== 'functions/permission-denied') throw err;
        await reconcileServerTier(queryClient);
        await fn();
      }
      await queryClient.invalidateQueries({ queryKey: ['emailImport', uid] });
    } catch (err) {
      console.warn('[email import]', err);
      setError(failure);
    } finally {
      setBusy(false);
    }
  }, [queryClient, uid]);

  const create = useCallback(() => run(callCreateImportAddress, "Couldn't create your address. Try again."), [run]);
  const rotate = useCallback(() => run(callRotateImportAddress, "Couldn't make a new address. Try again."), [run]);

  return {
    address: data?.address ?? null,
    gmailCode: data?.gmailCode ?? null,
    gmailLink: data?.gmailLink ?? null,
    entries: data?.entries ?? [],
    isLoading,
    create,
    rotate,
    busy,
    error,
  };
}
