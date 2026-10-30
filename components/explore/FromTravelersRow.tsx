/** "From travelers" on Explore (spec 2026-10-29): the newest public posts; a tap opens the feed at that post. */
import { memo, useCallback, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Play } from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useFeed } from '@/hooks/useFeed';
import { useModeration } from '@/hooks/useModeration';
import { contentKey, filterVisible } from '@/utils/moderation';
import { gridImageUrl } from '@/utils/postImages';
import { fromTravelers, postTileLabel } from '@/utils/postTile';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing } from '@/constants/spacing';
import type { Post } from '@/types';

// `as never` on /feed: Expo Router's typed route list regenerates on the next build.
export const FromTravelersRow = memo(function FromTravelersRow() {
  const { colors } = useTheme();
  const { data } = useFeed('forYou');
  const moderation = useModeration();
  const posts = useMemo(() => fromTravelers(filterVisible(data?.pages.flatMap((p) => p.posts) ?? [], moderation, (post: Post) => ({
    authorUid: post.authorUid, key: contentKey({ type: 'post', id: post.id }), moderationHidden: post.moderationHidden,
  }))), [data, moderation]);
  const open = useCallback((id: string) => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.push(`/feed?start=${encodeURIComponent(id)}` as never); }, []);
  const share = useCallback(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push('/add-to-feed'); }, []);
  if (posts.length === 0) return null;
  return (
    <View style={styles.section}>
      <View style={styles.head}>
        <Text style={[styles.title, { color: colors.text.primary }]}>From travelers</Text>
        <Pressable onPress={share} hitSlop={10} style={styles.link} accessibilityRole="button" accessibilityLabel="Share a photo or video">
          <Text style={[styles.linkText, { color: colors.brand.purple }]}>Share</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {posts.map((p) => (
          <Pressable key={p.id} onPress={() => open(p.id)} accessibilityRole="button" accessibilityLabel={`${p.mediaType === 'video' ? 'Video' : 'Photo'} by ${postTileLabel(p)}`}>
            <Image source={{ uri: gridImageUrl(p) ?? undefined }} style={[styles.tile, { backgroundColor: colors.background.sunken }]} contentFit="cover" />
            {p.mediaType === 'video' && <View style={styles.play}><Play size={10} weight="fill" color="#fff" /></View>}
            <Text style={styles.caption} numberOfLines={1}>{postTileLabel(p)}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
});

const styles = StyleSheet.create({
  section: { gap: Spacing['2'], marginTop: Spacing['4'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Spacing['5'] },
  title: { fontSize: FontSize.md, fontWeight: FontWeight.semiBold },
  link: { minHeight: 44, justifyContent: 'center' },
  linkText: { fontSize: FontSize.sm, fontWeight: FontWeight.semiBold },
  row: { gap: Spacing['2'], paddingHorizontal: Spacing['5'] },
  tile: { width: 112, height: 168, borderRadius: 14 },
  play: { position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  caption: { position: 'absolute', left: 8, right: 8, bottom: 8, color: '#fff', fontSize: FontSize.xs, fontWeight: FontWeight.medium, textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4 },
});
