/**
 * The past-trip review (spec 2026-10-25): cover, eyebrow, editable title; per day a caption and its stops with
 * photos; unplaced photos; visibility; one primary action, Save trip. Nothing is saved before that.
 */
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useUserStore } from '@/stores/useUserStore';
import { Button } from '@/components/ui/Button';
import { VISIBILITY_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { isPrivateAccount, publicAllowed } from '@/utils/privacy';
import { pastTripEyebrow, type DraftDay, type PastTripDraft } from '@/utils/pastTrip';
import type { PastTripEdit } from '@/utils/pastTripEdits';
import type { TripVisibility } from '@/types';
import { PastStopCard } from './PastStopCard';
import { MoveToStopSheet, StopActionsSheet } from './PastTripSheets';

const VISIBILITIES: { v: TripVisibility; label: string }[] = [
  { v: 'public', label: 'Public' }, { v: 'followers', label: 'Followers' }, { v: 'private', label: 'Private' },
];

interface Props {
  draft: PastTripDraft;
  onEdit: (e: PastTripEdit) => void;
  onSave: (visibility: TripVisibility) => void;
  error: string | null;
  noLocations: boolean;
}

export function PastTripReview({ draft, onEdit, onSave, error, noLocations }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const publicOk = publicAllowed(isPrivateAccount(useUserStore((s) => s.profile)));
  const [visibility, setVisibility] = useState<TripVisibility>('followers');
  const [moving, setMoving] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const stops = useMemo(() => draft.days.flatMap((d, dayIndex) => d.stops.map((s) => ({ ...s, dayIndex }))), [draft.days]);
  const editingStop = stops.find((s) => s.id === editing) ?? null;
  const canMerge = !!editingStop && draft.days[editingStop.dayIndex].stops[0]?.id !== editingStop.id;
  const cover = draft.coverId ? draft.photos[draft.coverId]?.uri : undefined;

  const save = useCallback(() => onSave(visibility), [onSave, visibility]);
  const toggleShown = useCallback((stopId: string, photoId: string) => onEdit({ type: 'toggleShown', stopId, photoId }), [onEdit]);
  const pickVisibility = useCallback((v: TripVisibility) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setVisibility(v); }, []);
  const moveTo = useCallback((stopId: string) => {
    if (moving) onEdit({ type: 'movePhoto', photoId: moving, toStopId: stopId });
    setMoving(null);
  }, [moving, onEdit]);

  const renderDay = useCallback(({ item: day, index }: { item: DraftDay; index: number }) => (
    <View style={styles.day}>
      <Text style={[styles.dayHead, { color: colors.text.primary }]}>
        Day {index + 1}{day.stops[0] ? ` · ${draft.cities[day.city]?.name || day.stops[0].name}` : ''}
      </Text>
      <TextInput
        value={day.caption}
        onChangeText={(v) => onEdit({ type: 'caption', day: index, value: v })}
        placeholder="Add a caption"
        placeholderTextColor={colors.text.tertiary}
        maxLength={80}
        style={[styles.caption, { color: colors.text.secondary }]}
        accessibilityLabel={`Day ${index + 1} caption`}
      />
      {day.stops.length === 0 && <Text style={[styles.note, { color: colors.text.tertiary }]}>No photos this day.</Text>}
      {day.stops.map((s) => (
        <PastStopCard key={s.id} stop={s} photos={draft.photos} onOpen={setEditing} onMovePhoto={setMoving} onToggleShown={toggleShown} />
      ))}
    </View>
  ), [colors, draft.cities, draft.photos, onEdit, toggleShown]);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
      <FlashList
        data={draft.days}
        keyExtractor={(d) => d.day}
        renderItem={renderDay}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        ListHeaderComponent={(
          <View>
            {cover ? <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" accessibilityLabel="Cover photo" /> : null}
            <View style={styles.header}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{pastTripEyebrow(draft.days.map((d) => d.day))}</Text>
              <TextInput
                value={draft.title}
                onChangeText={(v) => onEdit({ type: 'title', value: v })}
                maxLength={60}
                multiline
                style={[styles.title, { color: colors.text.primary }]}
                accessibilityLabel="Trip title"
              />
              {draft.description ? <Text style={[styles.body, { color: colors.text.secondary }]}>{draft.description}</Text> : null}
              {noLocations && (
                <Text style={[styles.note, { color: colors.text.secondary }]}>
                  {"These photos don't say where they were taken, so the days are built from their dates. Add places to the trip after saving."}
                </Text>
              )}
            </View>
          </View>
        )}
        ListFooterComponent={(
          <View style={[styles.footer, { paddingBottom: insets.bottom + 120 }]}>
            {draft.unplaced.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.dayHead, { color: colors.text.primary }]}>Unplaced photos</Text>
                <Text style={[styles.note, { color: colors.text.tertiary }]}>
                  {stops.length ? "Tap one to put it on a stop. Photos left here aren't saved." : "Photos without a place aren't saved."}
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
                  {draft.unplaced.map((id) => (
                    <Pressable key={id} onPress={stops.length ? () => setMoving(id) : undefined} accessibilityLabel="Put this photo on a stop">
                      <Image source={{ uri: draft.photos[id]?.uri }} style={styles.thumb} contentFit="cover" />
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}
            <View style={styles.section}>
              <Text style={[styles.dayHead, { color: colors.text.primary }]}>Who can see it</Text>
              {!publicOk && <Text style={[styles.note, { color: colors.text.tertiary }]}>Your account is private, so trips are visible to followers.</Text>}
              <View style={styles.visRow}>
                {VISIBILITIES.map(({ v, label }) => {
                  const active = visibility === v;
                  const { Icon, color } = VISIBILITY_ICONS[v];
                  const unavailable = v === 'public' && !publicOk;
                  return (
                    <TouchableOpacity
                      key={v}
                      disabled={unavailable}
                      onPress={() => pickVisibility(v)}
                      style={[styles.visBtn, unavailable && styles.dim, {
                        backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card,
                        borderColor: active ? colors.brand.purple : colors.background.cardBorder,
                      }]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active, disabled: unavailable }}
                      accessibilityLabel={`${label} visibility`}
                    >
                      <Icon size={18} color={active ? color : colors.text.tertiary} weight={active ? 'duotone' : 'regular'} />
                      <Text style={[styles.visLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </View>
        )}
      />
      <View style={[styles.bar, { paddingBottom: insets.bottom + Spacing['3'], backgroundColor: colors.background.primary, borderTopColor: colors.background.cardBorder }]}>
        {error ? <Text style={[styles.error, { color: colors.semantic.error }]}>{error}</Text> : null}
        <Button label="Save trip" onPress={save} fullWidth />
      </View>
      <MoveToStopSheet visible={!!moving} stops={stops} onPick={moveTo} onClose={() => setMoving(null)} />
      <StopActionsSheet stop={editingStop} canMerge={canMerge} onEdit={onEdit} onClose={() => setEditing(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  cover: { width: '100%', aspectRatio: 4 / 3 },
  header: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], gap: Spacing['2'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.5, padding: 0 },
  body: { fontSize: FontSize.base, lineHeight: 22 },
  day: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['6'] },
  dayHead: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  caption: { fontSize: FontSize.sm, paddingVertical: Spacing['2'], minHeight: 44 },
  note: { fontSize: FontSize.sm, lineHeight: 19 },
  footer: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['6'], gap: Spacing['6'] },
  section: { gap: Spacing['2'] },
  strip: { gap: Spacing['2'] },
  thumb: { width: 64, height: 64, borderRadius: 12 },
  visRow: { flexDirection: 'row', gap: Spacing['2'] },
  visBtn: { flex: 1, minHeight: 48, borderRadius: BorderRadius.lg, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: Spacing['2'] },
  dim: { opacity: 0.4 },
  visLabel: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
  bar: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: Spacing['5'], paddingTop: Spacing['3'], borderTopWidth: StyleSheet.hairlineWidth, gap: Spacing['2'] },
  error: { fontSize: FontSize.sm },
});
