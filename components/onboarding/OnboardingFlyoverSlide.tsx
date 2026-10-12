import { useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';
import { useReduceMotion } from '@/hooks/useReduceMotion';
import { SlideTextBlock } from '@/components/onboarding/SlideTextBlock';
import { CLIP_AUDIO_MIXING } from '@/utils/videoPlayback';
import { Spacing, BorderRadius } from '@/constants/spacing';

interface Props {
  active: boolean;
}

/**
 * "Watch your trip come alive" — the trip flyover, as a short clip recorded from the app and
 * shipped inside it: instant, offline, and no map tiles to download at sign-up. Plays muted on
 * a loop while the slide is on screen; with Reduce Motion it holds still on its first frame.
 */
export function OnboardingFlyoverSlide({ active }: Props) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const reduceMotion = useReduceMotion();
  const player = useVideoPlayer(require('@/assets/onboarding/flyover.mp4'), (p) => {
    p.loop = true;
    p.muted = true;
    p.audioMixingMode = CLIP_AUDIO_MIXING;
  });

  useEffect(() => {
    if (active && !reduceMotion) player.play();
    else player.pause();
  }, [active, reduceMotion, player]);

  return (
    <View style={[styles.slide, { width }]}>
      <View style={styles.region}>
        <View style={styles.frameWrap}>
          <View style={[styles.frame, { borderColor: colors.background.cardBorder, backgroundColor: '#0B0A12' }]}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
          </View>
        </View>
        <LinearGradient
          colors={['transparent', colors.background.primary] as [string, string]}
          style={styles.fadeBottom}
          pointerEvents="none"
        />
      </View>

      <View style={styles.textRegion}>
        <SlideTextBlock
          eyebrow="Trip flyover"
          title="Watch your trip come alive"
          body="Every day draws itself on a 3D map, flying from stop to stop. Share it, or relive it when you're home."
          active={active}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slide: { flex: 1 },
  region: { height: '60%', width: '100%', overflow: 'hidden' },
  frameWrap: { flex: 1, alignItems: 'center', paddingTop: Spacing['6'] },
  // A phone-shaped window onto the map, the clip's own shape: a 600x1208 iPhone screen recording
  // (Lisbon editorial trip, status bar cropped, 19.5 s, HEVC ~1.3 Mbps, 3.3 MB).
  frame: { height: '100%', aspectRatio: 600 / 1208, borderRadius: BorderRadius['2xl'], borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  fadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 80 },
  textRegion: { flex: 1, paddingTop: Spacing['5'] },
});
