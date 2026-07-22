/**
 * components/trip/JournalSheet.tsx
 *
 * "Your visit" — the owner's private photos + note for a VISITED stop.
 * Deliberately distinct from PlaceDetailSheet ("About this place", Google's
 * public data): no rating/hours/summary, no Google attribution, no
 * "Add to trip" — this is personal content, not place data. Reachable from
 * both the timeline and the map (see trip/[id].tsx), so it takes the same
 * `colors` override pattern as PlaceDetailSheet/AddToTripSheet for the
 * map's always-dark context.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  Image,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { X, Plus, Notebook } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import type { ThemeColors } from '@/constants/colors';
import { useJournalEntry, useJournal, MAX_JOURNAL_PHOTOS } from '@/hooks/useJournal';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import type { TripActivity } from '@/types';

const NOTE_MAX = 280;
const PHOTO_SIZE = 108;
// A resolved pixel cap, not a percentage `maxHeight` — Yoga can't
// auto-measure a `maxHeight`-only (undefined-height) node when its
// descendants include a BlurView wrapping a FlashList (see sheetWrap).
const SHEET_HEIGHT = Dimensions.get('window').height * 0.75;

interface JournalSheetProps {
  visible: boolean;
  tripId: string;
  dayId: string;
  activity: TripActivity;
  isOwner: boolean;
  onClose: () => void;
  /** Override for the map's always-dark context — see PlaceDetailSheet. */
  colors?: ThemeColors;
}

