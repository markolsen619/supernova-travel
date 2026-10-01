import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { CaretRight, MapPin } from 'phosphor-react-native';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { destinationEyebrow, type Destination } from '@/utils/destinations';

interface DestinationResultProps {
  destination: Destination;
  onPress: (slug: string) => void;
}

/**
 * A catalog destination in the globe's search sheet — always dark, like the
 * rest of that sheet. Opens the destination page, not a Places lookup.
 */
export function DestinationResult({ destination, onPress }: DestinationResultProps) {
  const colors = DarkColors;
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!destination.coverImageUrl && !photoFailed;
  return (
    <TouchableOpacity
      onPress={() => onPress(destination.slug)}
      activeOpacity={0.7}
      style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
      accessibilityLabel={`${destination.name}, ${destination.countryName}`}
    >
      {showPhoto ? (
        <Image source={{ uri: destination.coverImageUrl! }} style={styles.thumb} contentFit="cover" cachePolicy="disk" onError={() => setPhotoFailed(true)} />
      ) : (
        <View style={[styles.thumb, styles.thumbFallback, { backgroundColor: colors.background.elevated }]}>
          <MapPin size={20} color={colors.brand.purple} weight="duotone" />
        </View>
      )}
      <View style={styles.center}>
        <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{destination.name}</Text>
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]} numberOfLines={1}>{destinationEyebrow(destination)}</Text>
      </View>
      <CaretRight size={16} color={colors.text.tertiary} weight="bold" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing['3'],
  },
  thumb: { width: 44, height: 44, borderRadius: 10 },
  thumbFallback: { alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, gap: 2 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.08 * 11 },
});
