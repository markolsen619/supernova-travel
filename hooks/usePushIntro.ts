import { useEffect, useRef } from 'react';
import { router, useRootNavigationState, useSegments, type Href } from 'expo-router';
import { useAuthStore } from '@/stores/useAuthStore';
import { pushIntroState } from '@/services/push';
import { shouldShowPushIntro } from '@/utils/pushIntro';

/**
 * Opens "Know when it matters" once, the first time a signed-in account
 * reaches the tabs with notifications never asked about — right after
 * sign-up and onboarding, or on an existing account's next launch.
 */
export function usePushIntro() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const isInitialized = useAuthStore((s) => s.isInitialized);
  const navigationState = useRootNavigationState();
  const segments = useSegments();
  const inTabs = segments[0] === '(tabs)';
  const checked = useRef<string | null>(null);

  useEffect(() => {
    if (!uid || !isInitialized || !navigationState?.key || !inTabs || checked.current === uid) return;
    checked.current = uid;
    let cancelled = false;
    // A beat after landing, so it doesn't race a notification tap or a link being opened.
    const timer = setTimeout(async () => {
      const state = await pushIntroState(uid).catch(() => null);
      if (!cancelled && state && shouldShowPushIntro(state)) router.push('/notification-intro' as Href);
    }, 1200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [uid, isInitialized, navigationState?.key, inTabs]);
}
