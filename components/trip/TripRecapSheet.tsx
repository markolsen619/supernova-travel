/**
 * components/trip/TripRecapSheet.tsx
 *
 * TM-3d — the shareable "story" of a trip: visited stops, in order, with
 * their journal photos and notes. Deliberately shaped the same way a future
 * feed post would render (day → stop → photos → caption) — see the note at
 * the bottom of this file for exactly what a "publish" step would do with
 * this same data. No embedded map here: the interactive trip map (TM-2c)
 * already shows the traveled-vs-upcoming path geographically; this is the
 * photo-and-note story that view didn't have. A lightweight progress bar
 * stands in for "how far along", with a link back to the real map.
 */

import React, { useMemo } from 'react';
import {
  View,
  Text,
  Modal,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { X, MapTrifold, Camera } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useTripJournals } from '@/hooks/useJournal';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { TripWithDays } from '@/types';

interface TripRecapSheetProps {
  visible: boolean;
  trip: TripWithDays;
  onClose: () => void;
  onViewOnMap: () => void;
}

function formatDateRange(start: TripWithDays['startDate'], end: TripWithDays['endDate']): string {
  if (!start) return '';
  const fmt = (ts: NonNullable<TripWithDays['startDate']>) =>
    ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export function TripRecapSheet({ visible, trip, onClose, onViewOnMap }: TripRecapSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const sortedDays = useMemo(() => [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber), [trip.days]);

  const visitedByDay = useMemo(
    () =>
      sortedDays.map((day) => ({
        day,
        stops: [...day.activities].sort((a, b) => a.order - b.order).filter((a) => a.visited),
      })).filter((d) => d.stops.length > 0),
    [sortedDays],
  );

  const totalGrounded = useMemo(
    () => sortedDays.reduce((n, d) => n + d.activities.filter((a) => a.placeId).length, 0),
    [sortedDays],
  );
  const totalVisited = useMemo(
    () => sortedDays.reduce((n, d) => n + d.activities.filter((a) => a.visited).length, 0),
    [sortedDays],
  );

  const journalRefs = useMemo(
    () => visitedByDay.flatMap(({ day, stops }) => stops.map((s) => ({ dayId: day.id, activityId: s.id }))),
    [visitedByDay],
  );
  const { data: journals, isLoading } = useTripJournals(visible ? trip.id : null, journalRefs);

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  };
  const handleViewOnMap = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onViewOnMap();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={handleClose}>
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + Spacing['4'], paddingBottom: insets.bottom + Spacing['8'] }]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.brand.purple }]}>TRIP RECAP</Text>
              <Text style={[styles.title, { color: colors.text.primary }]}>{trip.title}</Text>
              <Text style={[styles.subtitle, { color: colors.text.secondary }]}>
                {formatDateRange(trip.startDate, trip.endDate)}
                {trip.destination.name ? ` · ${trip.destination.name}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={handleClose} hitSlop={12} style={styles.closeBtn} accessibilityLabel="Close">
              <X size={20} color={colors.text.secondary} weight="bold" />
            </TouchableOpacity>
          </View>

          {/* Progress — "how far along", the story's headline stat */}
          <View style={styles.progressBlock}>
            <View style={styles.progressRow}>
              <Text style={[styles.progressText, { color: colors.text.primary }]}>
                {totalVisited} of {totalGrounded} stop{totalGrounded === 1 ? '' : 's'} visited
              </Text>
              <TouchableOpacity onPress={handleViewOnMap} style={styles.mapLink} hitSlop={6}>
                <MapTrifold size={14} color={colors.brand.purple} weight="bold" />
                <Text style={[styles.mapLinkText, { color: colors.brand.purple }]}>View on map</Text>
              </TouchableOpacity>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: colors.background.sunken }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: colors.brand.purple, width: totalGrounded > 0 ? `${(totalVisited / totalGrounded) * 100}%` : '0%' },
                ]}
              />
            </View>
          </View>

          {/* Story — day by day, visited stops only */}
          {visitedByDay.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Camera size={32} color={colors.text.disabled} weight="duotone" />
              <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Nothing visited yet</Text>
              <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>
                Mark stops visited as you go, and this becomes your trip&apos;s story.
              </Text>
            </View>
          ) : (
            visitedByDay.map(({ day, stops }) => (
              <View key={day.id} style={styles.daySection}>
                <Text style={[styles.dayHeader, { color: colors.text.tertiary }]}>
                  DAY {day.dayNumber}{day.title ? ` · ${day.title}` : ''}
                </Text>
                {stops.map((stop) => {
                  const journal = journals?.[stop.id];
                  const { Icon, color: accentColor } = ACTIVITY_ICONS[stop.type];
                  return (
                    <View key={stop.id} style={styles.stopBlock}>
                      <View style={styles.stopHeader}>
                        <Icon size={16} color={accentColor} weight="duotone" />
                        <Text style={[styles.stopTitle, { color: colors.text.primary }]} numberOfLines={1}>
                          {stop.title}
                        </Text>
                      </View>

                      {isLoading ? (
                        <SkeletonBlock height={140} radius={BorderRadius.lg} />
                      ) : journal?.photoUrls.length ? (
                        <FlashList
                          horizontal
                          data={journal.photoUrls}
                          keyExtractor={(uri, i) => `${uri}-${i}`}
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.photoRow}
                          renderItem={({ item }) => (
                            <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" />
                          )}
                        />
                      ) : null}

                      {journal?.note ? (
                        <Text style={[styles.stopNote, { color: colors.text.secondary }]}>{journal.note}</Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingHorizontal: Spacing['5'], gap: Spacing['6'] },

  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Spacing['3'] },
  headerText: { flex: 1 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: Spacing['1'],
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  subtitle: { fontSize: FontSize.sm, marginTop: 2 },
  closeBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  progressBlock: { gap: Spacing['2'] },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  mapLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mapLinkText: { fontSize: FontSize.xs, fontWeight: FontWeight.semiBold },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 4, borderRadius: 2 },

  emptyWrap: { alignItems: 'center', gap: Spacing['2'], paddingVertical: Spacing['10'], paddingHorizontal: Spacing['8'] },
  emptyTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  emptyBody: { fontSize: FontSize.sm, textAlign: 'center' },

  daySection: { gap: Spacing['4'] },
  dayHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
  },
  stopBlock: { gap: Spacing['2'] },
  stopHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  stopTitle: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold, flexShrink: 1 },
  photoRow: { gap: Spacing['2'] },
  photo: { width: 160, height: 140, borderRadius: BorderRadius.lg },
  stopNote: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5 },
});

/**
 * FUTURE "publish to feed" step (not built here) — with this shape already
 * in place, it would: for each visited stop with a journal entry, collect
 * {title, placeId, lat, lng} from the activity and {note, photoUrls} from
 * its journal doc, then either (a) create one Post per stop (mediaType:
 * 'photo', mediaUrls from photoUrls, caption from note, placeName from
 * title) or (b) create a single trip-recap Post (mediaType: 'trip',
 * mediaUrls flattened across all stops' photos, caption summarizing the
 * trip) using the exact fields useCreatePost.ts already writes. No new
 * fields, no reshape — just a read of what's already here and a write
 * through the existing Post-creation path.
 */
