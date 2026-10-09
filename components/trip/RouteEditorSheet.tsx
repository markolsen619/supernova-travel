import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowDown, ArrowUp, MapPin, Minus, Plus, Trash, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import type { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import { draftFromRows, previewRoute, routeRowsFromTrip, useTripRoute } from '@/hooks/useTripRoute';
import {
  addRow, dropsWarning, moveRow, removeRow, routeDatesLine, setRowNights, type RouteRow,
} from '@/utils/tripRoute';
import { toCalendarDate } from '@/utils/calendarDate';
import type { Destination, TripWithDays } from '@/types';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface RouteEditorSheetProps {
  visible: boolean;
  trip: TripWithDays;
  onClose: () => void;
}

const toDestination = (s: PlaceSelection): Destination => ({
  name: s.name, placeId: s.placeId, lat: s.lat, lng: s.lng, countryCode: s.countryCode, bounds: null,
});

/**
 * Edit a multi-city trip's route: the cities in order, each with its nights
 * (docs/superpowers/specs/2026-10-09-city-route-design.md). Saving moves days
 * and stops with their cities and sets the trip's end date.
 */
export function RouteEditorSheet({ visible, trip, onClose }: RouteEditorSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { saveRoute } = useTripRoute();
  const [rows, setRows] = useState<RouteRow<Destination>[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const nextKey = useRef(0);

  // Fresh from the trip each time the sheet opens.
  useEffect(() => {
    if (visible) setRows(routeRowsFromTrip(trip));
  }, [visible, trip]);

  const start = trip.startDate ? toCalendarDate(trip.startDate.toDate()) : null;
  const names = useMemo(() => [trip.destination.name, ...trip.additionalDestinations.map((d) => d.name)], [trip]);

  const change = useCallback((next: RouteRow<Destination>[]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRows(next);
  }, []);

  const remove = useCallback((i: number) => {
    const row = rows[i];
    if (rows.length <= 1) return;
    const neighbour = i < rows.length - 1 ? rows[i + 1].place.name : rows[i - 1].place.name;
    if (row.from === null) {
      change(removeRow(rows, i, 'delete'));
      return;
    }
    Alert.alert(`Remove ${row.place.name}?`, `What should happen to its ${row.nights} night${row.nights === 1 ? '' : 's'} of days?`, [
      { text: `Move them to ${neighbour}`, onPress: () => change(removeRow(rows, i, 'move')) },
      { text: 'Delete its days', style: 'destructive', onPress: () => change(removeRow(rows, i, 'delete')) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [rows, change]);

  const addCity = useCallback((s: PlaceSelection) => {
    setPickerOpen(false);
    change(addRow(rows, toDestination(s), `new-${nextKey.current++}`));
  }, [rows, change]);

  const save = useCallback(async () => {
    const draft = draftFromRows(rows);
    const plan = previewRoute(trip, draft);
    const commit = async () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSaving(true);
      try {
        await saveRoute(trip, draft);
        onClose();
      } catch (err) {
        console.warn('[route] save failed', err);
        Alert.alert("The route didn't save", 'Check your connection and try again.');
      } finally {
        setSaving(false);
      }
    };
    if (plan.dropsWithStops.length > 0) {
      Alert.alert('Delete these days?', dropsWarning(plan.dropsWithStops, names), [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Delete and save', style: 'destructive', onPress: commit },
      ]);
    } else {
      await commit();
    }
  }, [rows, trip, names, saveRoute, onClose]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.root, { backgroundColor: colors.background.primary }]}>
        <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + Spacing['2'] }]} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{routeDatesLine(start, rows.map((r) => r.nights)).toUpperCase()}</Text>
              <Text style={[styles.title, { color: colors.text.primary }]}>Your route</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close">
              <X size={22} color={colors.text.secondary} weight="bold" />
            </TouchableOpacity>
          </View>
          <Text style={[styles.lede, { color: colors.text.secondary }]}>
            Set how many nights you spend in each city. Days and stops move with their city, and the trip ends when the last city does.
          </Text>

          {rows.map((row, i) => (
            <View key={row.key} style={[styles.row, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
              <View style={styles.rowTop}>
                <MapPin size={18} color={colors.text.secondary} weight="duotone" />
                <Text style={[styles.city, { color: colors.text.primary }]} numberOfLines={1}>{row.place.name}</Text>
                <TouchableOpacity onPress={() => change(moveRow(rows, i, -1))} disabled={i === 0} style={styles.iconBtn} accessibilityLabel={`Move ${row.place.name} earlier`}>
                  <ArrowUp size={16} color={i === 0 ? colors.text.disabled : colors.text.primary} weight="bold" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => change(moveRow(rows, i, 1))} disabled={i === rows.length - 1} style={styles.iconBtn} accessibilityLabel={`Move ${row.place.name} later`}>
                  <ArrowDown size={16} color={i === rows.length - 1 ? colors.text.disabled : colors.text.primary} weight="bold" />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(i)} disabled={rows.length <= 1} style={styles.iconBtn} accessibilityLabel={`Remove ${row.place.name}`}>
                  <Trash size={16} color={rows.length <= 1 ? colors.text.disabled : colors.semantic.error} weight="bold" />
                </TouchableOpacity>
              </View>
              <View style={styles.nightsRow}>
                <TouchableOpacity onPress={() => change(setRowNights(rows, i, row.nights - 1))} disabled={row.nights <= 1}
                  style={[styles.stepper, { backgroundColor: colors.background.sunken }]} accessibilityLabel={`One night fewer in ${row.place.name}`}>
                  <Minus size={16} color={row.nights <= 1 ? colors.text.disabled : colors.text.primary} weight="bold" />
                </TouchableOpacity>
                <Text style={[styles.nights, { color: colors.text.primary }]}>{row.nights} night{row.nights === 1 ? '' : 's'}</Text>
                <TouchableOpacity onPress={() => change(setRowNights(rows, i, row.nights + 1))}
                  style={[styles.stepper, { backgroundColor: colors.background.sunken }]} accessibilityLabel={`One more night in ${row.place.name}`}>
                  <Plus size={16} color={colors.text.primary} weight="bold" />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.addCity} accessibilityRole="button">
            <Plus size={16} color={colors.text.primary} weight="bold" />
            <Text style={[styles.addCityText, { color: colors.text.primary }]}>Add a city</Text>
          </TouchableOpacity>
        </ScrollView>
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing['4'], borderColor: colors.background.cardBorder }]}>
          <Button label="Save route" onPress={save} loading={saving} haptic="none" />
        </View>
      </View>
      <DestinationPicker visible={pickerOpen} onSelect={addCity} onClose={() => setPickerOpen(false)} />
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: Spacing['5'], paddingBottom: Spacing['8'], gap: Spacing['3'] },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing['3'], marginTop: Spacing['4'] },
  headerText: { flex: 1, gap: 4 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: 28, fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  lede: { fontSize: 15, lineHeight: 22, marginBottom: Spacing['2'] },
  row: { borderRadius: BorderRadius.xl, borderWidth: StyleSheet.hairlineWidth, padding: Spacing['4'], gap: Spacing['3'] },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  city: { flex: 1, fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  iconBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  nightsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing['4'] },
  stepper: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  nights: { fontSize: FontSize.md, fontWeight: FontWeight.medium, minWidth: 80, textAlign: 'center' },
  addCity: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44, alignSelf: 'flex-start' },
  addCityText: { fontSize: FontSize.md, fontWeight: FontWeight.medium },
  footer: { paddingHorizontal: Spacing['5'], paddingTop: Spacing['3'], borderTopWidth: StyleSheet.hairlineWidth },
});
