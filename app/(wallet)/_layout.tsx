import { Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { BookingLinkedBanner } from '@/components/wallet/BookingLinkedBanner';

export default function WalletLayout() {
  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="import" />
        <Stack.Screen name="email-import" />
        <Stack.Screen name="boarding-pass/[id]" />
        <Stack.Screen name="boarding-pass/add" />
        <Stack.Screen name="reservation/[id]" />
        <Stack.Screen name="reservation/add" />
        <Stack.Screen name="shared-booking" />
        <Stack.Screen name="loyalty/[id]" />
        <Stack.Screen name="loyalty/add" />
      </Stack>
      {/* "Added to {trip} · Undo" — outlives the add screen, which closes on save. */}
      <BookingLinkedBanner />
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
