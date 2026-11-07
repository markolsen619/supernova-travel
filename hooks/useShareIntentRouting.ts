/**
 * Social wish list (spec 2026-11-06): TikTok → Share → Supernova. `useShareIntentCatcher` (root layout) catches the
 * share in any state and parks the link; `usePendingShareOpener` (tabs layout, signed in and settled) opens the save
 * sheet. A share that isn't TikTok says so.
 */
import { useEffect } from 'react';
import { Alert } from 'react-native';
import { router } from 'expo-router';
import { useShareIntent } from 'expo-share-intent';
import { onPendingShare, setPendingShare, takePendingShare } from '@/services/pendingShare';
import { tiktokUrlFromShare } from '@/utils/wishlist';

export function useShareIntentCatcher(): void {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent();
  useEffect(() => {
    if (!hasShareIntent) return;
    const url = tiktokUrlFromShare([shareIntent.webUrl, shareIntent.text].filter(Boolean).join(' '));
    if (url) setPendingShare(url);
    else Alert.alert('Supernova can save TikTok posts for now', 'Share a TikTok post to add its places to your wish list.');
    resetShareIntent();
  }, [hasShareIntent, shareIntent, resetShareIntent]);
}

export function usePendingShareOpener(): void {
  useEffect(() => {
    let live = true;
    const open = async () => {
      const url = await takePendingShare();
      if (live && url) router.push({ pathname: '/wishlist/save' as never, params: { url } }); // typed routes only regenerate under `expo start`
    };
    open();
    const off = onPendingShare(open);
    return () => { live = false; off(); };
  }, []);
}
