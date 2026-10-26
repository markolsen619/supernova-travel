/**
 * The past-trip review's bottom sheets (spec 2026-10-25): a stop's actions (rename, change place, merge with the
 * stop before, delete) and "Move to…" (a photo onto a stop). Tap-then-pick rather than drag (plan ruling).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { SPRING } from '@/constants/motion';
import { FontSize, FontWeight } from '@/constants/typography';
import { BorderRadius, Spacing } from '@/constants/spacing';
import { searchPlaceInBounds } from '@/services/places/mapboxSearch';
import type { DraftStop } from '@/utils/pastTrip';
import type { PastTripEdit } from '@/utils/pastTripEdits';

function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(400)).current;
  useEffect(() => {
    if (visible) { y.setValue(400); Animated.spring(y, { toValue: 0, ...SPRING, useNativeDriver: true }).start(); }
  }, [visible, y]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View style={[styles.sheet, { backgroundColor: colors.background.primary, paddingBottom: insets.bottom + Spacing['4'], transform: [{ translateY: y }] }]}>
          <Text style={[styles.title, { color: colors.text.primary }]}>{title}</Text>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({ label, onPress, destructive }: { label: string; onPress: () => void; destructive?: boolean }) {
  const { colors } = useTheme();
  return (
    <Pressable onPress={onPress} style={[styles.row, { borderBottomColor: colors.background.cardBorder }]} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={[styles.rowText, { color: destructive ? colors.semantic.error : colors.text.primary }]}>{label}</Text>
    </Pressable>
  );
}

type Mode = 'menu' | 'rename' | 'place';

export function StopActionsSheet({ stop, canMerge, onEdit, onClose }: {
  stop: DraftStop | null; canMerge: boolean; onEdit: (e: PastTripEdit) => void; onClose: () => void;
}) {
  const { colors } = useTheme();
  const [mode, setMode] = useState<Mode>('menu');
  const [text, setText] = useState('');
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  useEffect(() => { setMode('menu'); setText(stop?.name ?? ''); setNotFound(false); }, [stop]);

  const close = useCallback(() => { setMode('menu'); onClose(); }, [onClose]);
  const act = useCallback((e: PastTripEdit, heavy = false) => {
    Haptics.impactAsync(heavy ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
    onEdit(e);
    close();
  }, [onEdit, close]);

  const findPlace = useCallback(async () => {
    if (!stop || !text.trim()) return;
    setSearching(true); setNotFound(false);
    const d = 0.05; // ~5 km around the stop: the place is where the photos were taken
    const found = await searchPlaceInBounds(text.trim(), [stop.lng - d, stop.lat - d, stop.lng + d, stop.lat + d], { lat: stop.lat, lng: stop.lng });
    setSearching(false);
    if (!found) { setNotFound(true); return; }
    act({ type: 'place', stopId: stop.id, name: found.name, placeName: found.name, lat: found.lat, lng: found.lng });
  }, [stop, text, act]);

  if (!stop) return null;
  return (
    <Sheet visible={!!stop} onClose={close} title={mode === 'rename' ? 'Rename this stop' : mode === 'place' ? 'Change the place' : stop.name}>
      {mode === 'menu' && (
        <View>
          <Row label="Rename" onPress={() => setMode('rename')} />
          <Row label="Change place" onPress={() => { setText(''); setMode('place'); }} />
          {canMerge && <Row label="Merge with the stop before" onPress={() => act({ type: 'mergeWithPrevious', stopId: stop.id })} />}
          <Row label="Delete stop" destructive onPress={() => act({ type: 'deleteStop', stopId: stop.id }, true)} />
        </View>
      )}
      {mode !== 'menu' && (
        <View style={styles.form}>
          <TextInput
            value={text}
            onChangeText={setText}
            autoFocus
            maxLength={80}
            placeholder={mode === 'place' ? 'Search for the place' : 'Stop name'}
            placeholderTextColor={colors.text.tertiary}
            returnKeyType={mode === 'place' ? 'search' : 'done'}
            onSubmitEditing={mode === 'place' ? findPlace : () => text.trim() && act({ type: 'rename', stopId: stop.id, name: text.trim() })}
            style={[styles.input, { color: colors.text.primary, backgroundColor: colors.background.sunken }]}
            accessibilityLabel={mode === 'place' ? 'Search for the place' : 'Stop name'}
          />
          {notFound && <Text style={{ color: colors.text.secondary }}>{"Couldn't find that near these photos. Try another name."}</Text>}
          <Pressable
            onPress={mode === 'place' ? findPlace : () => text.trim() && act({ type: 'rename', stopId: stop.id, name: text.trim() })}
            style={[styles.primary, { backgroundColor: colors.text.primary }]}
            accessibilityRole="button"
            accessibilityLabel={mode === 'place' ? 'Find the place' : 'Save the name'}
          >
            {searching ? <ActivityIndicator color={colors.background.primary} /> : (
              <Text style={[styles.primaryText, { color: colors.background.primary }]}>{mode === 'place' ? 'Find the place' : 'Save the name'}</Text>
            )}
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}

export function MoveToStopSheet({ visible, stops, onPick, onClose }: {
  visible: boolean; stops: (DraftStop & { dayIndex: number })[]; onPick: (stopId: string) => void; onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title="Move to…">
      <ScrollView style={styles.list}>
        {stops.map((s) => (
          <Row key={s.id} label={`Day ${s.dayIndex + 1} · ${s.time} · ${s.name}`} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPick(s.id); }} />
        ))}
      </ScrollView>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, paddingHorizontal: Spacing['5'], paddingTop: Spacing['5'], maxHeight: '75%' },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold, marginBottom: Spacing['2'] },
  row: { minHeight: 52, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: FontSize.base },
  form: { gap: Spacing['3'], paddingTop: Spacing['2'] },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: Spacing['4'], fontSize: FontSize.base },
  primary: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { fontSize: FontSize.base, fontWeight: FontWeight.semiBold },
  list: { maxHeight: 420 },
});
