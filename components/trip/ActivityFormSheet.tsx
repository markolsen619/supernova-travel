import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Pressable,
  Animated,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import { TrashSimple } from 'phosphor-react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { ACTIVITY_ICONS } from '@/constants/icons';
import { TypeIconBubble } from '@/components/ui/TypeIconBubble';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { ActivityType, TripActivity, TripDay } from '@/types';

const ACTIVITY_TYPE_OPTIONS: ActivityType[] = [
  'flight', 'hotel', 'restaurant', 'activity', 'transport', 'free',
];

export interface ActivityFormData {
  type: ActivityType;
  title: string;
  startTime: string | null;
  endTime: string | null;
  notes: string;
}

interface ActivityFormSheetProps {
  visible: boolean;
  mode: 'add' | 'edit';
  /** Required in edit mode — pre-fills the form. */
  activity?: TripActivity | null;
  /** Required in edit mode — lets the user move this activity to another day. */
  days?: TripDay[];
  currentDayId?: string;
  onClose: () => void;
  onSubmit: (data: ActivityFormData) => Promise<void>;
  /** Edit mode only. */
  onDelete?: () => Promise<void>;
  /** Edit mode only. */
  onMoveToDay?: (targetDayId: string) => Promise<void>;
}

export function ActivityFormSheet({
  visible,
  mode,
  activity,
  days,
  currentDayId,
  onClose,
  onSubmit,
  onDelete,
  onMoveToDay,
}: ActivityFormSheetProps) {
  const { colors } = useTheme();
  const slideAnim = React.useRef(new Animated.Value(0)).current;

  const [type, setType] = useState<ActivityType>('activity');
  const [title, setTitle] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [movingToDayId, setMovingToDayId] = useState<string | null>(null);

  // Re-seed the form whenever a new activity is opened for editing (or the
  // sheet resets to add-mode defaults).
  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && activity) {
      setType(activity.type);
      setTitle(activity.title);
      setStartTime(activity.startTime ?? '');
      setEndTime(activity.endTime ?? '');
      setNotes(activity.notes ?? '');
    } else {
      setType('activity');
      setTitle('');
      setStartTime('');
      setEndTime('');
      setNotes('');
    }
  }, [visible, mode, activity]);

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        ...SPRING,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slideAnim]);

  const handleSubmit = useCallback(async () => {
    if (!title.trim() || submitting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSubmitting(true);
    try {
      await onSubmit({
        type,
        title: title.trim(),
        startTime: startTime.trim() || null,
        endTime: endTime.trim() || null,
        notes: notes.trim(),
      });
      onClose();
    } finally {
      setSubmitting(false);
    }
  }, [type, title, startTime, endTime, notes, submitting, onSubmit, onClose]);

  const handleDelete = useCallback(() => {
    if (!onDelete || deleting) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete activity',
      `Remove "${activity?.title ?? 'this activity'}" from the trip?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await onDelete();
              onClose();
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  }, [onDelete, deleting, activity, onClose]);

  const handleMoveToDay = useCallback(
    async (targetDayId: string) => {
      if (!onMoveToDay || targetDayId === currentDayId || movingToDayId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setMovingToDayId(targetDayId);
      try {
        await onMoveToDay(targetDayId);
        onClose();
      } finally {
        setMovingToDayId(null);
      }
    },
    [onMoveToDay, currentDayId, movingToDayId, onClose],
  );

  const handleSelectType = useCallback((actType: ActivityType) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setType(actType);
  }, []);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [400, 0] });
  const busy = submitting || deleting || movingToDayId !== null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.sheetOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.sheetBackdrop} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheetContainer,
            { backgroundColor: colors.background.elevated, transform: [{ translateY }] },
          ]}
        >
          <View style={[styles.sheetHandle, { backgroundColor: colors.background.cardBorder }]} />

          <View style={styles.titleRow}>
            <Text style={[styles.sheetTitle, { color: colors.text.primary }]}>
              {mode === 'edit' ? 'Edit activity' : 'Add activity'}
            </Text>
            {mode === 'edit' && onDelete ? (
              <TouchableOpacity onPress={handleDelete} disabled={busy} hitSlop={8} accessibilityLabel="Delete activity">
                {deleting ? (
                  <ActivityIndicator size="small" color={colors.semantic.error} />
                ) : (
                  <TrashSimple size={20} color={colors.semantic.error} weight="bold" />
                )}
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Type selector */}
          <View style={styles.typeRow}>
            {ACTIVITY_TYPE_OPTIONS.map((actType) => {
              const { Icon, color } = ACTIVITY_ICONS[actType];
              return (
                <TouchableOpacity
                  key={actType}
                  onPress={() => handleSelectType(actType)}
                  disabled={busy}
                  style={[
                    styles.typeBtn,
                    {
                      backgroundColor:
                        type === actType ? colors.brand.purple + '33' : colors.background.card,
                      borderColor:
                        type === actType ? colors.brand.purple : colors.background.cardBorder,
                    },
                  ]}
                  accessibilityLabel={`${actType} type`}
                >
                  <TypeIconBubble Icon={Icon} color={color} bubbleSize={28} iconSize={16} />
                </TouchableOpacity>
              );
            })}
          </View>

          <TextInput
            style={[
              styles.sheetInput,
              { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
            ]}
            placeholder="Activity title *"
            placeholderTextColor={colors.text.tertiary}
            value={title}
            onChangeText={setTitle}
            editable={!busy}
            returnKeyType="next"
          />

          <View style={styles.timeRow}>
            <TextInput
              style={[
                styles.sheetInput,
                styles.timeInput,
                { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
              ]}
              placeholder="Start (14:30)"
              placeholderTextColor={colors.text.tertiary}
              value={startTime}
              onChangeText={setStartTime}
              editable={!busy}
              keyboardType="numbers-and-punctuation"
            />
            <TextInput
              style={[
                styles.sheetInput,
                styles.timeInput,
                { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
              ]}
              placeholder="End (16:00)"
              placeholderTextColor={colors.text.tertiary}
              value={endTime}
              onChangeText={setEndTime}
              editable={!busy}
              keyboardType="numbers-and-punctuation"
            />
          </View>

          <TextInput
            style={[
              styles.sheetInput,
              styles.sheetNotesInput,
              { color: colors.text.primary, backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
            ]}
            placeholder="Notes (optional)"
            placeholderTextColor={colors.text.tertiary}
            value={notes}
            onChangeText={setNotes}
            editable={!busy}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />

          {/* Move to day — edit mode only, needs 2+ days to be meaningful */}
          {mode === 'edit' && onMoveToDay && days && days.length > 1 ? (
            <View style={styles.moveSection}>
              <Text style={[styles.moveLabel, { color: colors.text.secondary }]}>Move to day</Text>
              <View style={styles.moveRow}>
                {days.map((day) => {
                  const isCurrent = day.id === currentDayId;
                  return (
                    <TouchableOpacity
                      key={day.id}
                      onPress={() => handleMoveToDay(day.id)}
                      disabled={isCurrent || busy}
                      style={[
                        styles.dayChip,
                        {
                          backgroundColor: isCurrent ? colors.brand.purple + '33' : colors.background.card,
                          borderColor: isCurrent ? colors.brand.purple : colors.background.cardBorder,
                          opacity: isCurrent ? 1 : busy ? 0.5 : 1,
                        },
                      ]}
                    >
                      {movingToDayId === day.id ? (
                        <ActivityIndicator size="small" color={colors.brand.purple} />
                      ) : (
                        <Text
                          style={[
                            styles.dayChipText,
                            { color: isCurrent ? colors.brand.purple : colors.text.secondary },
                          ]}
                        >
                          Day {day.dayNumber}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ) : null}

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={!title.trim() || busy}
            style={[
              styles.sheetAddBtn,
              { backgroundColor: title.trim() && !busy ? colors.brand.purple : colors.background.cardBorder },
            ]}
            activeOpacity={0.8}
          >
            {submitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={[styles.sheetAddBtnText, { color: title.trim() ? '#fff' : colors.text.tertiary }]}>
                {mode === 'edit' ? 'Save changes' : 'Add activity'}
              </Text>
            )}
          </TouchableOpacity>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheetOverlay: { flex: 1, justifyContent: 'flex-end' },
  sheetBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
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
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
  },
  typeRow: { flexDirection: 'row', gap: Spacing['2'] },
  typeBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing['2'],
    alignItems: 'center',
  },
  sheetInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['3'],
    fontSize: FontSize.base,
  },
  timeRow: { flexDirection: 'row', gap: Spacing['3'] },
  timeInput: { flex: 1 },
  sheetNotesInput: {
    minHeight: 72,
    paddingTop: Spacing['3'],
  },
  moveSection: { gap: Spacing['2'] },
  moveLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  moveRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing['2'] },
  dayChip: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
    minWidth: 56,
    alignItems: 'center',
  },
  dayChipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
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
