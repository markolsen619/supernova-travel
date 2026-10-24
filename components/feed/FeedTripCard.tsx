import React, { useCallback } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { FeedPhoto } from '@/components/feed/FeedPhoto';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { TAB_BAR_HEIGHT } from '@/constants/layout';
import { Spacing } from '@/constants/spacing';
import { FontWeight } from '@/constants/typography';
import { tripEyebrow, type FeedTrip } from '@/utils/feedMix';

/**
 * A trip as a full-screen feed page (spec 2026-10-24-seed-social-design.md): the cover leads, then the eyebrow,
 * title, who made it and one action. Full-bleed media like FeedCard, so the colours are fixed light-on-photo.
 */
export function FeedTripCard({ trip, author, width, height }: {
  trip: FeedTrip; author?: { name: string; avatarUrl: string | null }; width: number; height: number;
}) {
  const insets = useSafeAreaInsets();
  const open = useCallback(() => {
    router.push(`/trip/${trip.id}`);
  }, [trip.id]);
  const openFromPhoto = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    open();
  }, [open]);

  return (
    <View style={{ width, height, backgroundColor: '#000' }}>
      <TouchableOpacity activeOpacity={1} onPress={openFromPhoto} style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={`Open trip ${trip.title}`}>
        <FeedPhoto uri={trip.coverImageUrl!} style={StyleSheet.absoluteFill} />
      </TouchableOpacity>
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.35)', 'rgba(0,0,0,0.85)'] as [string, string, string]}
        style={[styles.gradient, { height: height * 0.6 }]}
        pointerEvents="none"
      />
      <View style={[styles.info, { bottom: TAB_BAR_HEIGHT + insets.bottom + Spacing['6'] }]} pointerEvents="box-none">
        <Text style={styles.eyebrow} numberOfLines={1}>{tripEyebrow(trip)}</Text>
        <Text style={styles.title} numberOfLines={2}>{trip.title}</Text>
        <View style={styles.authorRow}>
          {trip.isEditorial ? (
            <Image source={require('@/assets/images/SupernovaStar.png')} style={styles.star} accessibilityIgnoresInvertColors />
          ) : (
            <Avatar uri={author?.avatarUrl ?? null} name={author?.name ?? ''} size="xs" />
          )}
          <Text style={styles.author} numberOfLines={1}>{trip.isEditorial ? 'Supernova' : author?.name ?? 'A traveler'}</Text>
          {trip.isEditorial ? <View style={styles.pick}><Text style={styles.pickText}>Supernova pick</Text></View> : null}
        </View>
        <Button label="Open trip" onPress={open} haptic="light" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gradient: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  info: { position: 'absolute', left: Spacing['5'], right: Spacing['5'], gap: Spacing['2'] },
  eyebrow: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { color: '#fff', fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['3'] },
  star: { width: 22, height: 22 },
  author: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: FontWeight.medium, flexShrink: 1 },
  pick: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pickText: { color: '#fff', fontSize: 11, fontWeight: FontWeight.semiBold },
});
