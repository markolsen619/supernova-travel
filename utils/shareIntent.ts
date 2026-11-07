/**
 * The iOS share extension (expo-share-intent) reopens the app with `supernova://dataUrl=<key>#<type>`, which Expo Router
 * would treat as an unknown screen. Send it to the tabs — the share itself is read by `useShareIntent` — and leave every
 * other link alone. Pure; app/+native-intent.tsx applies it.
 */
export const shareRedirect = (path: string): string => (path.includes('dataUrl=') ? '/(tabs)' : path);
