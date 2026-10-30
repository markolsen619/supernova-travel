/** A trip under Home's "Coming up" (spec 2026-10-29): thumbnail, eyebrow dates (or DATES NOT SET), title. */
import { memo, useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import type { Trip } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

export const TripRow = memo(function TripRow({ trip, eyebrow }: { trip: Trip; eyebrow: string }) {
  const { colors } = useTheme();
  const open = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/trip/${trip.id}`); }, [trip.id]);
  return (
    <Pressable onPress={open} style={[styles.row, { backgroundColor: colors.background.card }]} accessibilityRole="button" accessibilityLabel={`${trip.title}, ${eyebrow.toLowerCase()}`}>
      <View style={[styles.thumb, { backgroundColor: colors.background.sunken }]}>
        {trip.coverImageUrl ? <Image source={{ uri: trip.coverImageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
      </View>
      <View style={styles.text}>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>{eyebrow}</Text>
        <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>{trip.title}</Text>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], borderRadius: 16, padding: Spacing['2'] },
  thumb: { width: 56, height: 56, borderRadius: 12, overflow: 'hidden' },
  text: { flex: 1, gap: 2 },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
});
