import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { auth } from '@/services/firebase';
import { configureGoogleSignIn } from '@/services/oauth';
import { hydrateSession } from '@/services/session';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useTheme } from '@/hooks/useTheme';
import { resolveAuthRoute } from '@/utils/authRoute';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SplashOverlay } from '@/components/SplashOverlay';

SplashScreen.preventAutoHideAsync();
configureGoogleSignIn();

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
  return (
    <>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
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
        <Stack.Screen name="post/create-trip" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/edit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="user/[uid]" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="add-to-feed" options={{ presentation: 'modal' }} />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="(wallet)" />
      </Stack>
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
          const { hasProfile, hasSeenOnboarding } = await hydrateSession(firebaseUser);
          router.replace(resolveAuthRoute({
            isAuthenticated: true, hasProfile, onboardingComplete: hasSeenOnboarding,
          }));
        } else {
          useUserStore.getState().setProfile(null);
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
