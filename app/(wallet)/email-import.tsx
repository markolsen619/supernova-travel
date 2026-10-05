import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { CaretDown, CaretRight, Check, CopySimple, EnvelopeSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useEmailImport } from '@/hooks/useEmailImport';
import { useAiConsentGate } from '@/components/ai/useAiConsentGate';
import { WalletHeader } from '@/components/wallet/WalletHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { GMAIL_FILTER, receivedLabel, statusLine, type EmailImportEntry } from '@/utils/emailImport';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

/** A copy button that confirms itself for two seconds. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const { colors } = useTheme();
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const copy = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(value);
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  }, [value]);
  return (
    <TouchableOpacity onPress={copy} style={styles.copyBtn} accessibilityRole="button" accessibilityLabel={copied ? 'Copied' : label}>
      {copied ? <Check size={16} color={colors.text.primary} weight="bold" /> : <CopySimple size={16} color={colors.text.primary} weight="bold" />}
      <Text style={[styles.copyText, { color: colors.text.primary }]}>{copied ? 'Copied' : 'Copy'}</Text>
    </TouchableOpacity>
  );
}

function LogRow({ entry }: { entry: EmailImportEntry }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const single = entry.status === 'imported' && entry.items.length === 1 ? entry.items[0] : null;
  const several = entry.status === 'imported' && entry.items.length > 1;
  const openItem = useCallback((item: EmailImportEntry['items'][number]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(item.kind === 'boarding_pass' ? `/(wallet)/boarding-pass/${item.id}` : `/(wallet)/reservation/${item.id}`);
  }, []);
  const onPress = single ? () => openItem(single) : several ? () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setOpen((o) => !o); } : undefined;

  return (
    <View style={[styles.logRow, { borderColor: colors.background.cardBorder }]}>
      <TouchableOpacity disabled={!onPress} onPress={onPress} style={styles.logMain} accessibilityRole={onPress ? 'button' : 'text'}>
        <View style={styles.logText}>
          <Text style={[styles.logSubject, { color: colors.text.primary }]} numberOfLines={1}>{entry.subject || '(no subject)'}</Text>
          <Text
            style={[styles.logStatus, { color: entry.status === 'imported' ? colors.text.secondary : colors.text.tertiary }]}
            numberOfLines={2}
          >
            {statusLine(entry)}
          </Text>
        </View>
        <Text style={[styles.logTime, { color: colors.text.tertiary }]}>{receivedLabel(entry.receivedAt, new Date())}</Text>
        {single && <CaretRight size={14} color={colors.text.tertiary} weight="bold" />}
        {several && <CaretDown size={14} color={colors.text.tertiary} weight="bold" />}
      </TouchableOpacity>
      {several && open && entry.items.map((item) => (
        <TouchableOpacity key={item.id} onPress={() => openItem(item)} style={styles.logItem} accessibilityRole="button">
          <Text style={[styles.logItemText, { color: colors.text.primary }]} numberOfLines={1}>{item.title}</Text>
          <CaretRight size={14} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      ))}
    </View>
  );
}

/** Email import: your forwarding address, Gmail's confirmation code, setup steps and what arrived (Pro). */
export default function EmailImportScreen() {
  const { colors } = useTheme();
  const { address, gmailCode, entries, isLoading, create, rotate, busy, error } = useEmailImport();
  const { requireConsent, consentSheet } = useAiConsentGate();
  const [stepsOpen, setStepsOpen] = useState(false);
  const stepsAnim = useRef(new Animated.Value(0)).current;

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  }, []);

  const handleCreate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    requireConsent('import', () => { create(); });
  }, [requireConsent, create]);

  const toggleSteps = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const next = !stepsOpen;
    setStepsOpen(next);
    stepsAnim.setValue(0);
    if (next) Animated.spring(stepsAnim, { toValue: 1, ...SPRING }).start();
  }, [stepsOpen, stepsAnim]);

  const handleRotate = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert('Get a new address?', 'Your old address stops working right away.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Get a new address', style: 'destructive', onPress: () => { rotate(); } },
    ]);
  }, [rotate]);

  const copyAddress = useCallback(async () => {
    if (!address) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(address);
  }, [address]);

  const card = { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder };

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <WalletHeader title="Email import" onBack={handleBack} />
      {isLoading ? (
        <View style={styles.loading}><ActivityIndicator color={colors.text.tertiary} /></View>
      ) : !address ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>EMAIL IMPORT</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>Forward bookings to Supernova</Text>
          <Text style={[styles.body, { color: colors.text.secondary }]}>
            Send confirmation emails to your own address and they land in your wallet, matched to your trips.
          </Text>
          {!!error && <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text>}
          <TouchableOpacity
            onPress={handleCreate}
            disabled={busy}
            style={[styles.primary, { backgroundColor: colors.text.primary }]}
            accessibilityRole="button"
          >
            {busy ? <ActivityIndicator color={colors.background.primary} /> : (
              <Text style={[styles.primaryText, { color: colors.background.primary }]}>Create my address</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, card]}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>YOUR ADDRESS</Text>
            <View style={styles.addressRow}>
              <Text selectable style={[styles.address, { color: colors.text.primary }]} numberOfLines={1} adjustsFontSizeToFit>
                {address}
              </Text>
              <CopyButton value={address} label="Copy address" />
            </View>
          </View>

          {!!gmailCode && (
            <View style={[styles.card, card]}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>GMAIL CONFIRMATION CODE</Text>
              <View style={styles.addressRow}>
                <Text selectable style={[styles.code, { color: colors.text.primary }]}>{gmailCode}</Text>
                <CopyButton value={gmailCode} label="Copy code" />
              </View>
              <Text style={[styles.caption, { color: colors.text.tertiary }]}>Enter it in Gmail to finish setting up forwarding.</Text>
            </View>
          )}

          <TouchableOpacity onPress={toggleSteps} style={[styles.stepsHeader, { borderColor: colors.background.cardBorder }]} accessibilityRole="button" accessibilityState={{ expanded: stepsOpen }}>
            <Text style={[styles.section, { color: colors.text.primary }]}>Set up automatic forwarding</Text>
            {stepsOpen ? <CaretDown size={16} color={colors.text.tertiary} weight="bold" /> : <CaretRight size={16} color={colors.text.tertiary} weight="bold" />}
          </TouchableOpacity>
          {stepsOpen && (
            <Animated.View style={{ opacity: stepsAnim, transform: [{ translateY: stepsAnim.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }}>
              <Text style={[styles.subhead, { color: colors.text.primary }]}>Gmail</Text>
              {[
                'In Gmail on the web, open Settings → See all settings → Forwarding and POP/IMAP.',
                'Add a forwarding address and paste your address above.',
                'Gmail sends a confirmation code here. It appears on this screen; enter it in Gmail.',
                'Open Filters → Create a new filter, and paste this into “Has the words”:',
              ].map((step, i) => (
                <Text key={step} style={[styles.step, { color: colors.text.secondary }]}>{i + 1}. {step}</Text>
              ))}
              <View style={[styles.filterBox, { backgroundColor: colors.background.sunken }]}>
                <Text selectable style={[styles.filter, { color: colors.text.primary }]}>{GMAIL_FILTER}</Text>
                <CopyButton value={GMAIL_FILTER} label="Copy filter" />
              </View>
              <Text style={[styles.step, { color: colors.text.secondary }]}>{'5. Choose “Forward it to” your address, and create the filter.'}</Text>
              <Text style={[styles.subhead, { color: colors.text.primary }]}>Outlook</Text>
              <Text style={[styles.step, { color: colors.text.secondary }]}>Settings → Mail → Rules: forward booking emails to your address.</Text>
              <Text style={[styles.subhead, { color: colors.text.primary }]}>iCloud Mail</Text>
              <Text style={[styles.step, { color: colors.text.secondary }]}>Settings → Rules: forward booking emails to your address.</Text>
            </Animated.View>
          )}

          <Text style={[styles.eyebrow, styles.logEyebrow, { color: colors.text.tertiary }]}>RECENT EMAILS</Text>
          {entries.length === 0 ? (
            <EmptyState
              icon={EnvelopeSimple}
              title="No emails yet"
              description="Forward a confirmation to see it here."
              actionLabel="Copy address"
              onAction={copyAddress}
              actionHaptic="light"
              size="sm"
            />
          ) : (
            entries.map((e) => <LogRow key={e.id} entry={e} />)
          )}

          {!!error && <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text>}
          <TouchableOpacity onPress={handleRotate} disabled={busy} style={styles.rotate} accessibilityRole="button">
            <Text style={[styles.rotateText, { color: colors.text.secondary }]}>Get a new address</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
      {consentSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['4'], paddingBottom: 100 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.6, marginTop: Spacing['2'] },
  body: { fontSize: 15, lineHeight: 22, marginTop: Spacing['3'] },
  error: { fontSize: 13, marginTop: Spacing['3'] },
  primary: { marginTop: Spacing['6'], minHeight: 52, borderRadius: BorderRadius.md, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  card: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['4'], marginBottom: Spacing['3'] },
  addressRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], marginTop: Spacing['2'] },
  address: { flex: 1, fontSize: 17, fontWeight: FontWeight.medium },
  code: { flex: 1, fontSize: 22, fontWeight: FontWeight.semiBold, letterSpacing: 2 },
  caption: { fontSize: 13, marginTop: Spacing['2'] },
  copyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, minWidth: 64, justifyContent: 'center', paddingHorizontal: Spacing['2'] },
  copyText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth, marginTop: Spacing['2'] },
  section: { fontSize: 17, fontWeight: FontWeight.medium },
  subhead: { fontSize: 15, fontWeight: FontWeight.semiBold, marginTop: Spacing['4'], marginBottom: Spacing['1'] },
  step: { fontSize: 15, lineHeight: 22, marginTop: Spacing['1'] },
  filterBox: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], borderRadius: BorderRadius.md, padding: Spacing['3'], marginVertical: Spacing['2'] },
  filter: { flex: 1, fontSize: 13, fontFamily: 'Menlo' },
  logEyebrow: { marginTop: Spacing['8'], marginBottom: Spacing['2'] },
  logRow: { borderBottomWidth: StyleSheet.hairlineWidth },
  logMain: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 60, paddingVertical: Spacing['2'] },
  logText: { flex: 1, gap: 2 },
  logSubject: { fontSize: 15, fontWeight: FontWeight.medium },
  logStatus: { fontSize: 13 },
  logTime: { fontSize: 12 },
  logItem: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingLeft: Spacing['4'] },
  logItemText: { flex: 1, fontSize: 15 },
  rotate: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: Spacing['8'] },
  rotateText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
