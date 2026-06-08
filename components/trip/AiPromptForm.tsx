import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { MapPin, MagnifyingGlass, X } from 'phosphor-react-native';
import { TravelStyle } from '@/types/ai';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AiPromptFormProps {
  destination: string;
  countryCode: string;
  durationDays: number;
  travelStyle: TravelStyle;
  mustSeeInput: string;
  preferences: string;
  onDestinationChange: (v: string) => void;
  onCountryCodeChange: (v: string) => void;
  onDurationChange: (v: number) => void;
  onTravelStyleChange: (v: TravelStyle) => void;
  onMustSeeChange: (v: string) => void;
  onPreferencesChange: (v: string) => void;
  destinationPlaceId?: string | null;
  onPlaceSelect?: (s: PlaceSelection) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TRAVEL_STYLES: { value: TravelStyle; label: string; emoji: string }[] = [
  { value: 'adventure', label: 'Adventure', emoji: '🏔️' },
  { value: 'luxury', label: 'Luxury', emoji: '💎' },
  { value: 'budget', label: 'Budget', emoji: '💰' },
  { value: 'family', label: 'Family', emoji: '👨‍👩‍👧' },
  { value: 'cultural', label: 'Cultural', emoji: '🏛️' },
];

const MIN_DAYS = 1;
const MAX_DAYS = 14;

// ─── Component ────────────────────────────────────────────────────────────────

export function AiPromptForm({
  destination,
  countryCode,
  durationDays,
  travelStyle,
  mustSeeInput,
  preferences,
  onDestinationChange,
  onCountryCodeChange,
  onDurationChange,
  onTravelStyleChange,
  onMustSeeChange,
  onPreferencesChange,
  destinationPlaceId,
  onPlaceSelect,
}: AiPromptFormProps) {
  const [pickerVisible, setPickerVisible] = useState(false);

  const handleDecrement = () => {
    if (durationDays > MIN_DAYS) onDurationChange(durationDays - 1);
  };

  const handleIncrement = () => {
    if (durationDays < MAX_DAYS) onDurationChange(durationDays + 1);
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
    onPlaceSelect?.({ placeId: '', name: '', lat: null, lng: null, countryCode: null });
    onDestinationChange('');
    onCountryCodeChange('');
  }, [onPlaceSelect, onDestinationChange, onCountryCodeChange]);

  const isPlaceSelected = Boolean(destinationPlaceId);

  return (
    <View style={styles.container}>
      {/* Destination */}
      <View style={styles.field}>
        <Text style={styles.label}>Destination *</Text>

        {isPlaceSelected ? (
          <View style={styles.selectedRow}>
            <MapPin size={16} color={DarkColors.brand.purple} weight="duotone" />
            <Text style={styles.selectedText} numberOfLines={1}>{destination}</Text>
            <TouchableOpacity onPress={handleClearPlace} activeOpacity={0.7} hitSlop={8}>
              <X size={16} color={DarkColors.text.tertiary} weight="bold" />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={styles.pickerBtn}
            onPress={handleOpenPicker}
            activeOpacity={0.7}
          >
            <MagnifyingGlass size={16} color={DarkColors.text.tertiary} weight="regular" />
            <Text
              style={[
                styles.pickerBtnText,
                destination ? styles.pickerBtnTextFilled : styles.pickerBtnPlaceholder,
              ]}
              numberOfLines={1}
            >
              {destination || 'Search for a destination…'}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Country Code — shown as editable; auto-filled from Places when selected */}
      <View style={styles.field}>
        <Text style={styles.label}>Country Code (optional)</Text>
        <TextInput
          style={styles.input}
          value={countryCode}
          onChangeText={(v) => onCountryCodeChange(v.toUpperCase())}
          placeholder="e.g. JP"
          placeholderTextColor={DarkColors.text.tertiary}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={2}
          returnKeyType="next"
        />
        <Text style={styles.hint}>
          {isPlaceSelected ? 'Auto-filled from Places — tap to override' : '2-letter ISO country code'}
        </Text>
      </View>

      {/* Duration */}
      <View style={styles.field}>
        <Text style={styles.label}>Duration</Text>
        <View style={styles.durationRow}>
          <TouchableOpacity
            style={[styles.durationBtn, durationDays <= MIN_DAYS && styles.durationBtnDisabled]}
            onPress={handleDecrement}
            activeOpacity={0.7}
            disabled={durationDays <= MIN_DAYS}
          >
            <Text style={styles.durationBtnText}>−</Text>
          </TouchableOpacity>

          <View style={styles.durationDisplay}>
            <Text style={styles.durationValue}>{durationDays}</Text>
            <Text style={styles.durationUnit}>{durationDays === 1 ? 'day' : 'days'}</Text>
          </View>

          <TouchableOpacity
            style={[styles.durationBtn, durationDays >= MAX_DAYS && styles.durationBtnDisabled]}
            onPress={handleIncrement}
            activeOpacity={0.7}
            disabled={durationDays >= MAX_DAYS}
          >
            <Text style={styles.durationBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Travel Style */}
      <View style={styles.field}>
        <Text style={styles.label}>Travel Style</Text>
        <View style={styles.styleGrid}>
          {TRAVEL_STYLES.map((style) => (
            <TouchableOpacity
              key={style.value}
              style={[styles.stylePill, travelStyle === style.value && styles.stylePillActive]}
              onPress={() => onTravelStyleChange(style.value)}
              activeOpacity={0.7}
            >
              <Text style={styles.styleEmoji}>{style.emoji}</Text>
              <Text
                style={[styles.styleLabel, travelStyle === style.value && styles.styleLabelActive]}
              >
                {style.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Must-See */}
      <View style={styles.field}>
        <Text style={styles.label}>Must-See Places (optional)</Text>
        <TextInput
          style={styles.input}
          value={mustSeeInput}
          onChangeText={onMustSeeChange}
          placeholder="Eiffel Tower, Louvre Museum"
          placeholderTextColor={DarkColors.text.tertiary}
          autoCapitalize="words"
          returnKeyType="next"
        />
        <Text style={styles.hint}>Comma-separated list of places you must visit</Text>
      </View>

      {/* Preferences */}
      <View style={styles.field}>
        <Text style={styles.label}>Additional Preferences (optional)</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          value={preferences}
          onChangeText={onPreferencesChange}
          placeholder="e.g. I love street food, prefer morning activities, no crowded tourist traps..."
          placeholderTextColor={DarkColors.text.tertiary}
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

  // Destination picker button
  pickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
  },
  pickerBtnText: {
    flex: 1,
    fontSize: FontSize.base,
    color: DarkColors.text.primary,
  },
  pickerBtnTextFilled: {
    color: DarkColors.text.primary,
  },
  pickerBtnPlaceholder: {
    color: DarkColors.text.tertiary,
  },

  // Selected destination chip
  selectedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    backgroundColor: 'rgba(167,139,250,0.12)',
    borderWidth: 1,
    borderColor: DarkColors.brand.purple,
    borderRadius: BorderRadius.lg,
    padding: Spacing['4'],
  },
  selectedText: {
    flex: 1,
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: DarkColors.text.primary,
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
    backgroundColor: 'rgba(167,139,250,0.15)',
    borderWidth: 1,
    borderColor: DarkColors.brand.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationBtnDisabled: {
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  durationBtnText: {
    fontSize: FontSize.xl,
    color: DarkColors.brand.purple,
    fontWeight: FontWeight.bold,
    lineHeight: FontSize.xl * 1.2,
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
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
  },
  durationUnit: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
    fontWeight: FontWeight.medium,
  },

  // Travel style pills
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
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  stylePillActive: {
    backgroundColor: 'rgba(167,139,250,0.2)',
    borderColor: DarkColors.brand.purple,
  },
  styleEmoji: { fontSize: 16 },
  styleLabel: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
    color: DarkColors.text.secondary,
  },
  styleLabelActive: { color: DarkColors.brand.purple },
});
