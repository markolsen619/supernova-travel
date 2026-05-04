import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Timestamp } from 'firebase/firestore';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTrip } from '@/hooks/useTrip';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { DayTimeline } from '@/components/trip/DayTimeline';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { ActivityType, TripActivity, TripDay } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateRange(start: Timestamp | null, end: Timestamp | null): string {
  if (!start && !end) return 'Dates TBD';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start ? start.toDate().toLocaleDateString('en-US', opts) : '?';
  const endStr = end ? end.toDate().toLocaleDateString('en-US', opts) : '?';
  if (startStr === endStr) return startStr;
  return `${startStr} – ${endStr}`;
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
};

const STATUS_COLOR: Record<string, string> = {
  planning: '#fbbf24',
  active: '#34d399',
  completed: '#60a5fa',
};

const VISIBILITY_ICON: Record<string, string> = {
  public: '🌍',
  followers: '👥',
  private: '🔒',
};

const TYPE_OPTIONS: { type: ActivityType; emoji: string }[] = [
  { type: 'flight', emoji: '✈️' },
  { type: 'hotel', emoji: '🏨' },
  { type: 'restaurant', emoji: '🍽️' },
  { type: 'activity', emoji: '🎯' },
  { type: 'transport', emoji: '🚌' },
  { type: 'free', emoji: '⬜' },
];

// ─── Add Activity Sheet ──────────────────────────────────────────────────────

interface AddActivitySheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: {
    type: ActivityType;
    title: string;
    startTime: string | null;
    notes: string;
  }) => Promise<void>;
}

