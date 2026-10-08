import React, { useCallback } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BookedRow } from '@/components/trip/BookedRow';
import type { DayBooking, TripBooking } from '@/utils/bookingDays';
import { FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface TripBookingsSheetProps {
  visible: boolean;
  bookings: TripBooking[];
  onClose: () => void;
  onBookingPress: (booking: TripBooking) => void;
}

const GROUPS: { label: string; test: (b: TripBooking) => boolean }[] = [
  { label: 'FLIGHTS', test: (b) => b.kind === 'boarding_pass' },
  { label: 'STAYS', test: (b) => b.kind === 'reservation' && (b.item.type === 'hotel' || b.item.type === 'airbnb') },
  { label: 'RESERVATIONS', test: (b) => b.kind === 'reservation' && b.item.type !== 'hotel' && b.item.type !== 'airbnb' },
];

/** Every wallet booking you've linked to this trip — the only place they show on a Dates TBD trip. */
export function TripBookingsSheet({ visible, bookings, onClose, onBookingPress }: TripBookingsSheetProps) {
  const { colors } = useTheme();
  const handleClose = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
  }, [onClose]);
  const open = useCallback((b: TripBooking) => {
    onClose();
    onBookingPress(b);
  }, [onClose, onBookingPress]);

  const asEntry = (b: TripBooking): DayBooking => ({
    booking: b,
    role: b.kind === 'boarding_pass' ? 'flight' : b.item.type === 'hotel' || b.item.type === 'airbnb' ? 'check_in' : 'booked',
    time: null,
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text.primary }]}>Bookings</Text>
          <TouchableOpacity onPress={handleClose} style={styles.iconBtn} accessibilityLabel="Close">
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>
        <Text style={[styles.note, { color: colors.text.tertiary }]}>Everyone on this trip sees these. Open one of yours to keep it to yourself.</Text>
        <ScrollView contentContainerStyle={styles.content}>
          {GROUPS.map((g) => {
            const items = bookings.filter(g.test);
            if (!items.length) return null;
            return (
              <View key={g.label} style={styles.group}>
                <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{g.label}</Text>
                {items.map((b) => <BookedRow key={`${b.kind}_${b.item.id}`} entry={asEntry(b)} onPress={open} />)}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'] },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 26, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing['2'] },
  note: { fontSize: 13, marginTop: Spacing['1'] },
  content: { paddingTop: Spacing['5'], paddingBottom: Spacing['8'] },
  group: { marginBottom: Spacing['5'] },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginBottom: Spacing['2'] },
});
