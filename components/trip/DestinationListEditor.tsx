import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { NestableDraggableFlatList, RenderItemParams } from 'react-native-draggable-flatlist';
import * as Haptics from 'expo-haptics';
import { MapPin, X, Plus, DotsSixVertical } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { Destination } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export interface DestinationListEditorProps {
  destinations: Destination[];
  onChange: (next: Destination[]) => void;
  /** Total destination cap INCLUDING the primary, which this editor never
   * sees directly (every current caller has its own separate single-
   * destination field for the primary). Defaults to 10 total, i.e. 9 here. */
  maxTotal?: number;
}

const DEFAULT_MAX_TOTAL = 10;

function placeSelectionToDestination(s: PlaceSelection): Destination {
  return { name: s.name, placeId: s.placeId, lat: s.lat, lng: s.lng, countryCode: s.countryCode };
}

/** Add/reorder/remove UI for a trip's additional destinations. Shared
 * between the manual trip wizard and the AI-generate form — see
 * docs/superpowers/specs/2026-07-25-multi-destination-trips-design.md. */
export function DestinationListEditor({ destinations, onChange, maxTotal = DEFAULT_MAX_TOTAL }: DestinationListEditorProps) {
  const { colors } = useTheme();
  const [pickerVisible, setPickerVisible] = useState(false);

  const maxAdditional = maxTotal - 1;
  const atCap = destinations.length >= maxAdditional;

  const handleOpenPicker = useCallback(() => {
    if (atCap) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPickerVisible(true);
  }, [atCap]);

  const handleClosePicker = useCallback(() => setPickerVisible(false), []);

  const handleSelect = useCallback(
    (s: PlaceSelection) => {
      onChange([...destinations, placeSelectionToDestination(s)]);
      setPickerVisible(false);
    },
    [destinations, onChange],
  );

  const handleRemove = useCallback(
    (index: number) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onChange(destinations.filter((_, i) => i !== index));
    },
    [destinations, onChange],
  );

  const handleDragEnd = useCallback(
    ({ data }: { data: Destination[] }) => {
      onChange(data);
    },
    [onChange],
  );

  const renderItem = useCallback(
    ({ item, drag, isActive, getIndex }: RenderItemParams<Destination>) => (
      <View
        style={[
          styles.row,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          isActive && { borderColor: colors.brand.purple },
        ]}
      >
        <TouchableOpacity
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            drag();
          }}
          activeOpacity={0.7}
          hitSlop={8}
          accessibilityLabel="Drag to reorder"
        >
          <DotsSixVertical size={18} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
        <MapPin size={16} color={colors.brand.purple} weight="duotone" />
        <Text style={[styles.rowText, { color: colors.text.primary }]} numberOfLines={1}>
          {item.name}
        </Text>
        <TouchableOpacity
          onPress={() => handleRemove(getIndex() ?? 0)}
          activeOpacity={0.7}
          hitSlop={10}
          accessibilityLabel={`Remove ${item.name}`}
        >
          <X size={16} color={colors.text.tertiary} weight="bold" />
        </TouchableOpacity>
      </View>
    ),
    [colors, handleRemove],
  );

  return (
    <View style={styles.container}>
      {destinations.length > 0 && (
        <NestableDraggableFlatList
          data={destinations}
          keyExtractor={(item, index) => `${item.placeId}-${index}`}
          renderItem={renderItem}
          onDragEnd={handleDragEnd}
        />
      )}

      {!atCap && (
        <TouchableOpacity
          style={[styles.addBtn, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}
          onPress={handleOpenPicker}
          activeOpacity={0.7}
        >
          <Plus size={16} color={colors.brand.purple} weight="bold" />
          <Text style={[styles.addBtnText, { color: colors.brand.purple }]}>Add another destination</Text>
        </TouchableOpacity>
      )}

      <DestinationPicker visible={pickerVisible} onSelect={handleSelect} onClose={handleClosePicker} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: Spacing['2'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    marginBottom: Spacing['2'],
  },
  rowText: {
    flex: 1,
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing['3'],
    minHeight: 44,
  },
  addBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
