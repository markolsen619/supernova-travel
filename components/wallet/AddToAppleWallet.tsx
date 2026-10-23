import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import WalletManager from 'react-native-wallet-manager';
import { NativeAddPassButton } from '@/modules/add-pass-button';
import { useTheme } from '@/hooks/useTheme';
import { requireOnline } from '@/services/offline';
import { getAppleWalletLink } from '@/services/appleWallet';
import { walletAddOutcome } from '@/utils/appleWalletOutcome';

/**
 * Apple's own "Add to Apple Wallet" button (PKAddPassButton — Apple's guidelines for apps) under the boarding pass.
 * Asks the server for a 5-minute link and shows Wallet's Add sheet in the app (react-native-wallet-manager); the
 * in-app browser, then Safari, only when that sheet couldn't run. Hidden on Android, on devices that can't add passes
 * (some iPads) and in builds without the native button.
 */
export function AddToAppleWallet({ passId, style }: { passId: string; style?: StyleProp<ViewStyle> }) {
  const { colors, isDark } = useTheme();
  const [canAdd, setCanAdd] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; tone: 'muted' | 'error' } | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !NativeAddPassButton) return;
    let alive = true;
    WalletManager.canAddPasses().then((ok) => { if (alive) setCanAdd(!!ok); }).catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const handlePress = useCallback(async () => {
    if (busy || !requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    setNote(null);
    try {
      const url = await getAppleWalletLink(passId);
      try {
        await WalletManager.addPassFromUrl(url);
      } catch (e) {
        const outcome = walletAddOutcome((e as { code?: string }).code);
        if (outcome === 'already') setNote({ text: 'Already in your Wallet.', tone: 'muted' });
        else if (outcome === 'error') setNote({ text: "Couldn't download the pass. Try again.", tone: 'error' });
        else if (outcome === 'browser') {
          try { await WebBrowser.openBrowserAsync(url); } catch { await Linking.openURL(url); }
        }
      }
    } catch {
      setNote({ text: "Couldn't prepare the pass. Try again.", tone: 'error' });
    } finally {
      setBusy(false);
    }
  }, [busy, passId]);

  if (Platform.OS !== 'ios' || !NativeAddPassButton || !canAdd) return null;
  const Button = NativeAddPassButton;
  return (
    <View style={[styles.wrap, style]}>
      <View style={styles.buttonBox} accessibilityElementsHidden={busy}>
        {/* Apple: the outline style on dark backgrounds, the solid black one on light. */}
        <Button style={styles.button} buttonStyle={isDark ? 'blackOutline' : 'black'} onPress={handlePress} />
        {busy ? (
          <View style={[StyleSheet.absoluteFill, styles.busy]} pointerEvents="none">
            <ActivityIndicator color="#ffffff" />
          </View>
        ) : null}
      </View>
      {note ? (
        <Text style={[styles.note, { color: note.tone === 'error' ? colors.semantic.error : colors.text.tertiary }]}>{note.text}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'stretch', gap: 6 },
  // Apple's minimum for the one-line button is 30 pt tall; 48 matches the app's touch targets.
  buttonBox: { height: 48, borderRadius: 10, overflow: 'hidden' },
  button: { flex: 1 },
  busy: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  note: { fontSize: 13, textAlign: 'center' },
});
