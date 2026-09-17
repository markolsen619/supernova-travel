import React, { useCallback, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import { Sparkle, TextAlignLeft, Buildings, ShieldCheck, X } from 'phosphor-react-native';
import type { Icon as PhosphorIcon } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { PRIVACY_POLICY_URL } from '@/constants/legal';
import type { AiPurpose } from '@/utils/aiConsent';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface AiConsentSheetProps {
  /** Which feature asked. Leads with what that feature sends; both are covered either way. */
  purpose: AiPurpose | null;
  onAllow: () => Promise<void>;
  onClose: () => void;
}

const LEAD: Record<AiPurpose, { title: string; sends: string }> = {
  trip: {
    title: 'Plan with AI',
    sends: 'Your destinations, dates, travel style, must-sees, and anything you write in preferences.',
  },
  import: {
    title: 'Import with AI',
    sends:
      'The confirmation text or screenshot you add. It can include your name, confirmation numbers, flight details, and hotel addresses.',
  },
};

/**
 * The permission App Store guideline 5.1.2(i) requires before personal data
 * goes to a third-party AI. Names the company, what's sent, and why, and
 * covers both AI features so the user is asked once
 * (utils/aiConsent.ts versions it). Withdrawn from Settings → Privacy.
 */
export function AiConsentSheet({ purpose, onAllow, onClose }: AiConsentSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lead = LEAD[purpose ?? 'trip'];
  const other = purpose === 'import' ? LEAD.trip : LEAD.import;

  const handleAllow = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      await onAllow();
    } catch {
      setError("We couldn't save your choice. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }, [onAllow]);

  const openPrivacy = useCallback(() => {
    WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL);
  }, []);

  const rows: { Icon: PhosphorIcon; title: string; body: string }[] = [
    { Icon: TextAlignLeft, title: 'What gets sent', body: lead.sends },
    { Icon: Buildings, title: 'Who receives it', body: "Google, through its Gemini API, which writes the itinerary or reads the booking and sends the result back to Supernova." },
    { Icon: ShieldCheck, title: 'What it isn’t used for', body: 'Supernova never uses it for ads or sells it. Nothing is sent until you tap a button that uses AI.' },
    { Icon: Sparkle, title: 'Also covers', body: `${other.title}: ${other.sends.charAt(0).toLowerCase()}${other.sends.slice(1)}` },
  ];

  return (
    <Modal visible={!!purpose} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + Spacing['6'] }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>BEFORE YOU USE AI</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Close">
              <X size={22} color={colors.text.secondary} weight="bold" />
            </TouchableOpacity>
          </View>

          <Text style={[styles.title, { color: colors.text.primary }]}>Your details go to Google Gemini</Text>
          <Text style={[styles.body, { color: colors.text.secondary }]}>
            AI features in Supernova are powered by Google. Here&apos;s exactly what that means.
          </Text>

          <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
            {rows.map(({ Icon, title, body }, i) => (
              <View
                key={title}
                style={[
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.background.cardBorder },
                ]}
              >
                <View style={[styles.iconBubble, { backgroundColor: `${colors.brand.purple}1A` }]}>
                  <Icon size={18} color={colors.brand.purple} weight="duotone" />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowTitle, { color: colors.text.primary }]}>{title}</Text>
                  <Text style={[styles.rowBody, { color: colors.text.secondary }]}>{body}</Text>
                </View>
              </View>
            ))}
          </View>

          <Text style={[styles.footnote, { color: colors.text.tertiary }]}>
            You can turn this off any time in Settings → Privacy.{' '}
            <Text style={styles.link} onPress={openPrivacy} accessibilityRole="link">
              Read the privacy policy
            </Text>
          </Text>

          <View style={styles.actions}>
            <Button label="Allow and continue" variant="primary" size="lg" fullWidth loading={saving} disabled={saving} onPress={handleAllow} />
            <Button label="Not now" variant="ghost" size="lg" fullWidth haptic="light" onPress={onClose} />
          </View>

          {error ? (
            <Text style={[styles.error, { color: colors.semantic.error }]} accessibilityLiveRegion="polite">
              {error}
            </Text>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['4'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.88 },
  closeButton: { width: 44, height: 44, alignItems: 'flex-end', justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.52, marginBottom: Spacing['2'] },
  body: { fontSize: FontSize.base, lineHeight: FontSize.base * 1.5, marginBottom: Spacing['5'] },
  card: { borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: Spacing['3'], padding: Spacing['4'] },
  iconBubble: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  rowBody: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5 },
  footnote: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5, marginTop: Spacing['4'] },
  link: { textDecorationLine: 'underline' },
  actions: { gap: Spacing['2'], marginTop: Spacing['5'] },
  error: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5, marginTop: Spacing['3'] },
});
