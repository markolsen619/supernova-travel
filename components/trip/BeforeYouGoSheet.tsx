import React, { useCallback, useMemo } from 'react';
import { Linking, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Car, Drop, HandCoins, Money, Phone, Plug, SimCard, X, type Icon } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { countryRows, type CountryRow } from '@/utils/beforeYouGo';
import { airaloUrl } from '@/utils/esim';
import { linkTemplatesFromEnv } from '@/utils/partnerLinks';

const TEMPLATES = linkTemplatesFromEnv(process.env);
const ROW_ICONS: Record<CountryRow['kind'], Icon> = { plugs: Plug, money: Money, tipping: HandCoins, emergency: Phone, driving: Car, water: Drop };

/**
 * Before you go (spec docs/superpowers/specs/2026-11-12-trip-extras-design.md): one section per international country
 * on the trip — plugs vs home, money, tipping, emergency (tap to call), driving, tap water — and an Airalo eSIM link.
 * Built-in data, so it works offline.
 */
export function BeforeYouGoSheet({ visible, countries, home, onClose }: { visible: boolean; countries: string[]; home: string | null; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const sections = useMemo(() => countries.map((code) => ({ ...countryRows(code, home), esim: airaloUrl(code, TEMPLATES) })), [countries, home]);

  const open = useCallback((url: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>YOUR TRIP</Text>
            <Text style={[styles.title, { color: colors.text.primary }]} accessibilityRole="header">Before you go</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {sections.map((s) => (
            <View key={s.code} style={styles.country}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{s.name.toUpperCase()}</Text>
              <View style={[styles.card, { backgroundColor: colors.background.card }]}>
                {s.rows.map((r) => {
                  const RowIcon = ROW_ICONS[r.kind];
                  const body = (
                    <>
                      <RowIcon size={16} color={colors.text.secondary} weight="duotone" />
                      <View style={styles.rowText}>
                        <Text style={[styles.label, { color: colors.text.tertiary }]}>{r.label}</Text>
                        <Text style={[styles.value, { color: r.tel ? colors.brand.purple : colors.text.primary }]}>{r.value}</Text>
                      </View>
                    </>
                  );
                  return r.tel ? (
                    <TouchableOpacity key={r.kind} style={styles.row} onPress={() => open(`tel:${r.tel}`)} accessibilityRole="link" accessibilityLabel={`Call ${r.tel}, emergency number in ${s.name}`}>
                      {body}
                    </TouchableOpacity>
                  ) : (
                    <View key={r.kind} style={styles.row}>{body}</View>
                  );
                })}
                {s.esim ? (
                  <TouchableOpacity style={styles.row} onPress={() => open(s.esim!)} accessibilityRole="link" accessibilityLabel={`Get an eSIM for ${s.name} from Airalo`}>
                    <SimCard size={16} color={colors.text.secondary} weight="duotone" />
                    <Text style={[styles.value, styles.rowText, { color: colors.text.primary }]}>{`Get an eSIM for ${s.name} · Airalo`}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 24 },
  country: { gap: 8 },
  card: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 8 },
  rowText: { flex: 1 },
  label: { fontSize: 13 },
  value: { fontSize: 15, lineHeight: 21 },
});
