import React, { useCallback } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Check, MapTrifold, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useMyTrips } from '@/hooks/useMyTrips';
import { EmptyState } from '@/components/ui/EmptyState';
import { tripDateEyebrow } from '@/utils/walletLink';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface TripPickerSheetProps {
  visible: boolean;
  currentTripId?: string | null;
  onPick: (tripId: string) => void;
  onClose: () => void;
}

/** "Add to a trip": your trips and ones you're on. */
export function TripPickerSheet({ visible, currentTripId, onPick, onClose }: TripPickerSheetProps) {
  const { colors } = useTheme();
  const { trips, isLoading } = useMyTrips(visible);

  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);

  const planTrip = useCallback(() => {
    onClose();
    router.push('/trip/new');
  }, [onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Add to a trip</Text>
          <TouchableOpacity onPress={handleClose} style={styles.iconBtn} accessibilityLabel="Close">
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>
        {!isLoading && trips.length === 0 ? (
          <EmptyState
            icon={MapTrifold}
            title="No trips yet"
            description="Plan a trip, then add this booking to it."
            actionLabel="Plan a trip"
            onAction={planTrip}
            actionHaptic="light"
          />
        ) : (
          <FlashList
            data={trips}
            keyExtractor={(t) => t.tripId}
            extraData={currentTripId}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[styles.row, { borderColor: colors.background.cardBorder }]}
                onPress={() => {
                  onPick(item.tripId);
                  onClose();
                }}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}, ${tripDateEyebrow(item.start, item.end)}`}
              >
                <View style={styles.rowText}>
                  <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{tripDateEyebrow(item.start, item.end)}</Text>
                  <Text style={[styles.rowTitle, { color: colors.text.primary }]} numberOfLines={2}>{item.title}</Text>
                </View>
                {item.tripId === currentTripId && <Check size={18} color={colors.text.primary} weight="bold" />}
              </TouchableOpacity>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing['3'] },
  title: { fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing['2'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], minHeight: 64, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { flex: 1, gap: 2, paddingVertical: Spacing['3'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  rowTitle: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
});
