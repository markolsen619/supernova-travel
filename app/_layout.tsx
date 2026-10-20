import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { auth } from '@/services/firebase';
import { configureGoogleSignIn } from '@/services/oauth';
import { clearSessionSnapshots, hydrateSession, loadSessionSnapshot, restoreFromSnapshot } from '@/services/session';
import NetInfo from '@react-native-community/netinfo';
import { canUseSnapshot } from '@/utils/sessionSnapshot';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useModerationStore } from '@/stores/useModerationStore';
import { ReadingColumn } from '@/components/layout/ReadingColumn';
import { usesReadingColumn } from '@/utils/layout';
import { useAiConsentStore } from '@/stores/useAiConsentStore';
import { useTheme } from '@/hooks/useTheme';
import { resolveAuthRoute } from '@/utils/authRoute';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SplashOverlay } from '@/components/SplashOverlay';
import { useRevenueCatSync } from '@/hooks/useRevenueCatSync';
import { useNotificationRouting } from '@/hooks/useNotificationRouting';
import { usePushIntro } from '@/hooks/usePushIntro';
import { NotificationArrivalBanner } from '@/components/NotificationArrivalBanner';
import { useLinkRouting } from '@/hooks/useLinkRouting';
import { startOnlineSync } from '@/services/offline';
import { startPersistence, stopPersistence } from '@/services/queryPersist';

SplashScreen.preventAutoHideAsync();
configureGoogleSignIn();
// Offline trips (spec 2026-10-19): queries pause without signal and show what's saved on the phone.
startOnlineSync();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60 * 2, retry: 2 },
  },
});

function AppStack() {
  const { isDark } = useTheme();
  // Keeps useAuthStore.tier live with RevenueCat for the whole session —
  // renewals, lapses, refunds and cross-device purchases all land here.
  useRevenueCatSync();
  // Sends a tapped notification to the screen it's about. Mounted here, below
  // the auth listener, so it can wait for routing to settle before navigating.
  useNotificationRouting();
  // "Know when it matters", once per account, after it first reaches the tabs.
  usePushIntro();
  useLinkRouting();
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{ headerShown: false, animation: 'fade' }}
        screenLayout={({ route, children }) =>
          usesReadingColumn('root', route.name) ? <ReadingColumn>{children}</ReadingColumn> : children
        }
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="trip/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/new" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/ai-generate" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/budget" options={{ presentation: 'modal' }} />
        <Stack.Screen name="trip/packing" options={{ presentation: 'modal' }} />
        {/* gestureEnabled: false — swiping this away mid-generation would
            orphan the in-flight request with no way back to its result */}
        <Stack.Screen name="trip/ai-generating" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/create-photo" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/create-video" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/create-trip" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/edit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="user/[uid]" />
        <Stack.Screen name="destination/[slug]" />
        <Stack.Screen name="connections/[uid]" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-to-feed" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="(wallet)" />
        <Stack.Screen name="notification-intro" options={{ presentation: 'modal', gestureEnabled: false }} />
        <Stack.Screen name="place/review" options={{ presentation: 'modal' }} />
        <Stack.Screen name="place/reviews" />
      </Stack>
      <NotificationArrivalBanner />
    </>
  );
}

export default function RootLayout() {
  const { setUser, setInitialized, isInitialized } = useAuthStore();

  useEffect(() => { SplashScreen.hideAsync(); }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      try {
        if (firebaseUser) {
          // Restore this account's saved trips and wallet before routing, so an offline launch has them.
          await startPersistence(queryClient, firebaseUser.uid);
          try {
            const { hasProfile, hasSeenOnboarding } = await hydrateSession(firebaseUser);
            router.replace(resolveAuthRoute({
              isAuthenticated: true, hasProfile, onboardingComplete: hasSeenOnboarding,
            }));
          } catch (error) {
            // Offline launch (spec 2026-10-19 §2): open signed in from the saved session instead of
            // the welcome screen. NetInfo's first event may not have arrived yet, so ask it directly.
            const offline = !(await NetInfo.fetch()).isConnected;
            const snapshot = await loadSessionSnapshot(firebaseUser.uid);
            const restored = snapshot && canUseSnapshot({ readFailed: true, offline, uid: firebaseUser.uid, snapshot })
              ? restoreFromSnapshot(snapshot)
              : null;
            if (!restored) throw error; // today's behaviour: the outer catch routes to welcome
            router.replace(resolveAuthRoute({
              isAuthenticated: true, hasProfile: true, onboardingComplete: restored.hasSeenOnboarding,
            }));
            // Refresh tier, profile and moderation once signal returns, without re-routing.
            const off = onlineManager.subscribe((online) => {
              if (!online) return;
              off();
              hydrateSession(firebaseUser).catch((e) => console.warn('[auth] re-hydrate after reconnect failed:', e));
            });
          }
        } else {
          // Sign-out and account deletion both end here (auth.signOut()), so one wipe covers both:
          // the next person on this phone never sees the previous account's trips or passes.
          await stopPersistence(queryClient, { wipe: true });
          await clearSessionSnapshots();
          useUserStore.getState().setProfile(null);
          useModerationStore.getState().reset();
          useAiConsentStore.getState().setVersion(null);
          router.replace(resolveAuthRoute({ isAuthenticated: false, hasProfile: false, onboardingComplete: false }));
        }
      } catch (error) {
        // hydrateSession's getDoc (or its legacy-migration AsyncStorage read)
        // can reject — offline being the common case. Without this, setInitialized(true)
        // below would never run and SplashOverlay (opaque, zIndex 9999) would
        // never unmount: a dead logo screen with no error, force-quit only.
        console.warn('[auth] session restore failed; routing to a usable screen:', error);
        router.replace('/(auth)/welcome');
      } finally {
        setInitialized(true);
      }
    });
    return unsubscribe;
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <QueryClientProvider client={queryClient}>
        <AppStack />
        <SplashOverlay visible={!isInitialized} />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
