import { useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import {
  Bag,
  Gear,
  PencilSimple,
  MapTrifold,
  BookmarkSimple,
  SquaresFour,
  Compass,
} from 'phosphor-react-native';
import { excludeTripShares } from '@/utils/posts';
import { useTheme } from '@/hooks/useTheme';
import { ScreenHeaderStar } from '@/components/ui/ScreenHeaderStar';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useTripList } from '@/hooks/useTripList';
import { useTripCoverResolver } from '@/hooks/useTripCoverResolver';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { db } from '@/services/firebase';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { ScreenEntrance } from '@/components/ui/ScreenEntrance';
import { TripCard } from '@/components/trip/TripCard';
import { EditProfileSheet } from '@/components/profile/EditProfileSheet';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { Trip, TripStatus } from '@/types';

type ProfileTab = 'Trips' | 'Posts' | 'Saved';
type TripFilter = 'Upcoming' | 'Current' | 'Past';

const TRIP_STATUS_MAP: Record<TripFilter, TripStatus> = {
  Upcoming: 'planning',
  Current: 'active',
  Past: 'completed',
};

const EMPTY_COPY: Record<TripFilter, { title: string; description: string }> = {
  Upcoming: { title: 'No upcoming trips', description: 'Plan your next adventure.' },
  Current: { title: 'No active trips', description: "Trips you're on now will show up here." },
  Past: { title: 'No completed trips yet', description: 'Your travel history will appear here.' },
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const POST_CELL = Math.floor(SCREEN_WIDTH / 3);

interface PostDoc {
  id: string;
  mediaUrl?: string;
  mediaType?: string;
  caption?: string;
}

async function fetchUserPosts(uid: string): Promise<PostDoc[]> {
  const q = query(
    collection(db, 'posts'),
    where('authorUid', '==', uid),
    orderBy('createdAt', 'desc'),
    limit(60),
  );
  const snap = await getDocs(q);
  const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() } as PostDoc));
  return excludeTripShares(posts);
}

/** Saved entries are trip snapshots, or post-shaped records (feed bookmarks)
 * carrying savedType/postId — see hooks/useSavePost.ts. */
type SavedItem = Trip & { savedType?: 'post'; postId?: string };

async function fetchSavedTrips(uid: string): Promise<SavedItem[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'savedTrips'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as SavedItem));
}

export default function ProfileScreen() {
  return (
    <ScreenEntrance>
      <ProfileScreenContent />
    </ScreenEntrance>
  );
}

