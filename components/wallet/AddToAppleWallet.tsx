import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import WalletManager from 'react-native-wallet-manager';
import { NativeAddPassButton } from '@/modules/add-pass-button';
import { useTheme } from '@/hooks/useTheme';
import { requireOnline } from '@/services/offline';
import { getAppleWalletLink } from '@/services/appleWallet';

/**
 * Apple's own "Add to Apple Wallet" button (PKAddPassButton — Apple's guidelines for apps) under the boarding pass.
 * Asks the server for a 5-minute link and shows Wallet's Add sheet in the app (react-native-wallet-manager);
 * the in-app browser, then Safari, if that fails. iPhone only; nothing in builds without the native button.
 */
export function AddToAppleWallet({ passId, style }: { passId: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePress = useCallback(async () => {
    if (busy || !requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    try {
      const url = await getAppleWalletLink(passId);
      try {
        await WalletManager.addPassFromUrl(url);
      } catch {
        try { await WebBrowser.openBrowserAsync(url); } catch { await Linking.openURL(url); }
      }
    } catch {
      setError("Couldn't prepare the pass. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, passId]);

  if (Platform.OS !== 'ios' || !NativeAddPassButton) return null;
  const Button = NativeAddPassButton;
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.buttonBox} accessibilityElementsHidden={busy}>
        <Button style={styles.button} buttonStyle="black" onPress={handlePress} />
        {busy ? (
          <View style={[StyleSheet.absoluteFill, styles.busy]} pointerEvents="none">
            <ActivityIndicator color="#ffffff" />
          </View>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: 6 },
  // Apple's minimum for the one-line button is 30 pt tall; 48 matches the app's touch targets.
  buttonBox: { height: 48, borderRadius: 10, overflow: 'hidden' },
  button: { flex: 1 },
  busy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  error: { fontSize: 13, textAlign: 'center' },
});
