import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { MapPin, MagnifyingGlass, X, Mountains, Diamond, Wallet, UsersThree, Bank, Minus, Plus } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { TravelStyle, TripPace } from '@/types/ai';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import type { PhosphorIcon } from '@/constants/icons';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiPromptFormProps {
  destination: string;
  countryCode: string;
  durationDays: number;
  travelStyle: TravelStyle;
  pace: TripPace;
  mustSeeInput: string;
  preferences: string;
  onDestinationChange: (v: string) => void;
  onCountryCodeChange: (v: string) => void;
  onDurationChange: (v: number) => void;
  onTravelStyleChange: (v: TravelStyle) => void;
  onPaceChange: (v: TripPace) => void;
  onMustSeeChange: (v: string) => void;
  onPreferencesChange: (v: string) => void;
  destinationPlaceId?: string | null;
  onPlaceSelect?: (s: PlaceSelection) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRAVEL_STYLES: { value: TravelStyle; label: string; Icon: PhosphorIcon }[] = [
  { value: 'adventure', label: 'Adventure', Icon: Mountains },
  { value: 'luxury', label: 'Luxury', Icon: Diamond },
  { value: 'budget', label: 'Budget', Icon: Wallet },
  { value: 'family', label: 'Family', Icon: UsersThree },
  { value: 'cultural', label: 'Cultural', Icon: Bank },
];

const MIN_DAYS = 1;
const MAX_DAYS = 14;

const PACE_OPTIONS: { value: TripPace; label: string; hint: string }[] = [
  { value: 'relaxed', label: 'Relaxed', hint: 'Fewer stops, more downtime' },
  { value: 'moderate', label: 'Moderate', hint: 'A balanced day' },
  { value: 'packed', label: 'Packed', hint: 'See as much as possible' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function AiPromptForm({
  destination,
  countryCode,
  durationDays,
  travelStyle,
  pace,
  mustSeeInput,
  preferences,
  onDestinationChange,
  onCountryCodeChange,
  onDurationChange,
  onTravelStyleChange,
  onPaceChange,
  onMustSeeChange,
  onPreferencesChange,
  destinationPlaceId,
  onPlaceSelect,
}: AiPromptFormProps) {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleDecrement = () => {
    if (durationDays > MIN_DAYS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDurationChange(durationDays - 1);
    }
  };

  const handleIncrement = () => {
    if (durationDays < MAX_DAYS) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDurationChange(durationDays + 1);
    }
  };

  const handleOpenPicker = useCallback(() => setPickerVisible(true), []);
  const handleClosePicker = useCallback(() => setPickerVisible(false), []);

  const handlePlaceSelect = useCallback(
    (s: PlaceSelection) => {
      onDestinationChange(s.name);
      if (s.countryCode) onCountryCodeChange(s.countryCode);
      onPlaceSelect?.(s);
      setPickerVisible(false);
    },
    [onDestinationChange, onCountryCodeChange, onPlaceSelect],
  );

  const handleClearPlace = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPlaceSelect?.({
      placeId: '',
      name: '',
      lat: null,
      lng: null,
      countryCode: null,
      primaryType: null,
      viewport: null,
    });
    onDestinationChange('');
    onCountryCodeChange('');
  }, [onPlaceSelect, onDestinationChange, onCountryCodeChange]);

  const handleTravelStyleSelect = useCallback((v: TravelStyle) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTravelStyleChange(v);
  }, [onTravelStyleChange]);

  const handlePaceSelect = useCallback((v: TripPace) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPaceChange(v);
  }, [onPaceChange]);

  const isPlaceSelected = Boolean(destinationPlaceId);

  return (
    <View style={styles.container}>
      {/* Destination */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Destination *</Text>

        {isPlaceSelected ? (
          <View style={[styles.selectedRow, { backgroundColor: `${colors.brand.purple}14`, borderColor: colors.brand.purple }]}>
            <MapPin size={16} color={colors.brand.purple} weight="duotone" />
            <Text style={[styles.selectedText, { color: colors.text.primary }]} numberOfLines={1}>{destination}</Text>
            <TouchableOpacity onPress={handleClearPlace} activeOpacity={0.7} hitSlop={10} accessibilityLabel="Clear destination">
              <X size={16} color={colors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.pickerBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
            onPress={handleOpenPicker}
            activeOpacity={0.7}
          >
            <MagnifyingGlass size={16} color={colors.text.tertiary} weight="regular" />
            <Text
              style={[styles.pickerBtnText, { color: destination ? colors.text.primary : colors.text.tertiary }]}
              numberOfLines={1}
            >
              {destination || 'Search for a destination…'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Country Code — shown as editable; auto-filled from Places when selected */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Country code (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={countryCode}
          onChangeText={(v) => onCountryCodeChange(v.toUpperCase())}
          placeholder="e.g. JP"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={2}
          returnKeyType="next"
        />
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {isPlaceSelected ? 'Auto-filled from Places — tap to override' : '2-letter ISO country code'}
        </Text>
      </View>

      {/* Duration */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Duration</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            style={[
              styles.durationBtn,
              { backgroundColor: `${colors.brand.purple}1F`, borderColor: colors.brand.purple },
              durationDays <= MIN_DAYS && { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder },
            ]}
            onPress={handleDecrement}
            activeOpacity={0.7}
            disabled={durationDays <= MIN_DAYS}
            accessibilityLabel="Decrease duration"
          >
            <Minus size={18} color={durationDays <= MIN_DAYS ? colors.text.disabled : colors.brand.purple} weight="bold" />
          </TouchableOpacity>

          <View style={styles.durationDisplay}>
            <Text style={[styles.durationValue, { color: colors.text.primary }]}>{durationDays}</Text>
            <Text style={[styles.durationUnit, { color: colors.text.secondary }]}>{durationDays === 1 ? 'day' : 'days'}</Text>
          </View>

          <TouchableOpacity
            style={[
              styles.durationBtn,
              { backgroundColor: `${colors.brand.purple}1F`, borderColor: colors.brand.purple },
              durationDays >= MAX_DAYS && { backgroundColor: colors.background.sunken, borderColor: colors.background.cardBorder },
            ]}
            onPress={handleIncrement}
            activeOpacity={0.7}
            disabled={durationDays >= MAX_DAYS}
            accessibilityLabel="Increase duration"
          >
            <Plus size={18} color={durationDays >= MAX_DAYS ? colors.text.disabled : colors.brand.purple} weight="bold" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Travel Style */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Travel style</Text>
        <View style={styles.styleGrid}>
          {TRAVEL_STYLES.map((option) => {
            const active = travelStyle === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.stylePill,
                  { backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card, borderColor: active ? colors.brand.purple : colors.background.cardBorder },
                ]}
                onPress={() => handleTravelStyleSelect(option.value)}
                activeOpacity={0.7}
                accessibilityLabel={`${option.label} travel style`}
              >
                <option.Icon size={16} color={active ? colors.brand.purple : colors.text.secondary} weight={active ? 'duotone' : 'regular'} />
                <Text style={[styles.styleLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Pace */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Pace</Text>
        <View style={styles.styleGrid}>
          {PACE_OPTIONS.map((option) => {
            const active = pace === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.stylePill,
                  { backgroundColor: active ? `${colors.brand.purple}1F` : colors.background.card, borderColor: active ? colors.brand.purple : colors.background.cardBorder },
                ]}
                onPress={() => handlePaceSelect(option.value)}
                activeOpacity={0.7}
                accessibilityLabel={`${option.label} pace`}
              >
                <Text style={[styles.styleLabel, { color: active ? colors.brand.purple : colors.text.secondary }]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>
          {PACE_OPTIONS.find((o) => o.value === pace)?.hint}
        </Text>
      </View>

      {/* Must-See */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Must-see places (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={mustSeeInput}
          onChangeText={onMustSeeChange}
          placeholder="Eiffel Tower, Louvre Museum"
          placeholderTextColor={colors.text.tertiary}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <Text style={[styles.hint, { color: colors.text.tertiary }]}>Comma-separated list of places you must visit</Text>
      </View>

      {/* Preferences */}
      <View style={styles.field}>
        <Text style={[styles.label, { color: colors.text.secondary }]}>Additional preferences (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder, color: colors.text.primary }]}
          value={preferences}
          onChangeText={onPreferencesChange}
          placeholder="e.g. I love street food, prefer morning activities, no crowded tourist traps..."
          placeholderTextColor={colors.text.tertiary}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          returnKeyType="done"
        />
      </View>

      {/* Picker modal */}
      <DestinationPicker
        visible={pickerVisible}
        onSelect={handlePlaceSelect}
        onClose={handleClosePicker}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { paddingTop: Spacing['2'] },
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
  textarea: {
    minHeight: 100,
    paddingTop: Spacing['3'],
  },

  // Destination picker button
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
    minHeight: 44,
  },
  pickerBtnText: {
    flex: 1,
    fontSize: FontSize.base,
  },

  // Selected destination chip
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

  // Duration counter
  durationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['4'],
  },
  durationBtn: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationDisplay: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: Spacing['2'],
    justifyContent: 'center',
  },
  durationValue: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.semiBold,
  },
  durationUnit: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },

  // Travel style / pace pills
  styleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing['2'],
  },
  stylePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    paddingVertical: Spacing['2'],
    paddingHorizontal: Spacing['3'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    minHeight: 36,
  },
  styleLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
