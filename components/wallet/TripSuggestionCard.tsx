import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { CaretRight } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useMyTrips } from '@/hooks/useMyTrips';
import { useBookingTripLink } from '@/hooks/useBookingTripLink';
import { tripDateEyebrow } from '@/utils/walletLink';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

interface TripSuggestionCardProps {
  kind: 'boarding_pass' | 'reservation';
  item: { id: string; tripId?: string | null; tripSuggestions?: string[]; tripLinkDismissed?: boolean };
}

/** "Is this for a trip?" — when matching found more than one trip, or dates without a place. */
export function TripSuggestionCard({ kind, item }: TripSuggestionCardProps) {
  const { colors } = useTheme();
  const asking = !!item.tripSuggestions?.length && !item.tripId && !item.tripLinkDismissed;
  const { trips } = useMyTrips(asking);
  const { link, notForTrip, pending } = useBookingTripLink(kind, item.id);
  const appear = useRef(new Animated.Value(0)).current;
  const suggestions = asking
    ? (item.tripSuggestions ?? []).map((id) => trips.find((t) => t.tripId === id)).filter((t) => !!t)
    : [];

  useEffect(() => {
    if (suggestions.length) Animated.spring(appear, { toValue: 1, ...SPRING }).start();
  }, [suggestions.length, appear]);

  if (suggestions.length === 0) return null;
  return (
    <Animated.View
      style={[
        styles.card,
        { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, opacity: appear },
        { transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }] },
      ]}
    >
      <Text style={[styles.title, { color: colors.text.primary }]}>Is this for a trip?</Text>
      {suggestions.map((t) => (
        <TouchableOpacity
          key={t!.tripId}
          onPress={() => link(t!.tripId)}
          disabled={pending}
          style={[styles.row, { borderColor: colors.background.cardBorder }]}
          accessibilityRole="button"
          accessibilityLabel={`Add to ${t!.title}`}
        >
          <View style={styles.rowText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{tripDateEyebrow(t!.start, t!.end)}</Text>
            <Text style={[styles.rowTitle, { color: colors.text.primary }]} numberOfLines={2}>{t!.title}</Text>
          </View>
          <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      ))}
      <TouchableOpacity onPress={notForTrip} disabled={pending} style={styles.notFor} accessibilityRole="button">
        <Text style={[styles.notForText, { color: colors.text.secondary }]}>Not for a trip</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['4'], marginBottom: Spacing['4'] },
  title: { fontSize: 17, fontWeight: FontWeight.medium, marginBottom: Spacing['2'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 60, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2, paddingVertical: Spacing['2'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  rowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  notFor: { minHeight: 44, justifyContent: 'center', marginTop: Spacing['1'] },
  notForText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
