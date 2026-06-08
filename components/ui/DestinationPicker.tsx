import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { MapPin, MagnifyingGlass, X, Compass } from 'phosphor-react-native';
import { usePlaceAutocomplete, PlaceSelection, PlaceSuggestion } from '@/hooks/usePlaceAutocomplete';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export interface DestinationPickerProps {
  visible: boolean;
  onSelect: (place: PlaceSelection) => void;
  onClose: () => void;
}

export function DestinationPicker({ visible, onSelect, onClose }: DestinationPickerProps) {
  const { query, setQuery, suggestions, isLoading, error, selectPlace, clearQuery } =
    usePlaceAutocomplete();
  const [isSelecting, setIsSelecting] = useState(false);

  const handleClose = useCallback(() => {
    clearQuery();
    onClose();
  }, [clearQuery, onClose]);

  const handleSelect = useCallback(
    async (placeId: string) => {
      if (isSelecting) return;
      setIsSelecting(true);
      try {
        const selection = await selectPlace(placeId);
        onSelect(selection);
      } catch {
        handleClose();
      } finally {
        setIsSelecting(false);
      }
    },
    [isSelecting, selectPlace, onSelect, handleClose],
  );

  const renderSuggestion = useCallback(
    ({ item }: { item: PlaceSuggestion }) => (
      <TouchableOpacity
        style={styles.row}
        onPress={() => handleSelect(item.placeId)}
        activeOpacity={0.7}
        disabled={isSelecting}
      >
        <MapPin size={18} color={DarkColors.brand.purple} weight="duotone" />
        <View style={styles.rowTexts}>
          <Text style={styles.rowMain} numberOfLines={1}>
            {item.mainText}
          </Text>
          {item.secondaryText ? (
            <Text style={styles.rowSub} numberOfLines={1}>
              {item.secondaryText}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [handleSelect, isSelecting],
  );

  const renderBody = () => {
    if (isSelecting) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={DarkColors.brand.purple} size="large" />
        </View>
      );
    }
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={DarkColors.brand.purple} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.empty}>
          <Compass size={40} color={DarkColors.text.tertiary} weight="duotone" />
          <Text style={styles.emptyTitle}>Search unavailable</Text>
          <Text style={styles.emptyBody}>Check your connection and try again.</Text>
        </View>
      );
    }
    if (query.trim().length < 2) {
      return (
        <View style={styles.empty}>
          <Compass size={52} color={DarkColors.brand.purple} weight="duotone" />
          <Text style={styles.emptyTitle}>Find your next destination</Text>
          <Text style={styles.emptyBody}>Type a city, country, or landmark.</Text>
        </View>
      );
    }
    if (suggestions.length === 0) {
      return (
        <View style={styles.empty}>
          <MapPin size={40} color={DarkColors.text.tertiary} weight="duotone" />
          <Text style={styles.emptyTitle}>No results for "{query}"</Text>
          <Text style={styles.emptyBody}>Try a different search term.</Text>
        </View>
      );
    }
    return (
      <View style={styles.listWrap}>
        <FlashList
          data={suggestions}
          renderItem={renderSuggestion}
          keyExtractor={(item) => item.placeId}
          estimatedItemSize={72}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
        />
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={handleClose}
    >
      <SafeAreaView style={styles.root}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Where to?</Text>
            <TouchableOpacity onPress={handleClose} style={styles.closeBtn} activeOpacity={0.7}>
              <X size={20} color={DarkColors.text.secondary} weight="bold" />
            </TouchableOpacity>
          </View>

          <View style={styles.inputWrap}>
            <MagnifyingGlass size={18} color={DarkColors.text.tertiary} weight="regular" />
            <TextInput
              style={styles.input}
              value={query}
              onChangeText={setQuery}
              placeholder="City, country, landmark…"
              placeholderTextColor={DarkColors.text.tertiary}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={clearQuery} activeOpacity={0.7}>
                <X size={16} color={DarkColors.text.tertiary} weight="bold" />
              </TouchableOpacity>
            )}
          </View>

          {renderBody()}
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DarkColors.background.primary,
  },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['4'],
    paddingBottom: Spacing['3'],
  },
  headerTitle: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginHorizontal: Spacing['6'],
    marginBottom: Spacing['2'],
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing['4'],
  },
  input: {
    flex: 1,
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
    paddingVertical: Spacing['3'],
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
    gap: Spacing['3'],
    paddingBottom: Spacing['20'],
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FontSize.sm,
    color: DarkColors.text.tertiary,
    textAlign: 'center',
    lineHeight: FontSize.sm * 1.6,
  },
  listWrap: { flex: 1 },
  listContent: { paddingBottom: Spacing['10'] },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['4'],
    gap: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DarkColors.background.cardBorder,
  },
  rowTexts: { flex: 1, gap: 2 },
  rowMain: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: DarkColors.text.primary,
  },
  rowSub: {
    fontSize: FontSize.sm,
    color: DarkColors.text.tertiary,
  },
});
