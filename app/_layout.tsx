import { useEffect } from 'react';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { auth, db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';

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
        <Stack.Screen name="trip/ai-generating" options={{ presentation: 'modal' }} />
        <Stack.Screen name="post/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="user/[uid]" />
        <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const { setUser, setTier, setInitialized } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (snap.exists()) {
          setTier(snap.data().tier ?? 'free');
        }
        registerPushToken(firebaseUser.uid);
        router.replace('/(tabs)');
      } else {
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
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
