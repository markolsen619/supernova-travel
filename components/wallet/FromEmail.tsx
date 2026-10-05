import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { EnvelopeSimple } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Spacing } from '@/constants/spacing';

/** "From email" — this booking arrived through the forwarding address. */
export function FromEmail() {
  const { colors } = useTheme();
  return (
    <View style={styles.row}>
      <EnvelopeSimple size={12} color={colors.text.tertiary} weight="regular" />
      <Text style={[styles.text, { color: colors.text.tertiary }]}>From email</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: Spacing['3'] },
  text: { fontSize: 13 },
});
