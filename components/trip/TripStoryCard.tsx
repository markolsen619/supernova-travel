/**
 * A trip as a 9:16 Instagram Story image (owner, 2026-11-08), rendered off-screen at 360 × 640 and captured at
 * 1080 × 1920 (the Year in Travel way): the cover photo leads, then the cities and length, the title, up to 4 highlight
 * stops, and the star with supernovatravel.xyz. Always dark — it's an image, not app chrome. No dates.
 */
import { forwardRef } from 'react';
import { Image as RNImage, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { storyContent } from '@/utils/tripStory';

const STAR = require('@/assets/images/SupernovaStar.png');
const VOID = '#0B0A12';

type Props = { trip: Parameters<typeof storyContent>[0] & { coverImageUrl?: string | null } };

export const TripStoryCard = forwardRef<View, Props>(function TripStoryCard({ trip }, ref) {
  const c = storyContent(trip);
  return (
    <View ref={ref} collapsable={false} style={styles.frame}>
      {trip.coverImageUrl ? <Image source={{ uri: trip.coverImageUrl }} style={styles.cover} contentFit="cover" /> : <View style={[styles.cover, styles.coverEmpty]} />}
      <LinearGradient colors={['transparent', VOID] as [string, string]} locations={[0.35, 1] as [number, number]} style={styles.fade} />
      <View style={styles.body}>
        <Text style={styles.eyebrow}>{c.eyebrow}</Text>
        <Text style={styles.title} numberOfLines={3}>{c.title}</Text>
        {c.stops.map((s) => (
          <View key={s} style={styles.stopRow}>
            <View style={styles.dot} />
            <Text style={styles.stop} numberOfLines={1}>{s}</Text>
          </View>
        ))}
      </View>
      <View style={styles.brand}>
        <RNImage source={STAR} style={styles.star} />
        <Text style={styles.url}>supernovatravel.xyz</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  frame: { width: 360, height: 640, backgroundColor: VOID, overflow: 'hidden' },
  cover: { position: 'absolute', top: 0, left: 0, right: 0, height: 400 },
  coverEmpty: { backgroundColor: '#171422' },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 420 },
  body: { position: 'absolute', left: 24, right: 24, top: 300, gap: 8 },
  eyebrow: { color: '#B9B2CC', fontSize: 11, fontWeight: '600', letterSpacing: 1.2 },
  title: { color: '#F5F3F9', fontSize: 30, fontWeight: '700', letterSpacing: -0.6, lineHeight: 34, marginBottom: 8 },
  stopRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#D4537E' },
  stop: { flex: 1, color: '#F5F3F9', fontSize: 15, fontWeight: '500' },
  brand: { position: 'absolute', left: 24, right: 24, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: 8 },
  star: { width: 22, height: 22 },
  url: { color: '#B9B2CC', fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
});
