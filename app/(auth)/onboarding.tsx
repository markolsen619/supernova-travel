import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  ListRenderItemInfo,
  NativeSyntheticEvent,
  NativeScrollEvent,
  Animated,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { useTheme } from '@/hooks/useTheme';
import { useOnboardingContent } from '@/hooks/useOnboardingContent';
import { OnboardingPhotoSlide } from '@/components/onboarding/OnboardingPhotoSlide';
import { OnboardingWalletSlide } from '@/components/onboarding/OnboardingWalletSlide';
import { OnboardingCommunitySlide } from '@/components/onboarding/OnboardingCommunitySlide';
import { OnboardingProSlide } from '@/components/onboarding/OnboardingProSlide';
import { Button } from '@/components/ui/Button';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';

const SLIDE_COUNT = 5;
const SLIDE_INDEXES = [0, 1, 2, 3, 4];

function markOnboardingComplete() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  // Do NOT await this write. services/firebase.ts uses plain getFirestore
  // with no offline persistence configured, so this promise does not resolve
  // from a local queue — it hangs until the server acknowledges. Awaiting it
  // would strand an offline user on this screen after tapping "Get started"
  // with no feedback. Fire-and-forget worst case: they see onboarding once
  // more next launch — annoying, not a hang.
  updateDoc(doc(db, 'users', uid), { hasSeenOnboarding: true })
    .catch((error) => console.warn('[onboarding] failed to persist hasSeenOnboarding:', error));
}

function DotItem({ active }: { active: boolean }) {
  const { colors } = useTheme();
  const width = useRef(new Animated.Value(active ? 24 : 8)).current;

  useEffect(() => {
    Animated.spring(width, { toValue: active ? 24 : 8, ...SPRING, useNativeDriver: false }).start();
  }, [active, width]);

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: active ? colors.text.primary : colors.background.cardBorder, width },
      ]}
    />
  );
}

export default function OnboardingScreen() {
  const { colors } = useTheme();
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<number>>(null);
  const scrollX = useRef(new Animated.Value(0)).current;
  const content = useOnboardingContent();

  const handleFinish = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    markOnboardingComplete();
    router.replace('/(tabs)');
  }, []);

  const handleSeePlans = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markOnboardingComplete();
    router.replace('/paywall');
  }, []);

  const handleNext = useCallback(() => {
    if (activeIndex < SLIDE_COUNT - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      handleFinish();
    }
  }, [activeIndex, handleFinish]);

  const handleSkip = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    markOnboardingComplete();
    router.replace('/(tabs)');
  }, []);

  const onMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
      setActiveIndex(newIndex);
    },
    [width]
  );

  const renderSlide = useCallback(
    ({ item: index }: ListRenderItemInfo<number>) => {
      const active = index === activeIndex;
      switch (index) {
        case 0:
          return (
            <OnboardingPhotoSlide
              heroSource={content.exploreCoverUrl ? { uri: content.exploreCoverUrl } : null}
              eyebrow="Explore"
              title="Explore the world"
              body="Discover trending destinations, hidden gems, and trip ideas from real travelers."
              active={active}
              scrollX={scrollX}
              index={index}
            />
          );
        case 1:
          return (
            <OnboardingPhotoSlide
              heroSource={content.aiCoverUrl ? { uri: content.aiCoverUrl } : null}
              eyebrow="AI Itineraries"
              title="A full plan, in seconds"
              body="Tell us where you're headed — AI builds the day-by-day."
              active={active}
              scrollX={scrollX}
              index={index}
            />
          );
        case 2:
          return <OnboardingWalletSlide active={active} />;
        case 3:
          return (
            <OnboardingCommunitySlide
              avatars={content.communityAvatars}
              active={active}
              scrollX={scrollX}
              index={index}
            />
          );
        default:
          return <OnboardingProSlide active={active} />;
      }
    },
    [activeIndex, content.exploreCoverUrl, content.aiCoverUrl, content.communityAvatars, scrollX]
  );

  const isLast = activeIndex === SLIDE_COUNT - 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={[styles.skipText, { color: colors.text.secondary }]}>Skip</Text>
        </TouchableOpacity>
      )}

      <Animated.FlatList
        ref={listRef}
        data={SLIDE_INDEXES}
        keyExtractor={(i) => String(i)}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: true }
        )}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.flatList}
        bounces={false}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
      />

      <View style={styles.controls}>
        <View style={styles.dots}>
          {SLIDE_INDEXES.map((i) => (
            <DotItem key={i} active={i === activeIndex} />
          ))}
        </View>

        <Button
          label={isLast ? 'Get started' : 'Next'}
          onPress={handleNext}
          variant="primary"
          size="lg"
          fullWidth
          haptic="none"
        />

        {isLast ? (
          <TouchableOpacity onPress={handleSeePlans} activeOpacity={0.7} style={styles.seePlans}>
            <Text style={[styles.seePlansText, { color: colors.text.secondary }]}>See plans</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  skipBtn: {
    position: 'absolute',
    top: 60,
    right: Spacing['6'],
    zIndex: 10,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  skipText: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  flatList: { flex: 1 },
  controls: { paddingHorizontal: Spacing['6'], paddingBottom: 48, gap: Spacing['5'] },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: Spacing['2'] },
  dot: { height: 8, borderRadius: 4 },
  seePlans: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
    paddingVertical: Spacing['2'],
  },
  seePlansText: { fontSize: FontSize.sm, fontWeight: FontWeight.medium, textDecorationLine: 'underline' },
});
