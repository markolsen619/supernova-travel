import React, { useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { CaretRight, MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { DmTripSnapshot } from '@/types';

interface TripMessageCardProps {
  trip: DmTripSnapshot;
  onLongPress?: () => void;
}

/** A trip shared in a message. Tapping opens it; the trip screen decides
 * what this reader may see (a followers-only trip they can't open shows
 * the not-found state, never the itinerary). */
export function TripMessageCard({ trip, onLongPress }: TripMessageCardProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const open = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/trip/${trip.tripId}`);
  }, [router, trip.tripId]);

  const eyebrow = [trip.placeLabel, trip.dateRange].filter(Boolean).join(' · ').toUpperCase();

  return (
    <Pressable
      onPress={open}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityRole="link"
      accessibilityLabel={`Trip: ${trip.title}. Open trip`}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: colors.background.elevated, borderColor: colors.background.cardBorder, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      {trip.coverImageUrl ? (
        <Image source={{ uri: trip.coverImageUrl }} style={styles.cover} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.cover, styles.coverFallback, { backgroundColor: colors.background.sunken }]}>
          <MapPin size={26} color={colors.text.disabled} weight="duotone" />
        </View>
      )}
      <View style={styles.body}>
        {!!eyebrow && (
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>{eyebrow}</Text>
        )}
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={2}>{trip.title}</Text>
        <View style={styles.openRow}>
          <Text style={[styles.open, { color: colors.text.secondary }]}>Open trip</Text>
          <CaretRight size={12} color={colors.text.secondary} weight="bold" />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { width: 240, borderRadius: BorderRadius.xl, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  cover: { width: '100%', aspectRatio: 16 / 10 },
  coverFallback: { alignItems: 'center', justifyContent: 'center' },
  body: { padding: Spacing['3'], gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, lineHeight: FontSize.md * 1.3 },
  openRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, minHeight: 20 },
  open: { fontSize: 13, fontWeight: FontWeight.medium },
});
