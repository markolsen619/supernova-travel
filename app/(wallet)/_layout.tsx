import { Stack } from 'expo-router';

export default function WalletLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="boarding-passes" />
      <Stack.Screen name="boarding-pass/[id]" />
      <Stack.Screen name="boarding-pass/add" />
      <Stack.Screen name="reservations" />
      <Stack.Screen name="reservation/[id]" />
      <Stack.Screen name="loyalty" />
      <Stack.Screen name="loyalty/[id]" />
      <Stack.Screen name="loyalty/add" />
    </Stack>
  );
}
