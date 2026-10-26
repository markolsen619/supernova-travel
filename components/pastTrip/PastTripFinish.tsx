/**
 * The past-trip finish screen (spec 2026-10-25): "Your {city} trip is saved." with Make the video (primary),
 * Post to the feed and View trip. Photos that didn't upload can be tried again from here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { CheckCircle } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { SPRING } from '@/constants/motion';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { PastTripDraft } from '@/utils/pastTrip';
import type { SavedPastTrip } from '@/services/pastTrip';

export function PastTripFinish({ draft, saved, onRetry }: { draft: PastTripDraft; saved: SavedPastTrip; onRetry: () => Promise<void> }) {
  const { colors } = useTheme();
  const [retrying, setRetrying] = useState(false);
  const scale = useRef(new Animated.Value(0.6)).current;
  useEffect(() => { Animated.spring(scale, { toValue: 1, ...SPRING, useNativeDriver: true }).start(); }, [scale]);

  const city = draft.cities[0]?.name;
  const failed = saved.failed.length;
  // Finish the modal flow first (Architecture Rule 15), then open where they chose.
  const open = useCallback((path: string) => {
    if (router.canDismiss()) router.dismissAll();
    router.push(path as never);
  }, []);
  const retry = useCallback(async () => { setRetrying(true); await onRetry(); setRetrying(false); }, [onRetry]);

  return (
    <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
      <Animated.View style={{ transform: [{ scale }] }}>
        <CheckCircle size={44} weight="duotone" color={colors.accent.teal} />
      </Animated.View>
      <Text style={[styles.title, { color: colors.text.primary }]}>{city ? `Your ${city} trip is saved.` : 'Your trip is saved.'}</Text>
      <Text style={[styles.body, { color: colors.text.secondary }]}>Your photos are on their stops, ready for the playback and the video.</Text>
      {failed > 0 && (
        <Pressable onPress={retry} disabled={retrying} style={styles.retry} accessibilityRole="button" accessibilityLabel="Try uploading the photos again">
          <Text style={[styles.body, { color: colors.semantic.error }]}>
            {failed} {failed === 1 ? "photo didn't" : "photos didn't"} upload · {retrying ? 'Trying…' : 'Try again'}
          </Text>
        </Pressable>
      )}
      <View style={styles.actions}>
        <Button label="Make the video" onPress={() => open(`/trip/${saved.tripId}?video=1`)} fullWidth />
        <Button label="Post to the feed" variant="secondary" onPress={() => open('/post/create-photo')} fullWidth />
        <Pressable onPress={() => open(`/trip/${saved.tripId}`)} style={styles.link} accessibilityRole="link" accessibilityLabel="View trip">
          <Text style={[styles.linkText, { color: colors.text.secondary }]}>View trip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['6'], gap: Spacing['3'] },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5, textAlign: 'center' },
  body: { fontSize: FontSize.base, lineHeight: 22, textAlign: 'center' },
  retry: { minHeight: 44, justifyContent: 'center' },
  actions: { alignSelf: 'stretch', gap: Spacing['3'], marginTop: Spacing['4'] },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
});
