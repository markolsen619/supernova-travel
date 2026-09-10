import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Animated,
} from 'react-native';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import {
  CalendarBlank,
  MapPin,
  AirplaneTilt,
  MagnifyingGlass,
  X,
  ArrowLeft,
} from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useLayout } from '@/hooks/useLayout';
import { Button } from '@/components/ui/Button';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import { DestinationListEditor } from '@/components/trip/DestinationListEditor';
import { TripVisibility, Destination } from '@/types';
import type { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { VISIBILITY_ICONS } from '@/constants/icons';
import { DatePickerModal } from '@/components/ui/DatePickerModal';
import { SPRING } from '@/constants/motion';

const TOTAL_STEPS = 4;


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
  placeId: string | null;
  onPlaceSelect: (s: PlaceSelection) => void;
  onClearPlace: () => void;
  additionalDestinations: Destination[];
  onAdditionalDestinationsChange: (next: Destination[]) => void;
}

function Step1Destination({
  destination,
  countryCode,
  placeId,
  onPlaceSelect,
  onClearPlace,
  additionalDestinations,
  onAdditionalDestinationsChange,
}: Step1Props) {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleOpenPicker = useCallback(() => setPickerVisible(true), []);
  const handleClosePicker = useCallback(() => setPickerVisible(false), []);
  const handleSelect = useCallback(
    (s: PlaceSelection) => {
      onPlaceSelect(s);
      setPickerVisible(false);
    },
    [onPlaceSelect],
  );
  const handleClear = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClearPlace();
  }, [onClearPlace]);

  const isSelected = Boolean(placeId);

  return (
    <View style={step.container}>
      <Text style={[step.stepLabel, { color: colors.brand.purple }]}>Step 1 of 4</Text>
      <Text style={[step.title, { color: colors.text.primary }]}>Where are you going?</Text>
      <Text style={[step.subtitle, { color: colors.text.secondary }]}>Search for your destination to get started</Text>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>Destination</Text>

        {isSelected ? (
          <View style={[step.selectedRow, { backgroundColor: `${colors.brand.purple}14`, borderColor: colors.brand.purple }]}>
            <MapPin size={16} color={colors.brand.purple} weight="duotone" />
            <Text style={[step.selectedText, { color: colors.text.primary }]} numberOfLines={1}>{destination}</Text>
            <TouchableOpacity onPress={handleClear} activeOpacity={0.7} hitSlop={10} accessibilityLabel="Clear destination">
              <X size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[step.pickerBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            onPress={handleOpenPicker}
            activeOpacity={0.7}
          >
            <MagnifyingGlass size={16} color={colors.text.tertiary} weight="regular" />
            <Text style={[step.pickerBtnPlaceholder, { color: colors.text.tertiary }]}>Search for a destination…</Text>
          </TouchableOpacity>
        )}
      </View>

      {isSelected && countryCode ? (
        <View style={step.field}>
          <Text style={[step.label, { color: colors.text.secondary }]}>Country</Text>
          <Text style={[step.countryBadge, { color: colors.brand.purple, backgroundColor: `${colors.brand.purple}1F` }]}>{countryCode}</Text>
        </View>
      ) : null}

      {isSelected && (
        <View style={step.field}>
          <Text style={[step.label, { color: colors.text.secondary }]}>Additional destinations (optional)</Text>
          <DestinationListEditor
            destinations={additionalDestinations}
            onChange={onAdditionalDestinationsChange}
          />
        </View>
      )}

      <DestinationPicker
        visible={pickerVisible}
        onSelect={handleSelect}
        onClose={handleClosePicker}
      />
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
  const { colors } = useTheme();
  const [showStart, setShowStart] = useState(false);
  const [showEnd, setShowEnd] = useState(false);

  const days = diffDays(startDate, endDate);

  const handleOpenStart = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowStart(true);
  }, []);
  const handleOpenEnd = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowEnd(true);
  }, []);

  return (
    <View style={step.container}>
      <Text style={[step.stepLabel, { color: colors.brand.purple }]}>Step 2 of 4</Text>
      <Text style={[step.title, { color: colors.text.primary }]}>When are you going?</Text>
      <Text style={[step.subtitle, { color: colors.text.secondary }]}>Dates are optional — you can add them later</Text>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>Start date</Text>
        <TouchableOpacity
          style={[step.dateButton, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
          onPress={handleOpenStart}
          activeOpacity={0.7}
        >
          <Text style={[step.dateText, { color: startDate ? colors.text.primary : colors.text.tertiary }]}>
            {formatDate(startDate)}
          </Text>
          <CalendarBlank size={20} color={colors.text.tertiary} weight="regular" />
        </TouchableOpacity>
      </View>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>End date</Text>
        <TouchableOpacity
          style={[step.dateButton, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
          onPress={handleOpenEnd}
          activeOpacity={0.7}
        >
          <Text style={[step.dateText, { color: endDate ? colors.text.primary : colors.text.tertiary }]}>
            {formatDate(endDate)}
          </Text>
          <CalendarBlank size={20} color={colors.text.tertiary} weight="regular" />
        </TouchableOpacity>
      </View>

      {days !== null && days >= 0 && (
        <View style={[step.durationBadge, { backgroundColor: `${colors.brand.purple}1F` }]}>
          <Text style={[step.durationText, { color: colors.brand.purple }]}>Trip duration: {days} day{days !== 1 ? 's' : ''}</Text>
        </View>
      )}

      {days !== null && days < 0 && (
        <Text style={[step.warningText, { color: colors.semantic.error }]}>End date must be after start date</Text>
      )}

      <DatePickerModal
        visible={showStart}
        date={startDate}
        title="Select start date"
        onConfirm={(d) => { setStartDate(d); setShowStart(false); }}
        onCancel={() => setShowStart(false)}
      />
      <DatePickerModal
        visible={showEnd}
        date={endDate}
        title="Select end date"
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
  const { colors } = useTheme();
  const visibilities: TripVisibility[] = ['public', 'followers', 'private'];

  const handleSetVisibility = useCallback((v: TripVisibility) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setVisibility(v);
  }, [setVisibility]);

  return (
    <View style={step.container}>
      <Text style={[step.stepLabel, { color: colors.brand.purple }]}>Step 3 of 4</Text>
      <Text style={[step.title, { color: colors.text.primary }]}>Tell us about the trip</Text>
      <Text style={[step.subtitle, { color: colors.text.secondary }]}>Add details to help others discover your journey</Text>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>Trip title</Text>
        <TextInput
          style={[step.input, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={title}
          onChangeText={setTitle}
          placeholder="Give your trip a name"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
          returnKeyType="next"
        />
      </View>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>Description (optional)</Text>
        <TextInput
          style={[step.input, step.textarea, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={description}
          onChangeText={setDescription}
          placeholder="Share what you're planning..."
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </View>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>Visibility</Text>
        <View style={step.visibilityRow}>
          {visibilities.map((v) => {
            const active = visibility === v;
            const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[v];
            return (
              <TouchableOpacity
                key={v}
                onPress={() => handleSetVisibility(v)}
                style={[
                  step.visibilityBtn,
                  {
                    backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card,
                    borderColor: active ? colors.brand.purple : colors.background.cardBorder,
                  },
                ]}
                activeOpacity={0.7}
                accessibilityLabel={`${visibilityLabel(v)} visibility`}
              >
                <VIcon size={18} color={active ? vColor : colors.text.tertiary} weight={active ? 'duotone' : 'regular'} />
                <Text style={[step.visibilityLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                  {visibilityLabel(v)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={step.field}>
        <Text style={[step.label, { color: colors.text.secondary }]}>Tags (optional)</Text>
        <TextInput
          style={[step.input, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={tagsInput}
          onChangeText={setTagsInput}
          placeholder="adventure, food, culture"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Text style={[step.hint, { color: colors.text.tertiary }]}>Comma-separated tags</Text>
      </View>
    </View>
  );
}

interface Step4Props {
  destination: string;
  countryCode: string;
  additionalDestinations: Destination[];
  startDate: Date | null;
  endDate: Date | null;
  title: string;
  visibility: TripVisibility;
  creating: boolean;
  error: string;
  onCreateTrip: () => void;
}

function Step4Review({ destination, countryCode, additionalDestinations, startDate, endDate, title, visibility, creating, error, onCreateTrip }: Step4Props) {
  const { colors } = useTheme();
  const days = diffDays(startDate, endDate);
  const { Icon: VisibilityIcon, color: visibilityColor } = VISIBILITY_ICONS[visibility];

  return (
    <View style={step.container}>
      <Text style={[step.stepLabel, { color: colors.brand.purple }]}>Step 4 of 4</Text>
      <Text style={[step.title, { color: colors.text.primary }]}>Ready to go?</Text>
      <Text style={[step.subtitle, { color: colors.text.secondary }]}>Review your trip before creating it</Text>

      <View style={[review.card, { borderColor: colors.background.cardBorder }]}>
        <View style={[review.cardInner, { backgroundColor: colors.background.card }]}>
          <View style={review.row}>
            <MapPin size={20} color={colors.accent.teal} weight="duotone" />
            <View style={review.rowContent}>
              <Text style={[review.rowLabel, { color: colors.text.tertiary }]}>Destination</Text>
              <Text style={[review.rowValue, { color: colors.text.primary }]}>
                {[destination, ...additionalDestinations.map((d) => d.name)].join(', ')}
                {countryCode ? ` · ${countryCode}` : ''}
              </Text>
            </View>
          </View>

          <View style={[review.divider, { backgroundColor: colors.background.cardBorder }]} />

          <View style={review.row}>
            <CalendarBlank size={20} color={colors.brand.blue} weight="duotone" />
            <View style={review.rowContent}>
              <Text style={[review.rowLabel, { color: colors.text.tertiary }]}>Dates</Text>
              <Text style={[review.rowValue, { color: colors.text.primary }]}>
                {startDate || endDate
                  ? `${formatDate(startDate)} – ${formatDate(endDate)}`
                  : 'Not set'}
              </Text>
              {days !== null && days >= 0 && (
                <Text style={[review.rowMeta, { color: colors.brand.purple }]}>{days} day{days !== 1 ? 's' : ''}</Text>
              )}
            </View>
          </View>

          <View style={[review.divider, { backgroundColor: colors.background.cardBorder }]} />

          <View style={review.row}>
            <AirplaneTilt size={20} color={colors.brand.purple} weight="duotone" />
            <View style={review.rowContent}>
              <Text style={[review.rowLabel, { color: colors.text.tertiary }]}>Title</Text>
              <Text style={[review.rowValue, { color: colors.text.primary }]}>{title}</Text>
            </View>
          </View>

          <View style={[review.divider, { backgroundColor: colors.background.cardBorder }]} />

          <View style={review.row}>
            <VisibilityIcon size={20} color={visibilityColor} weight="duotone" />
            <View style={review.rowContent}>
              <Text style={[review.rowLabel, { color: colors.text.tertiary }]}>Visibility</Text>
              <Text style={[review.rowValue, { color: colors.text.primary }]}>{visibilityLabel(visibility)}</Text>
            </View>
          </View>
        </View>
      </View>

      {error ? (
        <View style={[review.errorBox, { backgroundColor: `${colors.semantic.error}14` }]}>
          <Text style={[review.errorText, { color: colors.semantic.error }]}>{error}</Text>
        </View>
      ) : null}

      {/* The one hero moment of this flow — the actual data write. */}
      <Button
        label="Create trip"
        onPress={onCreateTrip}
        loading={creating}
        disabled={creating}
        variant="hero"
        size="lg"
        fullWidth
      />
    </View>
  );
}

const step = StyleSheet.create({
  container: { flex: 1, paddingTop: Spacing['2'] },
  stepLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semiBold,
    marginBottom: Spacing['3'],
    letterSpacing: 0.08 * FontSize.xs,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
    marginBottom: Spacing['2'],
  },
  subtitle: {
    fontSize: FontSize.base,
    marginBottom: Spacing['8'],
    lineHeight: FontSize.base * 1.5,
  },
  field: { marginBottom: Spacing['5'] },
  label: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    marginBottom: Spacing['2'],
  },
  hint: {
    fontSize: FontSize.xs,
    marginTop: Spacing['1'],
  },
  input: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    fontSize: FontSize.base,
  },
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    minHeight: 44,
  },
  pickerBtnPlaceholder: {
    flex: 1,
    fontSize: FontSize.base,
  },
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
  },
  selectedText: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  countryBadge: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['1'],
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
    overflow: 'hidden',
  },
  textarea: {
    minHeight: 100,
    paddingTop: Spacing['3'],
  },
  dateButton: {
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  dateText: {
    fontSize: FontSize.base,
  },
  durationBadge: {
    alignSelf: 'flex-start',
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    marginTop: Spacing['3'],
  },
  durationText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },
  warningText: {
    fontSize: FontSize.sm,
    marginTop: Spacing['2'],
  },
  visibilityRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
  },
  visibilityBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    alignItems: 'center',
    gap: Spacing['1'],
    minHeight: 44,
    justifyContent: 'center',
  },
  visibilityLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
});

const review = StyleSheet.create({
  card: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    marginBottom: Spacing['6'],
  },
  cardInner: { padding: Spacing['5'] },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'] },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  rowValue: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },
  rowMeta: {
    fontSize: FontSize.sm,
    marginTop: 2,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing['4'],
  },
  errorBox: {
    borderRadius: BorderRadius.md,
    padding: Spacing['3'],
    marginBottom: Spacing['4'],
  },
  errorText: {
    fontSize: FontSize.sm,
  },
});

// ─── Main wizard ──────────────────────────────────────────────────────────────

export default function NewTripScreen() {
  const { colors } = useTheme();
  const { createTrip } = useCreateTrip();
  const { width } = useLayout();

  // Step state
  const [step, setStep] = useState(0);

  // Step 1
  const [destination, setDestination] = useState('');
  const [countryCode, setCountryCode] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [additionalDestinations, setAdditionalDestinations] = useState<Destination[]>([]);

  const handlePlaceSelect = useCallback((s: PlaceSelection) => {
    setDestination(s.name);
    setCountryCode(s.countryCode ?? '');
    setPlaceId(s.placeId);
    setLat(s.lat);
    setLng(s.lng);
  }, []);

  const handleClearPlace = useCallback(() => {
    setDestination('');
    setCountryCode('');
    setPlaceId(null);
    setLat(null);
    setLng(null);
  }, []);

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
  const translateX = useRef(new Animated.Value(0)).current;
  const animatedStyle = { transform: [{ translateX }] };

  const goToStep = useCallback((nextStep: number, forward: boolean) => {
    const direction = forward ? -width : width;
    Animated.spring(translateX, {
      toValue: direction,
      ...SPRING,
    }).start(() => {
      setStep(nextStep);
      translateX.setValue(-direction);
      Animated.spring(translateX, {
        toValue: 0,
        ...SPRING,
      }).start();
    });
  }, [translateX, width]);

  const canAdvance = () => {
    if (step === 0) return destination.trim().length > 0;
    if (step === 2) return title.trim().length > 0;
    return true;
  };

  const handleSetTitle = useCallback((v: string) => {
    setTitleAutoFilled(false);
    setTitle(v);
  }, []);

  const handleNext = useCallback(() => {
    if (!canAdvance()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 1 && titleAutoFilled) {
      const allNames = [destination.trim(), ...additionalDestinations.map((d) => d.name)];
      setTitle(
        allNames.length === 1
          ? `Trip to ${allNames[0]}`
          : allNames.join(', ').replace(/, ([^,]*)$/, ' & $1'),
      );
    }
    goToStep(step + 1, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, titleAutoFilled, destination, additionalDestinations, goToStep]);

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (step === 0) {
      router.back();
    } else {
      goToStep(step - 1, false);
    }
  }, [step, goToStep]);

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
          placeId,
          lat,
          lng,
          countryCode: countryCode.trim() || null,
          bounds: null,
        },
        additionalDestinations,
        startDate,
        endDate,
        visibility,
        tags,
        coverImageUrl: null,
        isAiGenerated: false,
      });
      router.replace(`/trip/${newId}`);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'The trip didn\'t save. Try again.';
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
            placeId={placeId}
            onPlaceSelect={handlePlaceSelect}
            onClearPlace={handleClearPlace}
            additionalDestinations={additionalDestinations}
            onAdditionalDestinationsChange={setAdditionalDestinations}
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
            additionalDestinations={additionalDestinations}
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
    <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleBack}
          style={styles.backBtn}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel={step === 0 ? 'Close' : 'Back'}
        >
          {step === 0 ? (
            <X size={20} color={colors.text.primary} weight="regular" />
          ) : (
            <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
          )}
        </TouchableOpacity>

        {/* Step dots */}
        <View style={styles.dots}>
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: colors.background.cardBorder },
                i === step && [styles.dotActive, { backgroundColor: colors.brand.purple }],
              ]}
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
          <NestableScrollContainer
            style={styles.flex}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderStep()}
          </NestableScrollContainer>
        </Animated.View>
      </KeyboardAvoidingView>

      {/* Footer: Next button (not on review step) — near-black, not gradient;
          the gradient hero is reserved for the actual "Create trip" write. */}
      {step < 3 && (
        <View style={[styles.footer, { borderTopColor: colors.background.cardBorder }]}>
          <Button
            label={step === 2 ? 'Review' : 'Next'}
            onPress={handleNext}
            disabled={!canAdvance()}
            variant="primary"
            size="lg"
            fullWidth
            haptic="none"
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['6'],
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: Spacing['4'],
  },
  backBtn: { minWidth: 44, minHeight: 44, alignItems: 'flex-start', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    borderRadius: 10,
  },
  headerRight: { minWidth: 44 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: Spacing['6'],
    paddingBottom: Spacing['10'],
  },
  footer: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: Platform.OS === 'ios' ? 40 : Spacing['6'],
    paddingTop: Spacing['4'],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
