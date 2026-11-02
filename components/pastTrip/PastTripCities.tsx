/**
 * "Where was this trip?" — asked when no picked photo says where it was taken (Android's photo picker removes
 * every location; owner 2026-11-02, option a). The cities, in order, give each day its place and centre the
 * search when the traveler names each stop on review.
 */
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MapPin, MapTrifold, Plus, X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { DestinationPicker } from '@/components/ui/DestinationPicker';
import type { PlaceSelection } from '@/hooks/usePlaceAutocomplete';
import type { DraftCity } from '@/utils/pastTrip';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';

export function PastTripCities({ dayCount, onContinue, onCancel }: {
  dayCount: number; onContinue: (cities: DraftCity[]) => void; onCancel: () => void;
}) {
  const { colors } = useTheme();
  const [cities, setCities] = useState<DraftCity[]>([]);
  const [picking, setPicking] = useState(false);

  const openPicker = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setPicking(true); }, []);
  const closePicker = useCallback(() => setPicking(false), []);
  const add = useCallback((p: PlaceSelection) => {
    setPicking(false);
    if (p.lat == null || p.lng == null) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setCities((c) => [...c, { name: p.name, lat: p.lat!, lng: p.lng!, countryCode: p.countryCode }]);
  }, []);
  const remove = useCallback((i: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCities((c) => c.filter((_, j) => j !== i));
  }, []);
  const go = useCallback(() => onContinue(cities), [onContinue, cities]);

  return (
    <ScreenEntrance>
      <ScrollView style={{ backgroundColor: colors.background.primary }} contentContainerStyle={styles.body}>
        <MapTrifold size={44} weight="duotone" color={colors.brand.purple} />
        <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{`${dayCount} ${dayCount === 1 ? 'DAY' : 'DAYS'} OF PHOTOS`}</Text>
        <Text style={[styles.title, { color: colors.text.primary }]}>Where was this trip?</Text>
        <Text style={[styles.text, { color: colors.text.secondary }]}>
          {"These photos don't say where they were taken. Add the cities you visited, in order — then you can name each stop."}
        </Text>

        {cities.map((c, i) => (
          <View key={`${c.name}-${i}`} style={[styles.city, { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder }]}>
            <MapPin size={20} weight="duotone" color={colors.brand.purple} />
            <Text style={[styles.cityName, { color: colors.text.primary }]} numberOfLines={1}>{c.name}</Text>
            <Pressable onPress={() => remove(i)} hitSlop={12} style={styles.remove} accessibilityRole="button" accessibilityLabel={`Remove ${c.name}`}>
              <X size={16} weight="bold" color={colors.text.tertiary} />
            </Pressable>
          </View>
        ))}

        <Pressable onPress={openPicker} style={styles.add} accessibilityRole="button" accessibilityLabel={cities.length ? 'Add another city' : 'Add a city'}>
          <Plus size={18} weight="bold" color={colors.text.primary} />
          <Text style={[styles.addText, { color: colors.text.primary }]}>{cities.length ? 'Add another city' : 'Add a city'}</Text>
        </Pressable>

        <View style={styles.actions}>
          <Button label="Continue" onPress={go} disabled={!cities.length} fullWidth />
          <Pressable onPress={onCancel} style={styles.cancel} accessibilityRole="button" accessibilityLabel="Pick other photos">
            <Text style={[styles.cancelText, { color: colors.text.secondary }]}>Pick other photos</Text>
          </Pressable>
        </View>
      </ScrollView>
      <DestinationPicker visible={picking} onSelect={add} onClose={closePicker} />
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, paddingHorizontal: Spacing['5'], paddingTop: Spacing['8'], paddingBottom: Spacing['8'], gap: Spacing['3'] },
  eyebrow: { fontSize: FontSize.xs, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5 },
  text: { fontSize: FontSize.base, lineHeight: 22, marginBottom: Spacing['2'] },
  city: { flexDirection: 'row', alignItems: 'center', gap: Spacing['3'], paddingHorizontal: Spacing['4'], minHeight: 52, borderRadius: BorderRadius.lg, borderWidth: StyleSheet.hairlineWidth },
  cityName: { flex: 1, fontSize: FontSize.base, fontWeight: FontWeight.medium },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -Spacing['3'] },
  add: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44 },
  addText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  actions: { marginTop: 'auto', paddingTop: Spacing['6'], gap: Spacing['2'] },
  cancel: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  cancelText: { fontSize: FontSize.sm },
});
