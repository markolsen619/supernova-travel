/**
 * One stop on the past-trip review screen: time, name, type icon and its photos (spec 2026-10-25). Tap the card
 * for its actions; long-press a photo to move it to another stop; "10 of 14" opens every photo so the person can
 * choose which 10 are kept.
 */
import { memo, useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { CheckCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';
import type { DraftStop, PickedPhoto } from '@/utils/pastTrip';

interface Props {
  stop: DraftStop;
  photos: Record<string, PickedPhoto>;
  onOpen: (stopId: string) => void;
  onMovePhoto: (photoId: string) => void;
  onToggleShown: (stopId: string, photoId: string) => void;
}

export const PastStopCard = memo(function PastStopCard({ stop, photos, onOpen, onMovePhoto, onToggleShown }: Props) {
  const { colors } = useTheme();
  const [choosing, setChoosing] = useState(false);
  const { Icon, color } = ACTIVITY_ICONS[stop.type];
  const hidden = stop.photoIds.length - stop.shownIds.length;
  const strip = choosing ? stop.photoIds : stop.shownIds;

  const open = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onOpen(stop.id); }, [onOpen, stop.id]);
  const toggleChoosing = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setChoosing((c) => !c); }, []);

  return (
    <View style={[styles.card, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
      <Pressable onPress={open} style={styles.head} accessibilityRole="button" accessibilityLabel={`${stop.name}. Edit this stop`}>
        <TypeIconBubble Icon={Icon} color={color} />
        <View style={styles.headText}>
          <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={2}>{stop.name}</Text>
        </View>
      </Pressable>
      {strip.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
          {strip.map((id) => {
            const kept = stop.shownIds.includes(id);
            return (
              <Pressable
                key={id}
                onPress={choosing ? () => onToggleShown(stop.id, id) : undefined}
                onLongPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onMovePhoto(id); }}
                accessibilityLabel={choosing ? (kept ? 'Kept. Tap to leave this photo out' : 'Left out. Tap to keep this photo') : 'Photo. Long-press to move it to another stop'}
                style={styles.thumbHit}
              >
                <Image source={{ uri: photos[id]?.uri }} style={[styles.thumb, choosing && !kept && styles.left]} contentFit="cover" />
                {choosing && kept && <View style={styles.tick}><CheckCircle size={18} weight="fill" color={colors.brand.purple} /></View>}
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      {hidden > 0 || choosing ? (
        <Pressable onPress={toggleChoosing} style={styles.more} accessibilityRole="button" accessibilityLabel={choosing ? 'Done choosing photos' : 'Choose which photos to keep'}>
          <Text style={[styles.moreText, { color: colors.brand.purple }]}>
            {choosing ? 'Done' : `${stop.shownIds.length} of ${stop.photoIds.length} · Choose`}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  card: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['3'], gap: Spacing['3'], marginTop: Spacing['3'] },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 44 },
  headText: { flex: 1 },
  name: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  strip: { gap: Spacing['2'] },
  thumbHit: { borderRadius: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  left: { opacity: 0.35 },
  tick: { position: 'absolute', top: 4, right: 4 },
  more: { minHeight: 44, justifyContent: 'center' },
  moreText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
