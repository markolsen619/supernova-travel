import { memo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image } from 'react-native';
import * as Haptics from 'expo-haptics';
import { DarkColors } from '@/constants/colors';
import { FontWeight } from '@/constants/typography';
import type { FriendTraveling } from '@/hooks/useFriendsTraveling';

interface Props {
  friend: FriendTraveling;
  onPress: (friend: FriendTraveling) => void;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');

/** A friend on a trip, on the always-dark globe: photo in a brand ring, first name beneath. */
function FriendTravelMarkerInner({ friend, onPress }: Props) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress(friend);
  }, [friend, onPress]);
  return (
    <TouchableOpacity
      onPress={handlePress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={`${friend.name} is in ${friend.city} — open their trip`}
      hitSlop={6}
    >
      <View style={styles.ring}>
        {friend.avatarUrl ? (
          <Image source={{ uri: friend.avatarUrl }} style={styles.photo} />
        ) : (
          <View style={[styles.photo, styles.fallback]}>
            <Text style={styles.initials}>{initials(friend.name)}</Text>
          </View>
        )}
      </View>
      <Text style={styles.name} numberOfLines={1}>{firstName(friend.name)}</Text>
    </TouchableOpacity>
  );
}

export const FriendTravelMarker = memo(FriendTravelMarkerInner);

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', minWidth: 44, minHeight: 44 },
  ring: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: DarkColors.brand.purple, padding: 2, backgroundColor: DarkColors.background.primary },
  photo: { width: '100%', height: '100%', borderRadius: 16 },
  fallback: { alignItems: 'center', justifyContent: 'center', backgroundColor: DarkColors.background.elevated },
  initials: { color: DarkColors.text.primary, fontSize: 12, fontWeight: FontWeight.semiBold },
  name: {
    marginTop: 3, maxWidth: 80, color: DarkColors.text.primary, fontSize: 11, fontWeight: FontWeight.medium,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 },
  },
});
