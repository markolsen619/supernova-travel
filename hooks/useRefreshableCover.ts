/**
 * A cover photo that heals itself (2026-11-01): Google stops accepting a stored photo reference after a few
 * weeks, so when a cover fails to load the card asks `refreshCover` once per session for a fresh one and shows
 * it; with none, the card's own placeholder. The daily `refreshCovers` job keeps most covers fresh already.
 */
import { useCallback, useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import { claimCoverRefresh } from '@/utils/coverRefresh';

const asked = new Set<string>();

export function useRefreshableCover(kind: 'trip' | 'destination', id: string, url: string | null): { uri: string | null; onError: () => void } {
  const [uri, setUri] = useState<string | null>(url);
  useEffect(() => setUri(url), [url]);
  const onError = useCallback(() => {
    if (!claimCoverRefresh(asked, kind, id)) { setUri(null); return; }
    setUri(null);
    httpsCallable<{ kind: string; id: string }, { url: string | null }>(functions, 'refreshCover')({ kind, id })
      .then((r) => { if (r.data.url && r.data.url !== url) setUri(r.data.url); })
      .catch(() => {});
  }, [kind, id, url]);
  return { uri, onError };
}
