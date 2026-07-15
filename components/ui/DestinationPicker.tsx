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
import * as Haptics from 'expo-haptics';
import { MapPin, MagnifyingGlass, X, Compass } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { usePlaceAutocomplete, PlaceSelection, PlaceSuggestion } from '@/hooks/usePlaceAutocomplete';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

export interface DestinationPickerProps {
  visible: boolean;
  onSelect: (place: PlaceSelection) => void;
  onClose: () => void;
}

export function DestinationPicker({ visible, onSelect, onClose }: DestinationPickerProps) {
  const { colors } = useTheme();
  const { query, setQuery, suggestions, isLoading, error, selectPlace, clearQuery } =
    usePlaceAutocomplete();
  const [isSelecting, setIsSelecting] = useState(false);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearQuery();
    onClose();
  }, [clearQuery, onClose]);

  const handleClearQuery = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    clearQuery();
  }, [clearQuery]);

  const handleSelect = useCallback(
    async (placeId: string) => {
      if (isSelecting) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setIsSelecting(true);
      try {
        const selection = await selectPlace(placeId);
        onSelect(selection);
      } catch (err) {
        console.error('[DestinationPicker] selectPlace failed:', err);
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
        style={[styles.row, { borderBottomColor: colors.background.cardBorder }]}
        onPress={() => handleSelect(item.placeId)}
        activeOpacity={0.7}
        disabled={isSelecting}
      >
        <MapPin size={18} color={colors.brand.purple} weight="duotone" />
        <View style={styles.rowTexts}>
          <Text style={[styles.rowMain, { color: colors.text.primary }]} numberOfLines={1}>
            {item.mainText}
          </Text>
          {item.secondaryText ? (
            <Text style={[styles.rowSub, { color: colors.text.tertiary }]} numberOfLines={1}>
              {item.secondaryText}
            </Text>
          ) : null}
        </View>
      </TouchableOpacity>
    ),
    [handleSelect, isSelecting, colors],
  );

  const renderBody = () => {
    if (isSelecting) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} size="large" />
        </View>
      );
    }
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      );
    }
    if (error) {
      return (
        <View style={styles.empty}>
          <Compass size={40} color={colors.text.disabled} weight="duotone" />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Search unavailable</Text>
          <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>Check your connection and try again.</Text>
        </View>
      );
    }
    if (query.trim().length < 2) {
      return (
        <View style={styles.empty}>
          <Compass size={52} color={colors.brand.purple} weight="duotone" />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>Find your next destination</Text>
          <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>Type a city, country, or landmark.</Text>
        </View>
      );
    }
    if (suggestions.length === 0) {
      return (
        <View style={styles.empty}>
          <MapPin size={40} color={colors.text.disabled} weight="duotone" />
          <Text style={[styles.emptyTitle, { color: colors.text.primary }]}>No results for "{query}"</Text>
          <Text style={[styles.emptyBody, { color: colors.text.secondary }]}>Try a different search term.</Text>
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
      <SafeAreaView style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.header}>
            <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Where to?</Text>
            <TouchableOpacity
              onPress={handleClose}
              style={[styles.closeBtn, { backgroundColor: colors.background.sunken }]}
              activeOpacity={0.7}
              accessibilityLabel="Close"
            >
              <X size={20} color={colors.text.secondary} weight="bold" />
            </TouchableOpacity>
          </View>

          <View style={[styles.inputWrap, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
            <MagnifyingGlass size={18} color={colors.text.tertiary} weight="regular" />
            <TextInput
              style={[styles.input, { color: colors.text.primary }]}
              value={query}
              onChangeText={setQuery}
              placeholder="City, country, landmark…"
              placeholderTextColor={colors.text.tertiary}
              autoFocus
              autoCorrect={false}
              autoCapitalize="none"
              returnKeyType="search"
            />
            {query.length > 0 && (
              <TouchableOpacity onPress={handleClearQuery} activeOpacity={0.7} hitSlop={10} accessibilityLabel="Clear search">
                <X size={16} color={colors.text.tertiary} weight="bold" />
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
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    marginHorizontal: Spacing['6'],
    marginBottom: Spacing['2'],
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing['4'],
  },
  input: {
    flex: 1,
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
    fontWeight: FontWeight.semiBold,
    textAlign: 'center',
  },
  emptyBody: {
    fontSize: FontSize.sm,
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
  },
  rowTexts: { flex: 1, gap: 2 },
  rowMain: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  rowSub: {
    fontSize: FontSize.sm,
  },
});
