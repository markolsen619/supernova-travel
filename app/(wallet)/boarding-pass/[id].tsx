import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Animated,
} from 'react-native';
import { useRef } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ArrowLeft, AirplaneTilt } from 'phosphor-react-native';
import { EmptyState } from '@/components/ui/EmptyState';
import { useTheme } from '@/hooks/useTheme';
import { StarMark } from '@/components/ui/StarMark';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { BoardingPassCard } from '@/components/wallet/BoardingPassCard';
import { BarcodeDisplay } from '@/components/wallet/BarcodeDisplay';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import type { BoardingPass } from '@/types';

const CARD_HEIGHT = 200;

function FlippableCard({ pass }: { pass: BoardingPass }) {
  const { colors } = useTheme();
  const flipValue = useRef(new Animated.Value(0)).current;
  const isFlipped = useRef(false);

  const handleFlip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    isFlipped.current = !isFlipped.current;
    Animated.spring(flipValue, {
      toValue: isFlipped.current ? 1 : 0,
      ...SPRING,
    }).start();
  };

  const frontRotateY = flipValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotateY  = flipValue.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });

  const frontAnimStyle = {
    transform: [{ perspective: 1000 }, { rotateY: frontRotateY }],
    backfaceVisibility: 'hidden' as const,
  };
  const backAnimStyle = {
    transform: [{ perspective: 1000 }, { rotateY: backRotateY }],
    backfaceVisibility: 'hidden' as const,
  };

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPress={handleFlip}
      style={[styles.flipContainer, { height: CARD_HEIGHT }]}
    >
      {/* Front — boarding pass card */}
      <Animated.View style={[StyleSheet.absoluteFill, frontAnimStyle]}>
        <BoardingPassCard pass={pass} onPress={() => {}} />
      </Animated.View>

      {/* Back — barcode */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          styles.backFace,
          { backgroundColor: colors.background.card, borderColor: colors.background.cardBorder },
          backAnimStyle,
        ]}
      >
        <BarcodeDisplay barcode={pass.barcode!} />
        <Text style={[styles.flipHint, { color: colors.text.tertiary }]}>Tap to flip back</Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

export default function BoardingPassDetailScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { boardingPasses, deletePass } = useBoardingPasses();

  const pass = boardingPasses.find((p) => p.id === id);

  const handleBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleDelete = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(
      'Delete boarding pass',
      'Are you sure you want to delete this boarding pass?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            if (pass) {
              deletePass.mutate(pass.id, {
                onSuccess: () => router.back(),
              });
            }
          },
        },
      ],
    );
  };

  if (!pass) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <View
          style={[
            styles.header,
            { paddingTop: insets.top + Spacing['4'], borderBottomColor: colors.background.cardBorder },
          ]}
        >
          <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Back">
            <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
          </TouchableOpacity>
          <View style={styles.titleGroup}>
            <StarMark size={18} />
            <Text style={[styles.title, { color: colors.text.primary }]}>Boarding pass</Text>
          </View>
          <View style={styles.backButton} />
        </View>
        <View style={styles.centered}>
          <EmptyState
            icon={AirplaneTilt}
            title="This pass isn't here"
            description="It may have been deleted or the link is out of date."
            actionLabel="Back to wallet"
            onAction={handleBack}
            actionHaptic="none"
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + Spacing['4'],
            borderBottomColor: colors.background.cardBorder,
          },
        ]}
      >
        <TouchableOpacity onPress={handleBack} style={styles.backButton} accessibilityLabel="Back">
          <ArrowLeft size={20} color={colors.text.primary} weight="regular" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text.primary }]}>Boarding pass</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingTop: Spacing['4'], paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Pass card — flippable when barcode exists */}
        {pass.barcode ? (
          <View style={styles.flipWrapper}>
            <FlippableCard pass={pass} />
          </View>
        ) : (
          <BoardingPassCard pass={pass} onPress={() => {}} />
        )}

        {/* Delete button */}
        <TouchableOpacity
          style={[styles.deleteButton, { borderColor: colors.semantic.error }]}
          onPress={handleDelete}
          activeOpacity={0.8}
        >
          <Text style={[styles.deleteButtonText, { color: colors.semantic.error }]}>
            Delete boarding pass
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['4'],
    borderBottomWidth: 1,
  },
  backButton: {
    width: 44,
    minHeight: 44,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing['2'] },
  starIcon: { width: 18, height: 18 },
  title: {
    fontSize: FontSize.lg,
    fontWeight: FontWeight.semiBold,
  },
  scroll: {
    flex: 1,
  },
  flipWrapper: {
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['4'],
    height: CARD_HEIGHT,
  },
  flipContainer: {
    width: '100%',
  },
  backFace: {
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['3'],
    padding: Spacing['4'],
  },
  flipHint: {
    fontSize: FontSize.xs,
    letterSpacing: 0.5,
  },
  deleteButton: {
    marginHorizontal: Spacing['4'],
    marginTop: Spacing['4'],
    borderWidth: 1,
    borderRadius: BorderRadius.xl,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  deleteButtonText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notFoundText: {
    fontSize: FontSize.base,
  },
});
