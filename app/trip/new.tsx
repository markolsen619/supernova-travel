import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Modal,
  Dimensions,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import {
  CalendarBlank,
  MapPin,
  AirplaneTilt,
} from 'phosphor-react-native';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { TripVisibility } from '@/types';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { VISIBILITY_ICONS } from '@/constants/icons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const TOTAL_STEPS = 4;

// ─── Date Picker Modal ────────────────────────────────────────────────────────

interface DatePickerModalProps {
  visible: boolean;
  date: Date | null;
  title: string;
  onConfirm: (date: Date) => void;
  onCancel: () => void;
  minimumDate?: Date;
}

function DatePickerModal({ visible, date, title, onConfirm, onCancel, minimumDate }: DatePickerModalProps) {
  const now = date ?? new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1).padStart(2, '0'));
  const [day, setDay] = useState(String(now.getDate()).padStart(2, '0'));

  const handleConfirm = () => {
    const y = parseInt(year, 10);
    const m = parseInt(month, 10) - 1;
    const d = parseInt(day, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return;
    const parsed = new Date(y, m, d);
    if (isNaN(parsed.getTime())) return;
    if (minimumDate && parsed < minimumDate) return;
    onConfirm(parsed);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <View style={dp.overlay}>
        <View style={dp.sheet}>
          <Text style={dp.sheetTitle}>{title}</Text>
          <Text style={dp.hint}>Enter date (YYYY · MM · DD)</Text>
          <View style={dp.row}>
            <View style={dp.field}>
              <Text style={dp.fieldLabel}>Year</Text>
              <TextInput
                style={dp.fieldInput}
                value={year}
                onChangeText={setYear}
                keyboardType="number-pad"
                maxLength={4}
                placeholder="2025"
                placeholderTextColor={DarkColors.text.tertiary}
              />
            </View>
            <View style={dp.field}>
              <Text style={dp.fieldLabel}>Month</Text>
              <TextInput
                style={dp.fieldInput}
                value={month}
                onChangeText={setMonth}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="01"
                placeholderTextColor={DarkColors.text.tertiary}
              />
            </View>
            <View style={dp.field}>
              <Text style={dp.fieldLabel}>Day</Text>
              <TextInput
                style={dp.fieldInput}
                value={day}
                onChangeText={setDay}
                keyboardType="number-pad"
                maxLength={2}
                placeholder="01"
                placeholderTextColor={DarkColors.text.tertiary}
              />
            </View>
          </View>
          <View style={dp.actions}>
            <TouchableOpacity onPress={onCancel} style={dp.cancelBtn}>
              <Text style={dp.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleConfirm} style={dp.confirmBtn}>
              <LinearGradient
                colors={DarkColors.gradient.purplePink}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={dp.confirmGradient}
              >
                <Text style={dp.confirmText}>Set Date</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const dp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    backgroundColor: DarkColors.background.elevated,
    borderTopLeftRadius: BorderRadius['2xl'],
    borderTopRightRadius: BorderRadius['2xl'],
    padding: Spacing['6'],
    paddingBottom: Spacing['10'],
  },
  sheetTitle: {
    color: DarkColors.text.primary,
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    marginBottom: Spacing['2'],
  },
  hint: {
    color: DarkColors.text.tertiary,
    fontSize: FontSize.sm,
    marginBottom: Spacing['5'],
  },
  row: { flexDirection: 'row', gap: Spacing['3'] },
  field: { flex: 1 },
  fieldLabel: {
    color: DarkColors.text.secondary,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  fieldInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
    textAlign: 'center',
  },
  actions: { flexDirection: 'row', gap: Spacing['3'], marginTop: Spacing['6'] },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3'],
  },
  cancelText: { color: DarkColors.text.secondary, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  confirmBtn: { flex: 1 },
  confirmGradient: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3'],
  },
  confirmText: { color: DarkColors.white, fontSize: FontSize.base, fontWeight: FontWeight.bold },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(d: Date | null): string {
  if (!d) return 'Tap to set date';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function diffDays(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function visibilityLabel(v: TripVisibility): string {
  if (v === 'public') return 'Public';
  if (v === 'followers') return 'Followers';
  return 'Private';
}

// ─── Step components ──────────────────────────────────────────────────────────

interface Step1Props {
  destination: string;
  countryCode: string;
  setDestination: (v: string) => void;
  setCountryCode: (v: string) => void;
}

function Step1Destination({ destination, countryCode, setDestination, setCountryCode }: Step1Props) {
  return (
    <View style={step.container}>
      <Text style={step.stepLabel}>Step 1 of 4</Text>
      <Text style={step.title}>Where are you going?</Text>
      <Text style={step.subtitle}>Enter your destination to get started</Text>

      <View style={step.field}>
        <Text style={step.label}>Destination</Text>
        <TextInput
          style={step.input}
          value={destination}
          onChangeText={setDestination}
          placeholder="e.g. Tokyo, Japan"
          placeholderTextColor={DarkColors.text.tertiary}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="next"
        />
      </View>

      <View style={step.field}>
        <Text style={step.label}>Country Code (optional)</Text>
        <TextInput
          style={step.input}
          value={countryCode}
          onChangeText={(v) => setCountryCode(v.toUpperCase())}
          placeholder="e.g. JP"
          placeholderTextColor={DarkColors.text.tertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={2}
          returnKeyType="done"
        />
        <Text style={step.hint}>2-letter ISO country code</Text>
      </View>
    </View>
  );
}

interface Step2Props {
  startDate: Date | null;
  endDate: Date | null;
  setStartDate: (d: Date) => void;
  setEndDate: (d: Date) => void;
}

function Step2Dates({ startDate, endDate, setStartDate, setEndDate }: Step2Props) {
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  const days = diffDays(startDate, endDate);

  return (
    <View style={step.container}>
      <Text style={step.stepLabel}>Step 2 of 4</Text>
      <Text style={step.title}>When are you going?</Text>
      <Text style={step.subtitle}>Dates are optional — you can add them later</Text>

      <View style={step.field}>
        <Text style={step.label}>Start Date</Text>
        <TouchableOpacity style={step.dateButton} onPress={() => setShowStart(true)} activeOpacity={0.7}>
          <Text style={[step.dateText, !startDate && step.datePlaceholder]}>
            {formatDate(startDate)}
          </Text>
          <CalendarBlank size={20} color={DarkColors.text.tertiary} weight="regular" />
        </TouchableOpacity>
      </View>

      <View style={step.field}>
        <Text style={step.label}>End Date</Text>
        <TouchableOpacity style={step.dateButton} onPress={() => setShowEnd(true)} activeOpacity={0.7}>
          <Text style={[step.dateText, !endDate && step.datePlaceholder]}>
            {formatDate(endDate)}
          </Text>
          <CalendarBlank size={20} color={DarkColors.text.tertiary} weight="regular" />
        </TouchableOpacity>
      </View>

      {days !== null && days >= 0 && (
        <View style={step.durationBadge}>
          <LinearGradient
            colors={DarkColors.gradient.purplePink}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={step.durationGradient}
          >
            <Text style={step.durationText}>Trip duration: {days} day{days !== 1 ? 's' : ''}</Text>
          </LinearGradient>
        </View>
      )}

      {days !== null && days < 0 && (
        <Text style={step.warningText}>End date must be after start date</Text>
      )}

      <DatePickerModal
        visible={showStart}
        date={startDate}
        title="Select Start Date"
        onConfirm={(d) => { setStartDate(d); setShowStart(false); }}
        onCancel={() => setShowStart(false)}
      />
      <DatePickerModal
        visible={showEnd}
        date={endDate}
        title="Select End Date"
        onConfirm={(d) => { setEndDate(d); setShowEnd(false); }}
        onCancel={() => setShowEnd(false)}
        minimumDate={startDate ?? undefined}
      />
    </View>
  );
}

interface Step3Props {
  title: string;
  description: string;
  visibility: TripVisibility;
  tagsInput: string;
  setTitle: (v: string) => void;
  setDescription: (v: string) => void;
  setVisibility: (v: TripVisibility) => void;
  setTagsInput: (v: string) => void;
}

function Step3Details({ title, description, visibility, tagsInput, setTitle, setDescription, setVisibility, setTagsInput }: Step3Props) {
  const visibilities: TripVisibility[] = ['public', 'followers', 'private'];

  return (
    <View style={step.container}>
      <Text style={step.stepLabel}>Step 3 of 4</Text>
      <Text style={step.title}>Tell us about the trip</Text>
      <Text style={step.subtitle}>Add details to help others discover your journey</Text>

      <View style={step.field}>
        <Text style={step.label}>Trip Title</Text>
        <TextInput
          style={step.input}
          value={title}
          onChangeText={setTitle}
          placeholder="Give your trip a name"
          placeholderTextColor={DarkColors.text.tertiary}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </View>

      <View style={step.field}>
        <Text style={step.label}>Description (optional)</Text>
        <TextInput
          style={[step.input, step.textarea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Share what you're planning..."
          placeholderTextColor={DarkColors.text.tertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={step.field}>
        <Text style={step.label}>Visibility</Text>
        <View style={step.visibilityRow}>
          {visibilities.map((v) => (
            <TouchableOpacity
              key={v}
              onPress={() => setVisibility(v)}
              style={[step.visibilityBtn, visibility === v && step.visibilityBtnActive]}
              activeOpacity={0.7}
            >
              {(() => {
                const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[v];
                return <VIcon size={18} color={visibility === v ? vColor : DarkColors.text.tertiary} weight={visibility === v ? 'duotone' : 'regular'} />;
              })()}
              <Text style={[step.visibilityLabel, visibility === v && step.visibilityLabelActive]}>
                {visibilityLabel(v)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={step.field}>
        <Text style={step.label}>Tags (optional)</Text>
        <TextInput
          style={step.input}
          value={tagsInput}
          onChangeText={setTagsInput}
          placeholder="adventure, food, culture"
          placeholderTextColor={DarkColors.text.tertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Text style={step.hint}>Comma-separated tags</Text>
      </View>
    </View>
  );
}

interface Step4Props {
  destination: string;
  countryCode: string;
  startDate: Date | null;
  endDate: Date | null;
  title: string;
  visibility: TripVisibility;
  creating: boolean;
  error: string;
  onCreateTrip: () => void;
}

function Step4Review({ destination, countryCode, startDate, endDate, title, visibility, creating, error, onCreateTrip }: Step4Props) {
  const days = diffDays(startDate, endDate);

  return (
    <View style={step.container}>
      <Text style={step.stepLabel}>Step 4 of 4</Text>
      <Text style={step.title}>Ready to go?</Text>
      <Text style={step.subtitle}>Review your trip before creating it</Text>

      <View style={review.card}>
        <LinearGradient
          colors={DarkColors.gradient.card}
          style={review.cardGradient}
        >
          <View style={review.row}>
            <MapPin size={20} color="#34d399" weight="duotone" />
            <View style={review.rowContent}>
              <Text style={review.rowLabel}>Destination</Text>
              <Text style={review.rowValue}>
                {destination}{countryCode ? ` · ${countryCode}` : ''}
              </Text>
            </View>
          </View>

          <View style={review.divider} />

          <View style={review.row}>
            <CalendarBlank size={20} color="#60a5fa" weight="duotone" />
            <View style={review.rowContent}>
              <Text style={review.rowLabel}>Dates</Text>
              <Text style={review.rowValue}>
                {startDate || endDate
                  ? `${formatDate(startDate)} → ${formatDate(endDate)}`
                  : 'Not set'}
              </Text>
              {days !== null && days >= 0 && (
                <Text style={review.rowMeta}>{days} day{days !== 1 ? 's' : ''}</Text>
              )}
            </View>
          </View>

          <View style={review.divider} />

          <View style={review.row}>
            <AirplaneTilt size={20} color="#a78bfa" weight="duotone" />
            <View style={review.rowContent}>
              <Text style={review.rowLabel}>Title</Text>
              <Text style={review.rowValue}>{title}</Text>
            </View>
          </View>

          <View style={review.divider} />

          <View style={review.row}>
            {(() => {
              const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[visibility];
              return <VIcon size={20} color={vColor} weight="duotone" />;
            })()}
            <View style={review.rowContent}>
              <Text style={review.rowLabel}>Visibility</Text>
              <Text style={review.rowValue}>{visibilityLabel(visibility)}</Text>
            </View>
          </View>
        </LinearGradient>
      </View>

      {error ? (
        <View style={review.errorBox}>
          <Text style={review.errorText}>{error}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={onCreateTrip}
        disabled={creating}
        activeOpacity={0.8}
        style={review.createBtn}
      >
        <LinearGradient
          colors={DarkColors.gradient.purplePink}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[review.createGradient, creating && review.createDisabled]}
        >
          {creating ? (
            <ActivityIndicator color={DarkColors.white} size="small" />
          ) : (
            <Text style={review.createText}>Create Trip</Text>
          )}
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
}

const step = StyleSheet.create({
  container: { flex: 1, paddingTop: Spacing['2'] },
  stepLabel: {
    fontSize: FontSize.sm,
    color: DarkColors.brand.purple,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing['3'],
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
    marginBottom: Spacing['2'],
  },
  subtitle: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
    marginBottom: Spacing['8'],
    lineHeight: FontSize.base * 1.5,
  },
  field: { marginBottom: Spacing['5'] },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: DarkColors.text.secondary,
    marginBottom: Spacing['2'],
  },
  hint: {
    fontSize: FontSize.xs,
    color: DarkColors.text.tertiary,
    marginTop: Spacing['1'],
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
  },
  textarea: {
    minHeight: 100,
    paddingTop: Spacing['3'],
  },
  dateButton: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dateText: {
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
  },
  datePlaceholder: {
    color: DarkColors.text.tertiary,
  },
  durationBadge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
    marginTop: Spacing['3'],
  },
  durationGradient: {
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['4'],
  },
  durationText: {
    color: DarkColors.white,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  warningText: {
    color: DarkColors.semantic.error,
    fontSize: FontSize.sm,
    marginTop: Spacing['2'],
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  visibilityBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    alignItems: 'center',
    gap: Spacing['1'],
  },
  visibilityBtnActive: {
    borderColor: DarkColors.brand.purple,
    backgroundColor: 'rgba(167,139,250,0.15)',
  },
  visibilityLabel: {
    fontSize: FontSize.xs,
    color: DarkColors.text.secondary,
    fontWeight: FontWeight.medium,
  },
  visibilityLabelActive: {
    color: DarkColors.brand.purple,
  },
});

const review = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: DarkColors.background.cardBorder,
    marginBottom: Spacing['6'],
  },
  cardGradient: { padding: Spacing['5'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'] },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: FontSize.xs,
    color: DarkColors.text.tertiary,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: FontSize.base,
    color: DarkColors.text.primary,
    fontWeight: FontWeight.medium,
  },
  rowMeta: {
    fontSize: FontSize.sm,
    color: DarkColors.brand.purple,
    marginTop: 2,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical: Spacing['4'],
  },
  errorBox: {
    backgroundColor: 'rgba(248,113,113,0.1)',
    borderRadius: BorderRadius.md,
    padding: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  errorText: {
    color: DarkColors.semantic.error,
    fontSize: FontSize.sm,
  },
  createBtn: { width: '100%' },
  createGradient: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4'],
  },
  createDisabled: { opacity: 0.6 },
  createText: {
    color: DarkColors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
});

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewTripScreen() {
  const { createTrip } = useCreateTrip();

  // Step state
  const [step, setStep] = useState(0);

  // Step 1
  const [destination, setDestination] = useState('');
  const [countryCode, setCountryCode] = useState('');

  // Step 2
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);

  // Step 3
  const [title, setTitle] = useState('');
  const [titleAutoFilled, setTitleAutoFilled] = useState(true);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<TripVisibility>('public');
  const [tagsInput, setTagsInput] = useState('');

  // Step 4
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Animation
  const translateX = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const goToStep = useCallback((nextStep: number, forward: boolean) => {
    const direction = forward ? -SCREEN_WIDTH : SCREEN_WIDTH;

    // Slide current off
    translateX.value = withSpring(direction, { damping: 20, stiffness: 200 }, () => {
      runOnJS(setStep)(nextStep);
      // Jump to opposite side, then spring back to center
      translateX.value = -direction;
      translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
    });
  }, [translateX]);

  const canAdvance = () => {
    if (step === 0) return destination.trim().length > 0;
    if (step === 2) return title.trim().length > 0;
    return true;
  };

  const handleSetTitle = useCallback((v: string) => {
    setTitleAutoFilled(false);
    setTitle(v);
  }, []);

  const handleNext = () => {
    if (!canAdvance()) return;
    if (step === 1 && titleAutoFilled) {
      setTitle(`Trip to ${destination.trim()}`);
    }
    goToStep(step + 1, true);
  };

  const handleBack = () => {
    if (step === 0) {
      router.back();
    } else {
      goToStep(step - 1, false);
    }
  };

  const handleCreateTrip = async () => {
    setCreating(true);
    setCreateError('');
    try {
      const tags = tagsInput
        .split(',')
        .map((t) => t.trim())
        .filter((t) => t.length > 0);

      const newId = await createTrip({
        title: title.trim(),
        description: description.trim(),
        destination: {
          name: destination.trim(),
          placeId: null,
          lat: null,
          lng: null,
          countryCode: countryCode.trim() || null,
        },
        startDate,
        endDate,
        visibility,
        tags,
        coverImageUrl: null,
        isAiGenerated: false,
      });
      router.replace(`/trip/${newId}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to create trip. Please try again.';
      setCreateError(message);
    } finally {
      setCreating(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0:
        return (
          <Step1Destination
            destination={destination}
            countryCode={countryCode}
            setDestination={setDestination}
            setCountryCode={setCountryCode}
          />
        );
      case 1:
        return (
          <Step2Dates
            startDate={startDate}
            endDate={endDate}
            setStartDate={setStartDate}
            setEndDate={setEndDate}
          />
        );
      case 2:
        return (
          <Step3Details
            title={title}
            description={description}
            visibility={visibility}
            tagsInput={tagsInput}
            setTitle={handleSetTitle}
            setDescription={setDescription}
            setVisibility={setVisibility}
            setTagsInput={setTagsInput}
          />
        );
      case 3:
        return (
          <Step4Review
            destination={destination}
            countryCode={countryCode}
            startDate={startDate}
            endDate={endDate}
            title={title}
            visibility={visibility}
            creating={creating}
            error={createError}
            onCreateTrip={handleCreateTrip}
          />
        );
      default:
        return null;
    }
  };

  return (
    <View style={styles.screen}>
      {/* Background */}
      <LinearGradient
        colors={DarkColors.gradient.dark}
        style={StyleSheet.absoluteFill}
      />
      {/* Aurora accent */}
      <LinearGradient
        colors={['rgba(167,139,250,0.15)', 'rgba(244,114,182,0.08)', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.aurora}
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backText}>{step === 0 ? '✕' : '← Back'}</Text>
        </TouchableOpacity>

        {/* Step dots */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[styles.dot, i === step && styles.dotActive]}
            />
          ))}
        </View>

        {/* Spacer to balance the header */}
        <View style={styles.headerRight} />
      </View>

      {/* Animated content */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <Animated.View style={[styles.flex, animatedStyle]}>
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Footer: Next button (not on review step) */}
      {step < 3 && (
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={handleNext}
            disabled={!canAdvance()}
            activeOpacity={0.8}
            style={styles.nextBtnWrapper}
          >
            <LinearGradient
              colors={DarkColors.gradient.purplePink}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
            >
              <Text style={styles.nextText}>
                {step === 2 ? 'Review' : 'Next →'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: DarkColors.background.primary },
  flex: { flex: 1 },
  aurora: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 300,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['6'],
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: Spacing['4'],
  },
  backBtn: { minWidth: 70 },
  backText: {
    color: DarkColors.brand.purple,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  dotActive: {
    backgroundColor: DarkColors.brand.purple,
    width: 20,
    borderRadius: 10,
  },
  headerRight: { minWidth: 70 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['10'],
  },
  footer: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing['6'],
    paddingTop: Spacing['4'],
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  nextBtnWrapper: { width: '100%' },
  nextBtn: {
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['4'],
  },
  nextBtnDisabled: { opacity: 0.4 },
  nextText: {
    color: DarkColors.white,
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    letterSpacing: 0.3,
  },
});
