import { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useWindowDimensions,
  ListRenderItemInfo,
} from 'react-native';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Globe,
  Sparkle,
  MapPin,
  Users,
  RocketLaunch,
} from 'phosphor-react-native';
import { Button } from '@/components/ui/Button';
import { DarkColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

type PhosphorIcon = typeof Globe;

interface Slide {
  id: string;
  Icon: PhosphorIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  glowColor: string;
}

const SLIDES: Slide[] = [
  {
    id: '1',
    Icon: Globe,
    iconColor: '#a78bfa',
    iconBg: 'rgba(167,139,250,0.15)',
    title: 'Explore the World',
    body: 'Discover trending destinations, hidden gems, and trip ideas from real travelers.',
    glowColor: 'rgba(120,80,255,0.22)',
  },
  {
    id: '2',
    Icon: Sparkle,
    iconColor: '#f472b6',
    iconBg: 'rgba(244,114,182,0.15)',
    title: 'AI-Powered Itineraries',
    body: 'Tell us where you\'re headed and our AI builds a full day-by-day plan in seconds.',
    glowColor: 'rgba(244,114,182,0.22)',
  },
  {
    id: '3',
    Icon: MapPin,
    iconColor: '#fbbf24',
    iconBg: 'rgba(251,191,36,0.15)',
    title: 'Your Travel Wallet',
    body: 'Store boarding passes, hotel reservations, and loyalty cards — all in one place.',
    glowColor: 'rgba(251,191,36,0.18)',
  },
  {
    id: '4',
    Icon: Users,
    iconColor: '#34d399',
    iconBg: 'rgba(52,211,153,0.15)',
    title: 'Travel Together',
    body: 'Follow other explorers, share your trips, and get inspired by the community.',
    glowColor: 'rgba(52,211,153,0.18)',
  },
  {
    id: '5',
    Icon: RocketLaunch,
    iconColor: '#a78bfa',
    iconBg: 'rgba(167,139,250,0.15)',
    title: 'Ready to Explore?',
    body: 'Your next adventure starts here. Let\'s go.',
    glowColor: 'rgba(120,80,255,0.22)',
  },
];

async function markOnboardingComplete() {
  await AsyncStorage.setItem('onboarding_complete', '1');
}

function DotItem({ active }: { active: boolean }) {
  const width = useSharedValue(active ? 24 : 8);

  useEffect(() => {
    width.value = withSpring(active ? 24 : 8, { stiffness: 220, damping: 20 });
  }, [active, width]);

  const style = useAnimatedStyle(() => ({ width: width.value }));

  return (
    <Animated.View
      style={[
        styles.dot,
        { backgroundColor: active ? DarkColors.brand.purple : 'rgba(255,255,255,0.25)' },
        style,
      ]}
    />
  );
}

export default function OnboardingScreen() {
  const { width } = useWindowDimensions();
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<FlatList<Slide>>(null);

  const handleFinish = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markOnboardingComplete();
    router.replace('/(tabs)');
  }, []);

  const handleNext = useCallback(() => {
    if (activeIndex < SLIDES.length - 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const next = activeIndex + 1;
      listRef.current?.scrollToIndex({ index: next, animated: true });
      setActiveIndex(next);
    } else {
      handleFinish();
    }
  }, [activeIndex, handleFinish]);

  const handleSkip = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await markOnboardingComplete();
    router.replace('/(tabs)');
  }, []);

  const onMomentumScrollEnd = useCallback((e: any) => {
    const newIndex = Math.round(e.nativeEvent.contentOffset.x / width);
    setActiveIndex(newIndex);
  }, [width]);

  const renderSlide = useCallback(({ item }: ListRenderItemInfo<Slide>) => {
    const { Icon, iconColor, iconBg, title, body, glowColor } = item;
    return (
      <View style={[styles.slide, { width }]}>
        {/* Glow orb behind icon */}
        <View style={[styles.glowOrb, { backgroundColor: glowColor }]} />

        {/* Icon bubble */}
        <View style={[styles.iconBubble, { backgroundColor: iconBg }]}>
          <Icon size={52} color={iconColor} weight="duotone" />
        </View>

        <Text style={styles.slideTitle}>{title}</Text>
        <Text style={styles.slideBody}>{body}</Text>
      </View>
    );
  }, [width]);

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0a0a1a', '#1a0a3a', '#0a0a1a']}
        style={StyleSheet.absoluteFill}
      />
      {/* Secondary aurora glow */}
      <View style={styles.auroraTop} />
      <View style={styles.auroraBottom} />

      {/* Skip button */}
      {!isLast && (
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}

      {/* Slides */}
      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.id}
        renderItem={renderSlide}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onMomentumScrollEnd}
        style={styles.flatList}
        contentContainerStyle={styles.flatListContent}
        bounces={false}
      />

      {/* Bottom controls */}
      <View style={styles.controls}>
        {/* Dot indicators */}
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <DotItem key={i} active={i === activeIndex} />
          ))}
        </View>

        {/* CTA button */}
        <Button
          label={isLast ? 'Get Started' : 'Next'}
          onPress={handleNext}
          variant="primary"
          size="lg"
          fullWidth
          style={styles.ctaBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  auroraTop: {
    position: 'absolute', top: -100, right: -80,
    width: 300, height: 300, borderRadius: 150,
    backgroundColor: 'rgba(120,80,255,0.15)',
  },
  auroraBottom: {
    position: 'absolute', bottom: 60, left: -80,
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: 'rgba(244,114,182,0.12)',
  },

  skipBtn: {
    position: 'absolute',
    top: 60,
    right: Spacing['6'],
    zIndex: 10,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  skipText: {
    color: DarkColors.text.secondary,
    fontSize: FontSize.base,
    fontWeight: FontWeight.medium,
  },

  flatList: { flex: 1 },
  flatListContent: {},

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
    paddingTop: Spacing['16'],
  },

  glowOrb: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    top: '20%',
    alignSelf: 'center',
  },

  iconBubble: {
    width: 120,
    height: 120,
    borderRadius: 60,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing['8'],
  },

  slideTitle: {
    fontSize: FontSize['3xl'],
    fontWeight: FontWeight.black,
    color: DarkColors.text.primary,
    textAlign: 'center',
    marginBottom: Spacing['4'],
  },
  slideBody: {
    fontSize: FontSize.lg,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    lineHeight: FontSize.lg * 1.6,
  },

  controls: {
    paddingHorizontal: Spacing['6'],
    paddingBottom: 48,
    gap: Spacing['5'],
  },

  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing['2'],
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },

  ctaBtn: {},
});
