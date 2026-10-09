import React, { type ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';
import { AirplaneTilt, Bed, CaretDown, CaretRight, DotsThree, Plus } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { BookedRow } from '@/components/trip/BookedRow';
import type { TripBooking } from '@/utils/bookingDays';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';

interface CitySectionProps {
  name: string;
  /** `NOV 18 – NOV 21 · 3 NIGHTS` */
  eyebrow: string;
  /** Shown while folded: `3 days · 12 stops · hotel booked`. */
  summary: string;
  open: boolean;
  /** Omitted in the one-city view, which never folds. */
  onToggle?: () => void;
  onMenu?: () => void;
  arriving: TripBooking[];
  staying: TripBooking[];
  onBookingPress: (b: TripBooking) => void;
  onAddBooking?: () => void;
  onFindStay?: () => void;
  onAddDay?: () => void;
  children: ReactNode;
}

const asEntry = (booking: TripBooking) => ({ booking, role: 'booked' as const, time: null });

/** One city of a multi-city trip: header, Getting here, Staying, its days (docs/superpowers/specs/2026-10-09-city-route-design.md). */
export function CitySection(p: CitySectionProps) {
  const { colors } = useTheme();
  const Caret = p.open ? CaretDown : CaretRight;
  const light = (fn?: () => void) => () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); fn?.(); };

  return (
    <View style={[styles.section, { borderColor: colors.background.cardBorder }]}>
      <View style={styles.header}>
        <TouchableOpacity
          disabled={!p.onToggle}
          onPress={light(p.onToggle)}
          style={styles.headerMain}
          accessibilityRole={p.onToggle ? 'button' : 'header'}
          accessibilityState={p.onToggle ? { expanded: p.open } : undefined}
          accessibilityLabel={`${p.name}, ${p.eyebrow.toLowerCase()}${p.open ? '' : `, ${p.summary}`}`}
        >
          {p.onToggle && <Caret size={14} color={colors.text.tertiary} weight="bold" />}
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{p.eyebrow}</Text>
            <Text style={[styles.name, { color: colors.text.primary }]} numberOfLines={1}>{p.name}</Text>
            {!p.open && <Text style={[styles.summary, { color: colors.text.tertiary }]}>{p.summary}</Text>}
          </View>
        </TouchableOpacity>
        {p.onMenu && (
          <TouchableOpacity onPress={light(p.onMenu)} style={styles.menu} accessibilityRole="button" accessibilityLabel={`${p.name} options`}>
            <DotsThree size={22} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        )}
      </View>

      {p.open && (
        <Animated.View entering={FadeIn.springify().damping(11).stiffness(65)}>
          <View style={styles.block}>
            <Text style={[styles.blockLabel, { color: colors.text.tertiary }]}>GETTING HERE</Text>
            {p.arriving.length > 0
              ? p.arriving.map((b) => <BookedRow key={`${b.kind}_${b.item.id}`} entry={asEntry(b)} onPress={p.onBookingPress} />)
              : p.onAddBooking && (
                <TouchableOpacity onPress={light(p.onAddBooking)} style={styles.link} accessibilityRole="button">
                  <AirplaneTilt size={16} color={colors.text.secondary} weight="duotone" />
                  <Text style={[styles.linkText, { color: colors.text.secondary }]}>Add how you&apos;re getting here</Text>
                </TouchableOpacity>
              )}
          </View>
          <View style={styles.block}>
            <Text style={[styles.blockLabel, { color: colors.text.tertiary }]}>STAYING</Text>
            {p.staying.length > 0
              ? p.staying.map((b) => <BookedRow key={`${b.kind}_${b.item.id}`} entry={asEntry(b)} onPress={p.onBookingPress} />)
              : (
                <View style={styles.links}>
                  {p.onFindStay && (
                    <TouchableOpacity onPress={light(p.onFindStay)} style={styles.link} accessibilityRole="link">
                      <Bed size={16} color={colors.text.secondary} weight="duotone" />
                      <Text style={[styles.linkText, { color: colors.text.secondary }]}>Find a place to stay</Text>
                    </TouchableOpacity>
                  )}
                  {p.onAddBooking && (
                    <TouchableOpacity onPress={light(p.onAddBooking)} style={styles.link} accessibilityRole="button">
                      <Plus size={14} color={colors.text.secondary} weight="bold" />
                      <Text style={[styles.linkText, { color: colors.text.secondary }]}>Add a booking</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
          </View>
          {p.children}
          {p.onAddDay && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); p.onAddDay?.(); }}
              style={styles.link}
              accessibilityRole="button"
            >
              <Plus size={14} color={colors.text.secondary} weight="bold" />
              <Text style={[styles.linkText, { color: colors.text.secondary }]}>Add a day in {p.name}</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: Spacing['4'], paddingBottom: Spacing['2'] },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], marginBottom: Spacing['2'] },
  headerMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44 },
  headerText: { flex: 1, gap: 2 },
  eyebrow: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9 },
  name: { fontSize: 22, fontWeight: FontWeight.semiBold, letterSpacing: -0.3 },
  summary: { fontSize: 13 },
  menu: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  block: { marginBottom: Spacing['3'], gap: Spacing['1'] },
  blockLabel: { fontSize: 11, fontWeight: FontWeight.medium, letterSpacing: 0.9, marginBottom: Spacing['1'] },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing['4'] },
  link: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'], minHeight: 44 },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium },
});