function AddActivitySheet({ visible, onClose, onSubmit }: AddActivitySheetProps) {
  const { colors } = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [type, setType] = useState<ActivityType>('activity');
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  React.useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  function reset() {
    setType('activity');
    setTitle('');
    setStartTime('');
    setNotes('');
  }

  async function handleAdd() {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        startTime: startTime.trim() || null,
        notes: notes.trim(),
      });
      reset();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  function handleClose() {
    reset();
    onClose();
  }

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [400, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.sheetBackdrop} onPress={handleClose} />
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              backgroundColor: colors.background.elevated,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Handle */}
          <View style={[styles.sheetHandle, { backgroundColor: colors.background.cardBorder }]} />

          <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>Add Activity</Text>

          {/* Type selector */}
          <View style={styles.typeRow}>
            {TYPE_OPTIONS.map((opt) => (
              <TouchableOpacity
                key={opt.type}
                onPress={() => setType(opt.type)}
                style={[
                  styles.typeBtn,
                  {
                    backgroundColor:
                      type === opt.type
                        ? colors.brand.purple + '33'
                        : colors.background.card,
                    borderColor:
                      type === opt.type
                        ? colors.brand.purple
                        : colors.background.cardBorder,
                  },
                ]}
              >
                <Text style={styles.typeBtnEmoji}>{opt.emoji}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Title */}
          <TextInput
            style={[
              styles.sheetInput,
              {
                color: colors.text.primary,
                backgroundColor: colors.background.card,
                borderColor: colors.background.cardBorder,
              },
            ]}
            placeholder="Activity title *"
            placeholderTextColor={colors.text.tertiary}
            value={title}
            onChangeText={setTitle}
            autoFocus
            returnKeyType="next"
          />

          {/* Start time */}
          <TextInput
            style={[
              styles.sheetInput,
              {
                color: colors.text.primary,
                backgroundColor: colors.background.card,
                borderColor: colors.background.cardBorder,
              },
            ]}
            placeholder="Start time (e.g. 14:30)"
            placeholderTextColor={colors.text.tertiary}
            value={startTime}
            onChangeText={setStartTime}
            keyboardType="numbers-and-punctuation"
          />

          {/* Notes */}
          <TextInput
            style={[
              styles.sheetInput,
              styles.sheetNotesInput,
              {
                color: colors.text.primary,
                backgroundColor: colors.background.card,
                borderColor: colors.background.cardBorder,
              },
            ]}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.text.tertiary}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Add button */}
          <TouchableOpacity
            onPress={handleAdd}
            disabled={!title.trim() || submitting}
            style={[
              styles.sheetAddBtn,
              {
                backgroundColor:
                  title.trim() && !submitting
                    ? colors.brand.purple
                    : colors.background.cardBorder,
              },
            ]}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text
                style={[
                  styles.sheetAddBtnText,
                  { color: title.trim() ? '#fff' : colors.text.tertiary },
                ]}
              >
                Add Activity
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const currentUserUid = useAuthStore((s) => s.user?.uid ?? null);

  const { data: trip, isLoading } = useTrip(id ?? null);
  const { addDay, addActivity } = useCreateTrip();

  // Collapsible description state
  const [descExpanded, setDescExpanded] = useState(false);

  // Add-activity sheet state
  const [sheetVisible, setSheetVisible] = useState(false);
  const [activeDay, setActiveDay] = useState<TripDay | null>(null);

  const isOwner = !!trip && !!currentUserUid && trip.authorUid === currentUserUid;

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddActivity = useCallback((day: TripDay) => {
    setActiveDay(day);
    setSheetVisible(true);
  }, []);

  const handleCloseSheet = useCallback(() => {
    setSheetVisible(false);
    setActiveDay(null);
  }, []);

  const handleSubmitActivity = useCallback(
    async (data: {
      type: ActivityType;
      title: string;
      startTime: string | null;
      notes: string;
    }) => {
      if (!id || !activeDay) return;
      await addActivity(id, activeDay.id, {
        type: data.type,
        title: data.title,
        startTime: data.startTime,
        notes: data.notes,
        placeId: null,
        address: null,
        lat: null,
        lng: null,
        endTime: null,
        durationMinutes: null,
        bookingRef: null,
        cost: null,
        currency: null,
        mediaUrls: [],
        createdAt: Timestamp.now(),
      });
    },
    [id, activeDay, addActivity],
  );

  const handleAddDay = useCallback(async () => {
    if (!id || !trip) return;
    const nextDayNumber = trip.days.length + 1;
    await addDay(id, {
      dayNumber: nextDayNumber,
      date: null,
      title: '',
      notes: '',
    });
  }, [id, trip, addDay]);

  // ── Loading / empty states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.centeredFull, { backgroundColor: colors.background.primary }]}>
        <ActivityIndicator size="large" color={colors.brand.purple} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.centeredFull, { backgroundColor: colors.background.primary }]}>
        <Text style={[styles.notFoundText, { color: colors.text.secondary }]}>
          Trip not found
        </Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backLinkBtn}>
          <Text style={[styles.backLinkText, { color: colors.brand.purple }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sortedDays = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const hasDescription = Boolean(trip.description?.trim());

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── 1. Header image area ── */}
        <View style={styles.headerImageContainer}>
          {trip.coverImageUrl ? (
            <Image
              source={{ uri: trip.coverImageUrl }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={colors.gradient.dark}
              style={StyleSheet.absoluteFill}
            />
          )}

          {/* Gradient overlay for title legibility */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.75)']}
            style={styles.headerOverlay}
          />

          {/* Back button */}
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.headerBackBtn, { top: insets.top + Spacing['2'] }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <View style={styles.headerBtnCircle}>
              <Text style={styles.headerBtnIcon}>←</Text>
            </View>
          </TouchableOpacity>

          {/* Edit button — owner only */}
          {isOwner && (
            <TouchableOpacity
              style={[styles.headerEditBtn, { top: insets.top + Spacing['2'] }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <View style={styles.headerBtnCircle}>
                <Text style={styles.headerBtnIcon}>✏️</Text>
              </View>
            </TouchableOpacity>
          )}

          {/* Trip title overlay */}
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTripTitle} numberOfLines={2}>
              {trip.title}
            </Text>
          </View>
        </View>

        {/* ── 2. Meta strip ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.metaStrip, { borderBottomColor: colors.background.cardBorder }]}
          contentContainerStyle={styles.metaStripContent}
        >
          {/* Destination */}
          <View style={[styles.metaChip, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.metaChipText, { color: colors.text.primary }]}>
              📍 {trip.destination.name}
            </Text>
          </View>

          {/* Date range */}
          <View style={[styles.metaChip, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.metaChipText, { color: colors.text.primary }]}>
              🗓 {formatDateRange(trip.startDate, trip.endDate)}
            </Text>
          </View>

          {/* Status pill */}
          <View
            style={[
              styles.metaChip,
              { backgroundColor: (STATUS_COLOR[trip.status] ?? '#6b7280') + '26' },
            ]}
          >
            <Text
              style={[
                styles.metaChipText,
                { color: STATUS_COLOR[trip.status] ?? colors.text.secondary },
              ]}
            >
              {STATUS_LABEL[trip.status] ?? trip.status}
            </Text>
          </View>

          {/* Visibility */}
          <View style={[styles.metaChip, { backgroundColor: colors.background.card }]}>
            <Text style={[styles.metaChipText, { color: colors.text.primary }]}>
              {VISIBILITY_ICON[trip.visibility] ?? '🌍'}
            </Text>
          </View>
        </ScrollView>

        {/* ── 3. Description ── */}
        {hasDescription && (
          <View style={styles.descriptionContainer}>
            <Text
              style={[styles.descriptionText, { color: colors.text.secondary }]}
              numberOfLines={descExpanded ? undefined : 3}
            >
              {trip.description}
            </Text>
            <TouchableOpacity
              onPress={() => setDescExpanded((v) => !v)}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <Text style={[styles.readMoreText, { color: colors.brand.purple }]}>
                {descExpanded ? 'Show less' : 'Read more'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 4. Day timeline ── */}
        <View style={styles.daysSection}>
          {sortedDays.length === 0 ? (
            isOwner ? (
              /* No days — owner prompt */
              <View
                style={[
                  styles.emptyDaysCard,
                  {
                    backgroundColor: colors.background.card,
                    borderColor: colors.background.cardBorder,
                  },
                ]}
              >
                <Text style={[styles.emptyDaysEmoji]}>🗺️</Text>
                <Text style={[styles.emptyDaysTitle, { color: colors.text.primary }]}>
                  Start building your itinerary
                </Text>
                <Text style={[styles.emptyDaysSub, { color: colors.text.tertiary }]}>
                  Add your first day to get started
                </Text>
                <TouchableOpacity
                  onPress={handleAddDay}
                  style={[styles.addFirstDayBtn, { backgroundColor: colors.brand.purple }]}
                  activeOpacity={0.8}
                >
                  <Text style={styles.addFirstDayBtnText}>Add your first day</Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* No days — viewer */
              <View style={styles.emptyViewerContainer}>
                <Text style={[styles.emptyViewerText, { color: colors.text.tertiary }]}>
                  No itinerary yet
                </Text>
              </View>
            )
          ) : (
            <>
              {sortedDays.map((day) => (
                <View
                  key={day.id}
                  style={[
                    styles.dayCard,
                    {
                      backgroundColor: colors.background.card,
                      borderColor: colors.background.cardBorder,
                    },
                  ]}
                >
                  <DayTimeline
                    day={day}
                    editable={isOwner}
                    onAddActivity={isOwner ? () => handleAddActivity(day) : undefined}
                  />
                </View>
              ))}

              {/* ── 5. Add Day button — owner only ── */}
              {isOwner && (
                <TouchableOpacity
                  onPress={handleAddDay}
                  style={[
                    styles.addDayBtn,
                    {
                      borderColor: colors.brand.purple + '66',
                      backgroundColor: colors.brand.purple + '14',
                    },
                  ]}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.addDayBtnText, { color: colors.brand.purple }]}>
                    + Add Day
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── Add Activity Sheet ── */}
      <AddActivitySheet
        visible={sheetVisible}
        onClose={handleCloseSheet}
        onSubmit={handleSubmitActivity}
      />
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const HEADER_IMAGE_HEIGHT = 280;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['4'],
  },
  notFoundText: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  backLinkBtn: {
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['4'],
  },
  backLinkText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['12'],
  },

  // ── Header Image ──
  headerImageContainer: {
    height: HEADER_IMAGE_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#1a0a3a',
  },
  headerOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  headerBackBtn: {
    position: 'absolute',
    left: Spacing['4'],
    zIndex: 10,
  },
  headerEditBtn: {
    position: 'absolute',
    right: Spacing['4'],
    zIndex: 10,
  },
  headerBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBtnIcon: {
    fontSize: 18,
    color: '#fff',
  },
  headerTitleContainer: {
    position: 'absolute',
    bottom: Spacing['5'],
    left: Spacing['4'],
    right: Spacing['4'],
  },
  headerTripTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.bold,
    color: '#fff',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Meta Strip ──
  metaStrip: {
    borderBottomWidth: 1,
  },
  metaStripContent: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
    gap: Spacing['2'],
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaChip: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1'],
  },
  metaChipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // ── Description ──
  descriptionContainer: {
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['4'],
    gap: Spacing['2'],
  },
  descriptionText: {
    fontSize: FontSize.base,
    lineHeight: 22,
  },
  readMoreText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },

  // ── Days Section ──
  daysSection: {
    padding: Spacing['4'],
    gap: Spacing['4'],
  },
  dayCard: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    padding: Spacing['4'],
  },

  // ── No Days — owner ──
  emptyDaysCard: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderStyle: 'dashed',
    padding: Spacing['8'],
    alignItems: 'center',
    gap: Spacing['2'],
  },
  emptyDaysEmoji: {
    fontSize: 40,
    marginBottom: Spacing['2'],
  },
  emptyDaysTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
  },
  emptyDaysSub: {
    fontSize: FontSize.sm,
    textAlign: 'center',
  },
  addFirstDayBtn: {
    marginTop: Spacing['4'],
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
  },
  addFirstDayBtnText: {
    color: '#fff',
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },

  // ── No Days — viewer ──
  emptyViewerContainer: {
    paddingVertical: Spacing['8'],
    alignItems: 'center',
  },
  emptyViewerText: {
    fontSize: FontSize.base,
  },

  // ── Add Day Button ──
  addDayBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  addDayBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },

  // ── Add Activity Sheet ──
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheetContainer: {
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    padding: Spacing['6'],
    paddingBottom: Spacing['8'],
    gap: Spacing['3'],
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing['2'],
  },
  sheetTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing['1'],
  },
  typeRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['2'],
    alignItems: 'center',
  },
  typeBtnEmoji: {
    fontSize: 20,
  },
  sheetInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  sheetNotesInput: {
    minHeight: 72,
    paddingTop: Spacing['3'],
  },
  sheetAddBtn: {
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
    marginTop: Spacing['2'],
  },
  sheetAddBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
});
