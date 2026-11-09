/**
 * Year in Travel (spec 2026-11-01-year-in-travel-design.md): full-screen story slides of one person's travel year.
 * Tap right/left for next/previous, hold to pause, swipe down to close; any slide but the companions one can be
 * shared as a 1080 × 1920 image, rendered off-screen with the star and supernovatravel.xyz and no app controls.
 * Always dark (Architecture Rule 3 exception, like the splash).
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { ArrowLeft, ArrowRight, ShareFat, X } from 'phosphor-react-native';
import { isLargeScreen } from '@/utils/layout';
import { useYearInTravel } from '@/hooks/useYearInTravel';
import { useUserStore } from '@/stores/useUserStore';
import { Slide, INK } from '@/components/yearInTravel/Slides';
import { SLIDE_MS, storyStep, visibleSlides, type StoryState } from '@/utils/yearInTravel';
import { happyMoment } from '@/services/reviewPrompt';

const VOID = '#0B0A12';
const STAR = require('@/assets/images/SupernovaStar.png');
const SHARE_W = 360;
const SHARE_H = 640;

function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/(tabs)');
}

export default function YearInTravelScreen() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { year: yearParam } = useLocalSearchParams<{ year?: string }>();
  const year = Number(yearParam) || new Date().getFullYear();
  const { data: s, isLoading, isError, refetch } = useYearInTravel(year);
  const profile = useUserStore((st) => st.profile);
  const firstName = (profile?.fullName ?? '').trim().split(/\s+/)[0] || 'Your';

  const slides = useMemo(() => (s ? visibleSlides(s) : []), [s]);
  const [state, dispatch] = useReducer(storyStep, { index: 0, elapsed: 0, paused: false, done: false } as StoryState);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion).catch(() => {});
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader).catch(() => {});
    const subs = [
      AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion),
      AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader),
    ];
    return () => subs.forEach((x) => x.remove());
  }, []);
  // A refetch can change the slide list (a photos slide appears): keep the position on a real slide.
  useEffect(() => { if (slides.length && state.index >= slides.length) dispatch({ type: 'prev', count: slides.length }); }, [slides.length, state.index]);
  // Finishing the story is a happy moment for the rating prompt (services/reviewPrompt) — once per visit.
  const rated = useRef(false);
  useEffect(() => { if (state.done && !rated.current) { rated.current = true; happyMoment('year'); } }, [state.done]);
  useEffect(() => { if (state.done) close(); }, [state.done]);

  // The story clock.
  useEffect(() => {
    // With VoiceOver/TalkBack the story waits for the person: no auto-advance.
    if (!slides.length || state.paused || screenReader) return;
    let raf = 0, last = Date.now();
    const loop = () => {
      const now = Date.now();
      dispatch({ type: 'tick', dt: Math.min(100, now - last), count: slides.length });
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [slides.length, state.paused, screenReader]);


  // Tap left third: back; elsewhere: forward. Hold: pause.
  const held = useRef(false);
  const onPress = useCallback((e: GestureResponderEvent) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch({ type: e.nativeEvent.locationX < width / 3 ? 'prev' : 'next', count: slides.length });
  }, [width, slides.length]);
  const onLongPress = useCallback(() => { held.current = true; dispatch({ type: 'pause' }); }, []);
  // After a hold React Native doesn't call onPress, so the flag is cleared here (a stuck flag swallowed the next tap).
  const onPressOut = useCallback(() => { if (held.current) { held.current = false; dispatch({ type: 'resume' }); } }, []);
  const step = useCallback((type: 'next' | 'prev') => dispatch({ type, count: slides.length }), [slides.length]);

  const drag = useRef(new Animated.Value(0)).current;
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
    onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
    onPanResponderRelease: (_e, g) => {
      if (g.dy > 100) close();
      else Animated.spring(drag, { toValue: 0, tension: 65, friction: 11, useNativeDriver: true }).start();
    },
  }), [drag]);

  // Sharing: the current slide, re-rendered off-screen at 9:16 with the star and the address.
  const shareRef = useRef<View>(null);
  const [sharing, setSharing] = useState(false);
  const current = slides[state.index];
  const share = useCallback(async () => {
    if (!shareRef.current || current === 'companions') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatch({ type: 'pause' });
    setSharing(true);
    try {
      const uri = await captureRef(shareRef, { format: 'png', quality: 1, width: 1080, height: 1920, result: 'tmpfile' });
      await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `My ${year} in travel` });
    } catch {
      // Cancelled or unavailable: nothing to tell.
    } finally {
      setSharing(false);
      dispatch({ type: 'resume' });
    }
  }, [current, year]);

  const contentWidth = width - 48;
  const body = !s ? (
    <View style={styles.loading}>
      {isError ? (
        <>
          <Text style={styles.errorText}>{"Couldn't load your year. Check your connection and try again."}</Text>
          <Pressable onPress={() => refetch()} style={styles.retry} accessibilityRole="button"><Text style={styles.retryText}>Try again</Text></Pressable>
        </>
      ) : isLoading ? <ActivityIndicator color={INK.soft} /> : null}
    </View>
  ) : (
    // Not one big button: screen readers read the slide itself and use the Previous/Next buttons below.
    <Pressable style={styles.fill} onPress={onPress} onLongPress={onLongPress} onPressOut={onPressOut} delayLongPress={250} accessible={false}>
      <View style={[styles.slide, { paddingTop: insets.top + 64, paddingBottom: insets.bottom + 96 }]}>
        {current ? (
          <Slide key={current} id={current} s={s} firstName={firstName} width={contentWidth} animate={!reduceMotion}
            height={height - insets.top - insets.bottom - 160} large={isLargeScreen(width, height)} />
        ) : null}
      </View>
    </Pressable>
  );

  return (
    <Animated.View style={[styles.fill, { backgroundColor: VOID, transform: [{ translateY: drag }] }]} {...pan.panHandlers}>
      <LinearGradient colors={['rgba(127,119,221,0.28)', 'rgba(11,10,18,0)'] as [string, string]} style={styles.glow} pointerEvents="none" />
      {body}

      {/* Progress bars and close */}
      <View style={[styles.top, { top: insets.top + 8 }]} pointerEvents="box-none">
        <View style={styles.bars}>
          {slides.map((id, i) => (
            <View key={id} style={styles.bar}>
              <View style={[styles.barFill, { width: `${i < state.index ? 100 : i > state.index ? 0 : Math.min(100, (state.elapsed / SLIDE_MS) * 100)}%` }]} />
            </View>
          ))}
        </View>
        <Pressable onPress={close} style={styles.close} accessibilityRole="button" accessibilityLabel="Close" hitSlop={6}>
          <X size={22} color={INK.text} weight="bold" />
        </Pressable>
      </View>

      {s && current ? (
        <View style={[styles.bottom, { bottom: insets.bottom + 24 }]}>
          {screenReader ? (
            <Pressable onPress={() => step('prev')} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Previous slide">
              <ArrowLeft size={20} color={INK.text} weight="bold" />
            </Pressable>
          ) : null}
          {current === 'next' && !s.nextTrip ? (
            // "Where to next?" with nothing planned: the slide's action is planning one.
            <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); if (router.canDismiss()) router.dismissAll(); router.navigate('/(tabs)/create'); }}
              style={styles.shareBtn} accessibilityRole="button">
              <Text style={styles.shareText}>Plan a trip</Text>
            </Pressable>
          ) : current !== 'companions' && current !== 'opener' ? (
            <Pressable onPress={share} disabled={sharing} style={styles.shareBtn} accessibilityRole="button" accessibilityLabel="Share this slide">
              {sharing ? <ActivityIndicator color="#1F1C19" /> : <ShareFat size={18} color="#1F1C19" weight="fill" />}
              <Text style={styles.shareText}>Share</Text>
            </Pressable>
          ) : null}
          {screenReader ? (
            <Pressable onPress={() => step('next')} style={styles.navBtn} accessibilityRole="button" accessibilityLabel="Next slide">
              <ArrowRight size={20} color={INK.text} weight="bold" />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Off-screen share image: same slide, 9:16, with the star and the address. */}
      {s && current ? (
        <View style={styles.offscreen} pointerEvents="none">
          <View ref={shareRef} collapsable={false} style={styles.shareFrame}>
            <LinearGradient colors={['rgba(127,119,221,0.35)', 'rgba(11,10,18,0)'] as [string, string]} style={styles.glow} />
            <View style={styles.shareBody}>
              <Slide id={current === 'companions' ? 'share' : current} s={s} firstName={firstName} width={SHARE_W - 48} animate={false} height={SHARE_H - 140} />
            </View>
            <View style={styles.shareFooter}>
              <Image source={STAR} style={styles.shareStar} />
              <Text style={styles.shareBrand}>Supernova</Text>
              <Text style={styles.shareUrl}>supernovatravel.xyz</Text>
            </View>
          </View>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  glow: { position: 'absolute', left: 0, right: 0, top: 0, height: 360 },
  slide: { flex: 1, paddingHorizontal: 24 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  errorText: { color: INK.soft, fontSize: 16, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 20, justifyContent: 'center', borderRadius: 999, backgroundColor: '#F5F3F9' },
  retryText: { color: '#1F1C19', fontWeight: '700' },
  top: { position: 'absolute', left: 16, right: 8, flexDirection: 'row', alignItems: 'center', gap: 8 },
  bars: { flex: 1, flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: 'rgba(245,243,249,0.22)', overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: '#F5F3F9' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  navBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(245,243,249,0.12)' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 22, borderRadius: 999, backgroundColor: '#F5F3F9' },
  shareText: { color: '#1F1C19', fontSize: 16, fontWeight: '700' },
  offscreen: { position: 'absolute', left: -10000, top: 0 },
  shareFrame: { width: SHARE_W, height: SHARE_H, backgroundColor: VOID, overflow: 'hidden' },
  shareBody: { flex: 1, paddingHorizontal: 24, paddingTop: 56 },
  shareFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingBottom: 28 },
  shareStar: { width: 22, height: 22 },
  shareBrand: { color: INK.text, fontSize: 15, fontWeight: '700' },
  shareUrl: { color: INK.muted, fontSize: 13, marginLeft: 'auto' },
});
