import { Platform } from 'react-native';

const API_KEY = Platform.select({
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
  default: '',
}) ?? '';

export async function configureRevenueCat(uid: string): Promise<void> {
  if (!API_KEY) return;
  try {
    const { default: Purchases, LOG_LEVEL } = await import('react-native-purchases');
    Purchases.setLogLevel(LOG_LEVEL.WARN);
    Purchases.configure({ apiKey: API_KEY, appUserID: uid });
  } catch {
    // Native module unavailable in Expo Go
  }
}
