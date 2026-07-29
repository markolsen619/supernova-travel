import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/services/firebase';
import { configureRevenueCat } from '@/services/revenuecat';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useTheme } from '@/hooks/useTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { SplashOverlay } from '@/components/SplashOverlay';

SplashScreen.preventAutoHideAsync();

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

async function registerPushToken(uid: string) {
  if (Platform.OS === 'web') return;
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return;

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  // Store token on the user document for Cloud Function flight alerts
  const userRef = doc(db, 'users', uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) {
    const existing: string[] = snap.data().expoPushTokens ?? [];
    if (!existing.includes(token)) {
      const { updateDoc, arrayUnion } = await import('firebase/firestore');
      await updateDoc(userRef, { expoPushTokens: arrayUnion(token) });
    }
  }
}

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
  const { setUser, setTier, setInitialized, isInitialized } = useAuthStore();

  useEffect(() => { SplashScreen.hideAsync(); }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          const data = snap.data();
          setTier(data.tier ?? 'free');
          // Hydrate the cached profile — EditProfileSheet, post authoring,
          // and the profile header all read from this store.
          useUserStore.getState().setProfile({
            uid: firebaseUser.uid,
            // fullName is the current field; displayName is the pre-rename
            // name still on file for accounts that haven't been re-saved.
            fullName: data.fullName ?? data.displayName ?? firebaseUser.displayName ?? '',
            username: data.username ?? '',
            avatarUrl: data.avatarUrl ?? null,
            bio: data.bio ?? '',
            location: data.location ?? '',
            followersCount: data.followersCount ?? 0,
            followingCount: data.followingCount ?? 0,
            createdAt: data.createdAt?.toDate?.()?.toISOString() ?? new Date().toISOString(),
          });
        }
        registerPushToken(firebaseUser.uid);
        configureRevenueCat(firebaseUser.uid);
        const onboardingDone = await AsyncStorage.getItem('onboarding_complete');
        router.replace(onboardingDone ? '/(tabs)' : '/(auth)/onboarding');
      } else {
        useUserStore.getState().setProfile(null);
        router.replace('/(auth)/welcome');
      }
      setInitialized(true);
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
