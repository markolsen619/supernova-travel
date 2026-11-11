/**
 * Social wish list (spec 2026-11-06): TikTok → Share → Supernova, or screenshots → Share → Supernova (spec 2026-11-11). `useShareIntentCatcher` (root layout) catches the
 * share in any state and parks the link; `usePendingShareOpener` (tabs layout, signed in and settled) opens the save
 * sheet. A share that isn't TikTok says so.
 */
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { onPendingShare, setPendingShare, takePendingShare } from '@/services/pendingShare';
import { isDuplicateShare } from '@/utils/wishlist';
import { shareKey, shareKind } from '@/utils/wishShots';
import { setShotDraft } from '@/services/shotDraft';

let lastShare: { url: string; at: number } | null = null;
let opening = false;

export function useShareIntentCatcher(): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    const kind = shareKind({ webUrl: shareIntent.webUrl, text: shareIntent.text, files: shareIntent.files });
    if (kind) {
      // One sheet per share: the same share again within 10 s is the same share (links and screenshots both fired
      // twice — device test; fresh review I-5).
      const key = shareKey(kind);
      if (isDuplicateShare(lastShare, key, Date.now())) { resetShareIntent(); return; }
      lastShare = { url: key, at: Date.now() };
    }
    if (kind) setPendingShare(kind);
    else Alert.alert('Share screenshots or a TikTok link', 'Supernova finds the places in screenshots of any post, or in a TikTok link.');
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}

export function usePendingShareOpener(): void {
  useEffect(() => {
    let live = true;
    const open = async () => {
      if (opening) return; // the mount and the listener can race for the same pending share
      opening = true;
      const p = await takePendingShare().finally(() => { opening = false; });
      if (!live || !p) return;
      // typed routes only regenerate under `expo start`
      if (p.kind === 'link') router.push({ pathname: '/wishlist/save' as never, params: { url: p.url } });
      else { setShotDraft(p.uris); router.push({ pathname: '/wishlist/save' as never, params: { mode: 'shots' } }); }
    };
    open();
    const off = onPendingShare(open);
    return () => { live = false; off(); };
  }, []);
}
