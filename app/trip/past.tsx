/**
 * "Add a trip you've taken" — the whole flow in one modal so the draft stays in memory until Save
 * (spec docs/superpowers/specs/2026-10-25-past-trips-from-photos-design.md). The building and saving steps are
 * an always-dark immersive moment, like AI generation (Architecture Rule 3).
 */
import { useCallback } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from 'expo-router';
import { usePreventRemove } from '@react-navigation/native';
import { Images } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { Button } from '@/components/ui/Button';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { AiGeneratingAnimation } from '@/components/trip/AiGeneratingAnimation';
import { useAiConsentGate } from '@/components/ai/useAiConsentGate';
import { usePastTripBuilder } from '@/hooks/usePastTripBuilder';
import { PastTripReview } from '@/components/pastTrip/PastTripReview';
import { PastTripFinish } from '@/components/pastTrip/PastTripFinish';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { MAX_PICK } from '@/utils/pastTrip';

const STEPS = ['Reading your photos', 'Finding places', 'Writing your story'];

export default function PastTripScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation();
  const { requireConsent, consentSheet } = useAiConsentGate();
  const withConsent = useCallback((action: () => void, onDismiss: () => void) => requireConsent('agent', action, onDismiss), [requireConsent]);
  const b = usePastTripBuilder(withConsent);

  // Leaving mid-review loses the draft: ask first.
  usePreventRemove(b.phase === 'review', ({ data }) => {
    Alert.alert('Discard this trip?', 'Nothing has been saved yet.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });

  if (b.phase === 'building' || b.phase === 'saving') {
    const saving = b.phase === 'saving';
    return (
      <View style={[styles.center, { backgroundColor: DarkColors.background.primary }]}>
        <AiGeneratingAnimation
          status={saving ? 'Adding your photos to each stop' : STEPS[b.step]}
          progress={Math.min(0.95, saving ? b.progress : (b.step + (b.step === 1 ? b.progress : 0)) / 3)}
          finishing={false}
        />
        <Text style={[styles.title, { color: DarkColors.text.primary }]}>{saving ? 'Saving your trip' : 'Building your trip'}</Text>
        {consentSheet}
      </View>
    );
  }

  if (b.phase === 'review' && b.draft) {
    return (
      <>
        <PastTripReview draft={b.draft} onEdit={b.edit} onSave={b.save} error={b.error} noLocations={b.noLocations} />
        {consentSheet}
      </>
    );
  }

  if (b.phase === 'done' && b.result && b.draft) {
    return <PastTripFinish draft={b.draft} saved={b.result.saved} onRetry={b.retryUploads} />;
  }

  return (
    <ScreenEntrance>
      <View style={[styles.center, { backgroundColor: colors.background.primary }]}>
        <Images size={44} weight="duotone" color={colors.brand.purple} />
        <Text style={[styles.title, { color: colors.text.primary }]}>{"Add a trip you've taken"}</Text>
        <Text style={[styles.body, { color: colors.text.secondary }]}>
          {"Pick the trip's best photos. We use when and where they were taken to build it — locations never leave your phone."}
        </Text>
        {b.error ? <Text style={[styles.body, { color: colors.semantic.error }]}>{b.error}</Text> : null}
        <View style={styles.action}>
          <Button label="Pick photos" onPress={b.pick} fullWidth />
          <Text style={[styles.caption, { color: colors.text.tertiary }]}>Up to {MAX_PICK} photos</Text>
        </View>
        {consentSheet}
      </View>
    </ScreenEntrance>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing['6'], gap: Spacing['3'] },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.semiBold, letterSpacing: -0.5, textAlign: 'center' },
  body: { fontSize: FontSize.base, lineHeight: 22, textAlign: 'center' },
  action: { alignSelf: 'stretch', alignItems: 'center', gap: Spacing['2'], marginTop: Spacing['4'] },
  caption: { fontSize: FontSize.sm },
});
