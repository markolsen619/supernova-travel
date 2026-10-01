import React, { useCallback, useState } from 'react';
import { TouchableOpacity, View, Text, Image, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { columnWidth } from '@/utils/layout';
import { destinationEyebrow, type Destination } from '@/utils/destinations';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

interface DestinationCardProps {
  destination: Destination;
  onPress: (slug: string) => void;
}

/**
 * A catalog destination in the Explore grid: a tall photo with the editorial
 * eyebrow (`PORTUGAL · 4 TRIPS`) above the name. The photo is the cover the
 * seed stored once — rendering a card never calls Places.
 */
export function DestinationCard({ destination, onPress }: DestinationCardProps) {
  const { colors } = useTheme();
  const { width, columns } = useLayout();
  const cardWidth = columnWidth(width, columns);
  const cardHeight = Math.round(cardWidth * 1.3);
  // A stored photo URL can go stale — fall back to the placeholder, never a broken image.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!destination.coverImageUrl && !photoFailed;
  const eyebrow = destinationEyebrow(destination);

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(destination.slug);
  }, [onPress, destination.slug]);
  const handlePhotoError = useCallback(() => setPhotoFailed(true), []);

  const label = `${destination.name}, ${destination.countryName}`;

  if (showPhoto) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={[styles.card, { width: cardWidth, height: cardHeight }]}
        accessibilityLabel={label}
      >
        <Image source={{ uri: destination.coverImageUrl! }} style={StyleSheet.absoluteFill} resizeMode="cover" onError={handlePhotoError} />
        {/* Deep enough at the bottom that white text holds 4.5:1 over a white photo. */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.85)'] as [string, string, string]}
          locations={[0.4, 0.68, 1] as [number, number, number]}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.texts}>
          <Text style={styles.photoEyebrow} numberOfLines={1}>{eyebrow}</Text>
          <Text style={styles.photoName} numberOfLines={2}>{destination.name}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.card, styles.fallback, { width: cardWidth, height: cardHeight, backgroundColor: colors.background.sunken }]}
      accessibilityLabel={label}
    >
      <MapPin size={28} color={colors.text.disabled} weight="duotone" />
      <Text style={[styles.fallbackEyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>{eyebrow}</Text>
      <Text style={[styles.fallbackName, { color: colors.text.primary }]} numberOfLines={2}>{destination.name}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, overflow: 'hidden' },
  texts: { flex: 1, justifyContent: 'flex-end', padding: Spacing['3'], gap: 2 },
  photoEyebrow: {
    fontSize: 11,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * 11,
    color: 'rgba(255,255,255,0.85)',
  },
  photoName: { fontSize: 17, fontWeight: FontWeight.semiBold, color: '#fff', letterSpacing: -0.01 * 17 },
  fallback: { alignItems: 'center', justifyContent: 'center', padding: Spacing['3'], gap: Spacing['1'] },
  fallbackEyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.08 * 11, marginTop: Spacing['2'] },
  fallbackName: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, textAlign: 'center' },
});
