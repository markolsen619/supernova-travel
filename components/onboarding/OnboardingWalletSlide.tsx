import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { BoardingPass } from '@/types';
import { Spacing } from '@/constants/spacing';

// There's no public wallet data to query (boarding passes/reservations are
// owner-only) — showing the app's real BoardingPassCard with a sample pass
// is more honest than generic stock photography of a travel document. See
// the onboarding redesign spec's "Wallet slide hero" decision.
const SAMPLE_PASS: BoardingPass = {
  id: 'onboarding-sample',
  ownerUid: 'onboarding-sample',
  airline: 'Nova Air',
  flightNumber: 'NA 214',
  origin: 'SFO',
  originCity: 'San Francisco',
  destination: 'NRT',
  destinationCity: 'Tokyo',
  departureTime: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  seat: '14A',
  boardingGroup: 'B',
  gate: '52',
  barcode: 'SAMPLE',
  status: 'upcoming',
  createdAt: new Date().toISOString(),
};

interface OnboardingWalletSlideProps {
  active: boolean;
}

export function OnboardingWalletSlide({ active }: OnboardingWalletSlideProps) {
  const { width } = useWindowDimensions();

  return (
    <View style={[styles.slide, { width }]}>
      {/* pointerEvents="none" — this is a preview, not a real interactive pass */}
      <View style={styles.cardRegion} pointerEvents="none">
        <BoardingPassCard pass={SAMPLE_PASS} onPress={() => {}} />
      </View>
      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="Travel Wallet"
          title="Every pass, one place"
          body="Boarding passes, hotel reservations, and loyalty cards — no more digging through email."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  cardRegion: { height: '48%', justifyContent: 'center', paddingTop: Spacing['8'] },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