export function JournalSheet({ visible, tripId, dayId, activity, isOwner, onClose, colors: colorsOverride }: JournalSheetProps) {
  const { colors: themeColors } = useTheme();
  const colors = colorsOverride ?? themeColors;
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { data: entry, isLoading } = useJournalEntry(tripId, dayId, activity.id, visible);
  const { pickJournalPhotos, saveJournal, uploading, saving } = useJournal();

  const [note, setNote] = useState('');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed from the loaded entry each time the sheet opens for this stop.
  useEffect(() => {
    if (visible && entry) {
      setNote(entry.note);
      setPhotoUrls(entry.photoUrls);
      setDirty(false);
      setError(null);
    } else if (visible && !isLoading && !entry) {
      setNote('');
      setPhotoUrls([]);
      setDirty(false);
      setError(null);
    }
  }, [visible, entry, isLoading]);

  const handleAddPhotos = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setError(null);
    const { urls, error: pickError } = await pickJournalPhotos(uid, tripId, activity.id, photoUrls.length);
    if (pickError) { setError(pickError); return; }
    if (urls.length > 0) {
      setPhotoUrls((prev) => [...prev, ...urls]);
      setDirty(true);
    }
  }, [pickJournalPhotos, uid, tripId, activity.id, photoUrls.length]);

  const handleNoteChange = useCallback((text: string) => {
    setNote(text.slice(0, NOTE_MAX));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (saving) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    const saveError = await saveJournal(tripId, dayId, activity.id, { note, photoUrls });
    if (saveError) { setError(saveError); return; }
    setDirty(false);
  }, [saving, saveJournal, tripId, dayId, activity.id, note, photoUrls]);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const { Icon: TypeIcon, color: accentColor } = ACTIVITY_ICONS[activity.type];
  const hasContent = photoUrls.length > 0 || !!note;

  const sheetContent = (
    <View style={[styles.content, { paddingBottom: Spacing['6'] }]}>
      <View style={styles.handle} />

      {/* Header — "YOUR VISIT" is the whole point of the distinction from
          PlaceDetailSheet's Google-sourced "ABOUT THIS PLACE". */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.brand.purple }]}>
            {isOwner ? 'YOUR VISIT' : 'VISIT NOTES'}
          </Text>
          <Text style={[styles.title, { color: colors.text.primary }]} numberOfLines={1}>
            {activity.title}
          </Text>
        </View>
        <TouchableOpacity onPress={handleClose} hitSlop={12} accessibilityLabel="Close">
          <X size={20} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.photoRow}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} width={PHOTO_SIZE} height={PHOTO_SIZE} radius={BorderRadius.lg} />
          ))}
        </View>
      ) : (
        <>
          {/* Photo rail */}
          {(photoUrls.length > 0 || isOwner) && (
            <FlashList
              horizontal
              style={styles.photoList}
              data={isOwner && photoUrls.length < MAX_JOURNAL_PHOTOS ? [...photoUrls, '__add__'] : photoUrls}
              keyExtractor={(item, i) => (item === '__add__' ? 'add' : `${item}-${i}`)}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.photoRow}
              renderItem={({ item }) =>
                item === '__add__' ? (
                  <TouchableOpacity
                    onPress={handleAddPhotos}
                    disabled={uploading}
                    style={[styles.addTile, { borderColor: colors.background.cardBorder }]}
                    accessibilityLabel="Add photos"
                  >
                    {uploading ? (
                      <ActivityIndicator size="small" color={colors.brand.purple} />
                    ) : (
                      <>
                        <Plus size={20} color={colors.text.tertiary} weight="bold" />
                        <Text style={[styles.addTileText, { color: colors.text.tertiary }]}>Add</Text>
                      </>
                    )}
                  </TouchableOpacity>
                ) : (
                  <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" />
                )
              }
            />
          )}

          {/* Note */}
          {isOwner ? (
            <View style={styles.noteField}>
              <TextInput
                value={note}
                onChangeText={handleNoteChange}
                placeholder="What was this stop like?"
                placeholderTextColor={colors.text.tertiary}
                multiline
                maxLength={NOTE_MAX}
                style={[
                  styles.noteInput,
                  { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
                ]}
              />
              <Text style={[styles.charCount, { color: colors.text.tertiary }]}>{note.length}/{NOTE_MAX}</Text>
            </View>
          ) : note ? (
            <Text style={[styles.noteReadOnly, { color: colors.text.secondary }]}>{note}</Text>
          ) : null}

          {!hasContent && !isOwner && (
            <View style={styles.emptyRow}>
              <Notebook size={18} color={colors.text.disabled} weight="duotone" />
              <Text style={[styles.emptyText, { color: colors.text.tertiary }]}>No journal entry yet.</Text>
            </View>
          )}

          {error ? (
            <Text style={[styles.errorText, { color: colors.semantic.error }]}>{error}</Text>
          ) : null}

          {isOwner && (
            <TouchableOpacity
              onPress={handleSave}
              disabled={!dirty || saving}
              activeOpacity={0.85}
              style={[
                styles.saveBtn,
                { backgroundColor: dirty ? accentColor : colors.background.sunken },
              ]}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={[styles.saveBtnText, { color: dirty ? '#ffffff' : colors.text.disabled }]}>
                  {dirty ? 'Save' : 'Saved'}
                </Text>
              )}
            </TouchableOpacity>
          )}

          <View style={styles.typeRow}>
            <TypeIcon size={13} color={colors.text.tertiary} weight="duotone" />
            <Text style={[styles.typeText, { color: colors.text.tertiary }]}>Personal — visible to you only until this trip is shared</Text>
          </View>
        </>
      )}
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={styles.sheetWrap}>
          {Platform.OS === 'ios' ? (
            <BlurView intensity={90} tint="dark" style={styles.fill}>
              {sheetContent}
            </BlurView>
          ) : (
            <View style={[styles.fill, styles.androidBg]}>{sheetContent}</View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheetWrap: {
    // A resolved `height`, not `maxHeight` — with a BlurView wrapping a
    // FlashList descendant, Yoga can't complete an auto-measured
    // (maxHeight-only, no explicit height) layout pass on this node; it
    // never resolves a size and the whole sheet renders blank. See
    // SHEET_HEIGHT above.
    height: SHEET_HEIGHT,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    overflow: 'hidden',
  },
  fill: { flex: 1 },
  androidBg: { backgroundColor: 'rgba(10,10,26,0.97)' },

  content: { padding: Spacing['5'], gap: Spacing['3'] },
  // Horizontal FlashList needs an explicit height on `style` (not just
  // `contentContainerStyle`) to self-measure — without it, it can't report
  // a size, which stalls layout for this whole auto-height sheet and the
  // Modal renders as an empty backdrop with no visible content at all.
  photoList: { height: PHOTO_SIZE },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing['1'],
  },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing['3'] },
  headerText: { flex: 1 },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    letterSpacing: 0.08 * FontSize.xs,
    marginBottom: 2,
  },
  title: { fontSize: FontSize.lg, fontWeight: FontWeight.bold },

  photoRow: { gap: Spacing['2'], paddingVertical: Spacing['1'] },
  photo: { width: PHOTO_SIZE, height: PHOTO_SIZE, borderRadius: BorderRadius.lg, marginRight: Spacing['2'] },
  addTile: {
    width: PHOTO_SIZE,
    height: PHOTO_SIZE,
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  addTileText: { fontSize: FontSize.xs, fontWeight: FontWeight.medium },

  noteField: { gap: Spacing['1'] },
  noteInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.sm,
    minHeight: 72,
    textAlignVertical: 'top',
  },
  charCount: { fontSize: FontSize.xs, textAlign: 'right' },
  noteReadOnly: { fontSize: FontSize.sm, lineHeight: FontSize.sm * 1.5 },

  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], paddingVertical: Spacing['2'] },
  emptyText: { fontSize: FontSize.sm },

  errorText: { fontSize: FontSize.xs },

  saveBtn: {
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing['3'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: { fontSize: FontSize.base, fontWeight: FontWeight.bold },

  typeRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['1'], marginTop: Spacing['1'] },
  typeText: { fontSize: 10, flexShrink: 1 },
});
