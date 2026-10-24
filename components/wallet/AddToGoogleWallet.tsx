import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import WalletManager from 'react-native-wallet-manager';
import { useTheme } from '@/hooks/useTheme';
import { requireOnline } from '@/services/offline';
import { getGoogleWalletJwt } from '@/services/googleWallet';
import { googleWalletOutcome } from '@/utils/googleWalletOutcome';
import { GOOGLE_WALLET_BUTTON_SVG } from '@/components/wallet/googleWalletButtonSvg';

/**
 * Google's own "Add to Google Wallet" button under the boarding pass (Android). Asks the server for a signed save
 * link and shows Google Wallet's add screen in the app. Hidden on iOS and when the phone can't save passes.
 */
export function AddToGoogleWallet({ passId, style }: { passId: string; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  const [canAdd, setCanAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    let alive = true;
    WalletManager.canAddPasses().then((ok) => { if (alive) setCanAdd(!!ok); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const handlePress = useCallback(async () => {
    if (busy || !requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setError(null);
    try {
      const jwt = await getGoogleWalletJwt(passId);
      try {
        await WalletManager.addPassToGoogleWallet(jwt);
      } catch (e) {
        if (googleWalletOutcome((e as { code?: string }).code) === 'error') setError("Couldn't add the pass. Try again.");
      }
    } catch {
      setError("Couldn't prepare the pass. Try again.");
    } finally {
      setBusy(false);
    }
  }, [busy, passId]);

  if (Platform.OS !== 'android' || !canAdd) return null;
  return (
    <View style={[styles.wrap, style]}>
      <TouchableOpacity onPress={handlePress} disabled={busy} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel="Add to Google Wallet" style={styles.button}>
        <SvgXml xml={GOOGLE_WALLET_BUTTON_SVG} width="100%" height="100%" />
        {busy ? <View style={[StyleSheet.absoluteFill, styles.busy]}><ActivityIndicator color="#ffffff" /></View> : null}
      </TouchableOpacity>
      {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 6, paddingVertical: 8 },
  // Google: at least 48 dp tall, artwork unscaled in ratio (283×50).
  button: { height: 52, aspectRatio: 283 / 50, borderRadius: 26, overflow: 'hidden' },
  busy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  error: { fontSize: 13, textAlign: 'center' },
});
