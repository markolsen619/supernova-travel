import React, { useCallback, useState } from 'react';
import {
  TouchableOpacity,
  View,
  Text,
  Image,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { MapPin } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { FontSize, FontWeight } from '@/constants/typography';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = (SCREEN_WIDTH - Spacing['6'] * 2 - Spacing['3']) / 2;

interface TrendingCardProps {
  name: string;
  country: string;
  /**
   * Harvested from a constituent trip's persisted coverImageUrl — never
   * resolved here. This component must stay a pure URL consumer: rendering a
   * TrendingCard can never trigger a Places API call.
   */
  photoUrl: string | null;
  tripCount?: number;
  onPress?: () => void;
}

export function TrendingCard({
  name,
  country,
  photoUrl,
  tripCount,
  onPress,
}: TrendingCardProps) {
  const { colors } = useTheme();
  // A stored photo URL can go stale (Google may rotate photo references) —
  // degrade to the intentional placeholder rather than a broken image.
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photoUrl && !photoFailed;

  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress?.();
  }, [onPress]);

  const handlePhotoError = useCallback(() => setPhotoFailed(true), []);

  const meta = [country, tripCount !== undefined ? `${tripCount} ${tripCount === 1 ? 'trip' : 'trips'}` : null]
    .filter(Boolean)
    .join(' · ');

  if (showPhoto) {
    return (
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.85}
        style={styles.touchable}
        accessibilityLabel={`Explore ${name}`}
      >
        <Image
          source={{ uri: photoUrl! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={handlePhotoError}
        />
        {/* Text sits on an unpredictable photo. The scrim is a bottom-anchored
            gradient that reaches 0.85 black exactly where the text lives —
            deep enough that white text holds ≥4.5:1 even over a pure-white
            photo (beach, snow), while a dark photo just blends into it. */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.42)', 'rgba(0,0,0,0.85)'] as [string, string, string]}
          locations={[0.3, 0.62, 1] as [number, number, number]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
        />
        <View style={styles.photoTexts}>
          <Text style={styles.photoName} numberOfLines={1}>
            {name}
          </Text>
          {meta ? (
            <Text style={styles.photoMeta} numberOfLines={1}>
              {meta}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    );
  }

  // No resolvable photo — warm intentional placeholder, never a blank tile.
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.85}
      style={[styles.touchable, styles.fallback, { backgroundColor: colors.background.sunken }]}
      accessibilityLabel={`Explore ${name}`}
    >
      <MapPin size={28} color={colors.text.disabled} weight="duotone" />
      <Text style={[styles.fallbackName, { color: colors.text.primary }]} numberOfLines={1}>
        {name}
      </Text>
      {meta ? (
        <Text style={[styles.fallbackMeta, { color: colors.text.tertiary }]} numberOfLines={1}>
          {meta}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  touchable: {
    width: CARD_WIDTH,
    aspectRatio: 1,
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  photoTexts: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: Spacing['3'],
    gap: 2,
  },
  photoName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: '#fff',
  },
  photoMeta: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing['3'],
    gap: Spacing['2'],
  },
  fallbackName: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
  },
  fallbackMeta: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
});