function ProfileScreenContent() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, tier } = useAuthStore();
  const { profile } = useUserStore();

  const [activeTab, setActiveTab] = useState<ProfileTab>('Trips');
  const [tripFilter, setTripFilter] = useState<TripFilter>('Upcoming');
  const [editSheetVisible, setEditSheetVisible] = useState(false);

  const uid = user?.uid ?? null;
  const fullName = profile?.fullName ?? user?.displayName ?? 'Explorer';
  const username = profile?.username ?? '';

  const { data: allTrips = [], isLoading: tripsLoading, refetch: refetchTrips } = useTripList(uid);

  // TanStack's staleTime keeps this list from refetching on every tab
  // switch — right, most of the time. But the cover/author backfill below
  // writes in the background, and a 2-minute-stale list would sit there
  // looking unfixed until that window lapses. Refetching on focus (not on
  // every render) means returning to this tab always shows the latest,
  // without turning every mount into a network call.
  useFocusEffect(
    useCallback(() => {
      refetchTrips();
    }, [refetchTrips]),
  );

  // Backfill missing cover photos AND missing destination bounds across every
  // one of your trips (Upcoming/Current/Past alike), not just the one you
  // happen to open — every trip here is already yours (useTripList filters
  // by authorUid), so isOwner is always true. The loop guard below only
  // skips a trip once BOTH are already resolved: a trip with a cover but no
  // bounds (or vice versa) must still reach resolveCover, which backfills
  // each independently. Sequential, not parallel: courteous to the Places
  // API budget the same way the trip map's "Locate all" is, just without a
  // confirmation prompt since this is a silent, one-time backfill identical
  // in spirit to the one that already ran on trip-detail open.
  const { resolveCover } = useTripCoverResolver();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const trip of allTrips) {
        if (cancelled) return;
        if (trip.coverImageUrl !== null && trip.destination.bounds !== null) continue;
        await resolveCover(trip, true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allTrips, resolveCover]);
  const filteredTrips = allTrips.filter((t) => t.status === TRIP_STATUS_MAP[tripFilter]);

  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ['userPosts', uid],
    queryFn: () => fetchUserPosts(uid!),
    enabled: !!uid && activeTab === 'Posts',
    staleTime: 2 * 60 * 1000,
  });

  const { data: savedTrips = [], isLoading: savedLoading } = useQuery({
    queryKey: ['savedTrips', uid],
    queryFn: () => fetchSavedTrips(uid!),
    enabled: !!uid && activeTab === 'Saved',
    staleTime: 2 * 60 * 1000,
  });
  // Saved trips can belong to anyone (post-shaped bookmarks carry no
  // authorUid at all — filtered out here) — one batched lookup instead of
  // a fetch per card.
  const { data: savedAuthorProfiles = {} } = useAuthorProfiles(
    savedTrips.map((t) => t.authorUid).filter((id): id is string => !!id),
  );

  const handleTabPress = useCallback((tab: ProfileTab) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveTab(tab);
  }, []);

  const handleFilterPress = useCallback((filter: TripFilter) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTripFilter(filter);
  }, []);

  const handleSettings = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/settings');
  }, []);

  const handleWallet = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(wallet)');
  }, []);

  const handlePostPress = useCallback((postId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/post/${postId}`);
  }, []);

  const openEditSheet = useCallback(() => {
    setEditSheetVisible(true);
  }, []);

  const closeEditSheet = useCallback(() => {
    setEditSheetVisible(false);
  }, []);

  // ── Header ──────────────────────────────────────────────────────────────────

  const headerComponent = (
    <>
      <View style={[styles.hero, { paddingTop: insets.top, backgroundColor: colors.background.primary }]}>
        {/* Top actions */}
        <View style={styles.heroActions}>
          <ScreenHeaderStar />
          <View style={styles.heroIconGroup}>
            <TouchableOpacity
              onPress={handleWallet}
              style={styles.heroIconBtn}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Wallet"
            >
              <Bag size={22} color={colors.text.secondary} weight="regular" />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSettings}
              style={styles.heroIconBtn}
              activeOpacity={0.7}
              hitSlop={6}
              accessibilityLabel="Settings"
            >
              <Gear size={22} color={colors.text.secondary} weight="regular" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Avatar + info */}
        <View style={styles.heroContent}>
          <Avatar uri={profile?.avatarUrl ?? user?.photoURL} name={fullName} size="xl" />
          <Text style={[styles.heroName, { color: colors.text.primary }]}>{fullName}</Text>
          {/* Every account now has a username (captured at sign-up, or set
              via the Edit profile button below) — no separate nudge needed. */}
          {username ? (
            <Text style={[styles.heroUsername, { color: colors.text.tertiary }]}>@{username}</Text>
          ) : null}
          {tier !== 'free' && <Badge variant={tier} style={styles.heroBadge} />}

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Followers', value: profile?.followersCount ?? 0 },
              { label: 'Following', value: profile?.followingCount ?? 0 },
              { label: 'Trips', value: allTrips.length },
            ].map(({ label, value }, i) => (
              <View
                key={label}
                style={[styles.stat, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: colors.background.cardBorder }]}
              >
                <Text style={[styles.statValue, { color: colors.text.primary }]}>{value}</Text>
                <Text style={[styles.statLabel, { color: colors.text.tertiary }]}>{label}</Text>
              </View>
            ))}
          </View>

          <Button
            label="Edit profile"
            variant="secondary"
            size="sm"
            icon={PencilSimple}
            onPress={openEditSheet}
            style={styles.editBtn}
          />
        </View>
      </View>

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: colors.background.cardBorder }]}>
        {([
          { id: 'Trips' as ProfileTab, Icon: MapTrifold },
          { id: 'Posts' as ProfileTab, Icon: SquaresFour },
          { id: 'Saved' as ProfileTab, Icon: BookmarkSimple },
        ] as { id: ProfileTab; Icon: typeof MapTrifold }[]).map(({ id, Icon }) => (
          <TouchableOpacity
            key={id}
            onPress={() => handleTabPress(id)}
            style={styles.tabItem}
            activeOpacity={0.7}
            accessibilityLabel={`${id} tab`}
          >
            <Icon
              size={20}
              color={activeTab === id ? colors.brand.purple : colors.text.tertiary}
              weight={activeTab === id ? 'duotone' : 'regular'}
            />
            <Text
              style={[
                styles.tabLabel,
                { color: activeTab === id ? colors.brand.purple : colors.text.tertiary },
              ]}
            >
              {id}
            </Text>
            {activeTab === id && (
              <View style={[styles.tabIndicator, { backgroundColor: colors.brand.purple }]} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Trips sub-filter */}
      {activeTab === 'Trips' && (
        <View style={styles.filterRow}>
          {(['Upcoming', 'Current', 'Past'] as TripFilter[]).map((f) => (
            <TouchableOpacity
              key={f}
              onPress={() => handleFilterPress(f)}
              style={[
                styles.filterChip,
                {
                  backgroundColor:
                    tripFilter === f ? `${colors.brand.purple}1F` : colors.background.sunken,
                },
              ]}
              activeOpacity={0.75}
              accessibilityLabel={`${f} trips`}
            >
              <Text
                style={[
                  styles.filterChipText,
                  { color: tripFilter === f ? colors.brand.purple : colors.text.secondary },
                ]}
              >
                {f}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  // ── Content renderers ────────────────────────────────────────────────────────

  if (activeTab === 'Trips') {
    if (tripsLoading) {
      return (
        <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
          {headerComponent}
          <View style={styles.loadingWrap}>
            {[0, 1, 2].map((i) => (
              <SkeletonCard key={i} height={230} radius={BorderRadius.xl} style={{ marginBottom: Spacing['3'] }} />
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        <FlashList
          data={filteredTrips}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: 100 }}
          ListHeaderComponent={headerComponent}
          ItemSeparatorComponent={() => <View style={{ height: Spacing['3'] }} />}
          ListEmptyComponent={
            <EmptyState
              icon={MapTrifold}
              title={EMPTY_COPY[tripFilter].title}
              description={EMPTY_COPY[tripFilter].description}
              actionLabel="Create a trip"
              onAction={() => router.push('/trip/new')}
              actionHaptic="light"
            />
          }
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onPress={() => router.push(`/trip/${item.id}`)}
              // Every trip in this list is yours — useTripList filters by
              // authorUid — so the author is always the profile owner, no
              // batch lookup needed.
              author={{ name: fullName, avatarUrl: profile?.avatarUrl ?? null }}
            />
          )}
        />
        <EditProfileSheet visible={editSheetVisible} onClose={closeEditSheet} />
      </View>
    );
  }

  if (activeTab === 'Posts') {
    if (postsLoading) {
      return (
        <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
          {headerComponent}
          <View style={styles.postGridSkeleton}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <SkeletonCard key={i} width={POST_CELL} height={POST_CELL} radius={0} />
            ))}
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        <FlashList
          data={posts}
          keyExtractor={(p) => p.id}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={
            <EmptyState
              icon={SquaresFour}
              title="No posts yet"
              description="Share your first travel moment."
              actionLabel="Share a moment"
              onAction={() => router.push('/add-to-feed')}
              actionHaptic="light"
            />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.postCell, { backgroundColor: colors.background.sunken }]}
              onPress={() => handlePostPress(item.id)}
              activeOpacity={0.85}
            >
              {item.mediaUrl ? (
                <Image source={{ uri: item.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <View style={[StyleSheet.absoluteFill, styles.postCellFallback]}>
                  <SquaresFour size={20} color={colors.text.disabled} weight="duotone" />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
        <EditProfileSheet visible={editSheetVisible} onClose={closeEditSheet} />
      </View>
    );
  }

  // Saved tab
  if (savedLoading) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        {headerComponent}
        <View style={styles.loadingWrap}>
          {[0, 1, 2].map((i) => (
            <SkeletonCard key={i} height={230} radius={BorderRadius.xl} style={{ marginBottom: Spacing['3'] }} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
      <FlashList
        data={savedTrips}
        keyExtractor={(t) => t.id}
        contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: 100 }}
        ListHeaderComponent={headerComponent}
        ItemSeparatorComponent={() => <View style={{ height: Spacing['3'] }} />}
        ListEmptyComponent={
          <EmptyState
            icon={BookmarkSimple}
            title="No saved trips"
            description="Save trips from your feed to find them here."
            actionLabel="Explore trips"
            actionIcon={Compass}
            onAction={() => router.navigate('/(tabs)/explore')}
            actionHaptic="light"
          />
        }
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPress={() =>
              router.push(
                item.savedType === 'post' && item.postId
                  ? `/post/${item.postId}`
                  : `/trip/${item.id}`,
              )
            }
            author={savedAuthorProfiles[item.authorUid] ?? null}
          />
        )}
      />
      <EditProfileSheet visible={editSheetVisible} onClose={closeEditSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  hero: {
    paddingBottom: Spacing['5'],
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
  },
  heroIconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  heroContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize.xl,
    marginTop: Spacing['3'],
  },
  heroUsername: {
    fontSize: FontSize.sm,
    marginBottom: Spacing['2'],
  },
  heroBadge: { marginBottom: Spacing['3'] },

  statsRow: {
    flexDirection: 'row',
    marginVertical: Spacing['4'],
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.semiBold,
  },
  statLabel: {
    fontSize: FontSize.xs,
    marginTop: 2,
  },

  editBtn: {
    marginBottom: Spacing['2'],
  },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3'],
    gap: 4,
    position: 'relative',
    minHeight: 44,
  },
  tabLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
  },
  tabIndicator: {
    position: 'absolute',
    bottom: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
  },

  filterRow: {
    flexDirection: 'row',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['3'],
  },
  filterChip: {
    paddingHorizontal: Spacing['4'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    minHeight: 36,
    justifyContent: 'center',
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  loadingWrap: {
    paddingHorizontal: Spacing['4'],
    paddingTop: Spacing['3'],
  },

  postGridSkeleton: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },

  postCell: {
    width: POST_CELL,
    height: POST_CELL,
    overflow: 'hidden',
  },
  postCellFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
