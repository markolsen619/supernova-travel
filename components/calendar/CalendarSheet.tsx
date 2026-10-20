import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Modal, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useCalendarFeed } from '@/hooks/useCalendarFeed';
import { Button } from '@/components/ui/Button';
import { SettingsRow } from '@/components/settings/SettingsRow';
import { requireOnline } from '@/services/offline';
import { feedHttpsUrl, feedWebcalUrl, googleCalendarAddUrl } from '@/utils/calendarLinks';
import type { CalTypes } from '@/services/calendar';

const TYPE_ROWS: { key: keyof CalTypes; label: string }[] = [
  { key: 'flights', label: 'Flights' },
  { key: 'stays', label: 'Hotels & stays' },
  { key: 'dining', label: 'Restaurants & activities' },
  { key: 'transit', label: 'Trains, buses & ferries' },
  { key: 'tripDays', label: 'Trip days' },
];

/**
 * Your trips in your calendar (spec docs/superpowers/specs/2026-10-19-calendar-feed-design.md §3): turn the private
 * link on, add it to Apple or Google Calendar once, choose what shows, make a new link or turn it off.
 */
export function CalendarSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token, types, isLoading, turnOn, rotate, turnOff, setType } = useCalendarFeed();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  const run = useCallback(async (action: () => Promise<unknown>, failure: string) => {
    if (!requireOnline()) return;
    setWorking(true);
    setError(null);
    try {
      await action();
    } catch {
      setError(failure);
    } finally {
      setWorking(false);
    }
  }, []);

  const handleTurnOn = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    run(turnOn, "Couldn't turn it on. Try again.");
  }, [run, turnOn]);

  const handleApple = useCallback(() => {
    if (!token) return;
    Linking.openURL(feedWebcalUrl(token)).catch(() => setError("Couldn't open Calendar. Copy the link instead."));
  }, [token]);

  const handleGoogle = useCallback(() => {
    if (!token) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Linking.openURL(googleCalendarAddUrl(token)).catch(() => setError("Couldn't open Google Calendar. Copy the link instead."));
  }, [token]);

  const handleCopy = useCallback(async () => {
    if (!token) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await Clipboard.setStringAsync(feedHttpsUrl(token));
    setCopied(true);
  }, [token]);

  const handleType = useCallback((key: keyof CalTypes, value: boolean) => {
    if (!requireOnline()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setType(key, value).catch(() => setError("Couldn't save that. Try again."));
  }, [setType]);

  const handleNewLink = useCallback(() => {
    Alert.alert('Make a new link?', 'The old link stops working, so calendars using it stop updating.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Make a new link', onPress: () => run(rotate, "Couldn't make a new link. Try again.") },
    ]);
  }, [run, rotate]);

  const handleTurnOff = useCallback(() => {
    Alert.alert('Turn off the calendar?', 'Your calendar stops showing Supernova trips.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Turn off', style: 'destructive', onPress: () => run(turnOff, "Couldn't turn it off. Try again.") },
    ]);
  }, [run, turnOff]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.fill, { backgroundColor: colors.background.primary }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>CALENDAR</Text>
            <Text style={[styles.title, { color: colors.text.primary }]} accessibilityRole="header">Your trips in your calendar</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.text.secondary} weight="bold" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}>
          {!token ? (
            <>
              <Text style={[styles.body, { color: colors.text.secondary }]}>
                Flights, stays and each day of your trips, kept up to date in the calendar app you already use. Free.
              </Text>
              <Button label="Turn on" onPress={handleTurnOn} loading={working} disabled={isLoading} />
            </>
          ) : (
            <>
              {Platform.OS === 'ios' ? <Button label="Add to Apple Calendar" onPress={handleApple} haptic="light" /> : null}
              <Button
                label="Add to Google Calendar"
                variant={Platform.OS === 'ios' ? 'secondary' : 'primary'}
                onPress={handleGoogle}
              />
              {/* Google adds calendars by link only on the web on a computer (final review, 2026-10-19). */}
              <Text style={[styles.caption, { color: colors.text.tertiary }]}>
                If Google Calendar doesn&apos;t add it on your phone, copy the link and add it on a computer: Other calendars → From URL.
              </Text>
              <TouchableOpacity onPress={handleCopy} style={styles.link} accessibilityRole="button">
                <Text style={[styles.linkText, { color: colors.text.primary }]}>{copied ? 'Copied' : 'Copy link'}</Text>
              </TouchableOpacity>

              <Text style={[styles.section, { color: colors.text.tertiary }]}>SHOW IN YOUR CALENDAR</Text>
              <View style={[styles.card, { backgroundColor: colors.background.card }]}>
                {TYPE_ROWS.map((row, i) => (
                  <SettingsRow
                    key={row.key}
                    label={row.label}
                    showDivider={i < TYPE_ROWS.length - 1}
                    accessory={
                      <Switch
                        value={types[row.key]}
                        onValueChange={(v) => handleType(row.key, v)}
                        accessibilityLabel={row.label}
                      />
                    }
                  />
                ))}
              </View>
              <Text style={[styles.caption, { color: colors.text.tertiary }]}>
                Gmail or your airline may already add flights and hotels to your calendar. Turn them off here so nothing shows twice.
              </Text>

              <View style={styles.footerLinks}>
                <TouchableOpacity onPress={handleNewLink} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: colors.text.secondary }]}>New link</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleTurnOff} style={styles.link} accessibilityRole="button">
                  <Text style={[styles.linkText, { color: colors.semantic.error }]}>Turn off</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          {error ? <Text style={[styles.caption, { color: colors.semantic.error }]}>{error}</Text> : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 20, paddingTop: 12, gap: 12 },
  body: { fontSize: 15, lineHeight: 22 },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: 15, fontWeight: '500' },
  section: { fontSize: 11, fontWeight: '500', letterSpacing: 0.9, marginTop: 12 },
  card: { borderRadius: 16, overflow: 'hidden' },
  caption: { fontSize: 13, lineHeight: 18 },
  footerLinks: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 8 },
});
