import { Stack } from 'expo-router';

/** Settings is its own stack inside the root modal — new pages are one
 * file + one row in index.tsx. */
export default function SettingsLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
