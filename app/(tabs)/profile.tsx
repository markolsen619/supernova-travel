import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { useQuery } from '@tanstack/react-query';
import {
  Gear,
  PencilSimple,
  MapTrifold,
  BookmarkSimple,
  SquaresFour,
} from 'phosphor-react-native';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { useTripList } from '@/hooks/useTripList';
import { db } from '@/services/firebase';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
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

const EMPTY_MESSAGES: Record<TripFilter, string> = {
  Upcoming: 'No upcoming trips yet — time to plan one!',
  Current: 'No active trips right now.',
  Past: 'No completed trips yet.',
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
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as PostDoc));
}

async function fetchSavedTrips(uid: string): Promise<Trip[]> {
  const snap = await getDocs(collection(db, 'users', uid, 'savedTrips'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Trip));
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { user, tier } = useAuthStore();
  const { profile } = useUserStore();

  const [activeTab, setActiveTab] = useState<ProfileTab>('Trips');
  const [tripFilter, setTripFilter] = useState<TripFilter>('Upcoming');
  const [editSheetVisible, setEditSheetVisible] = useState(false);

  const uid = user?.uid ?? null;
  const displayName = profile?.displayName ?? user?.displayName ?? 'Explorer';
  const username = displayName.toLowerCase().replace(/\s+/g, '_');

  const { data: allTrips = [], isLoading: tripsLoading } = useTripList(uid);
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

  const openEditSheet = useCallback(() => {
    setEditSheetVisible(true);
  }, []);

  const closeEditSheet = useCallback(() => {
    setEditSheetVisible(false);
  }, []);

  // ── Header ──────────────────────────────────────────────────────────────────

  const headerComponent = (
    <>
      {/* Hero gradient */}
      <LinearGradient
        colors={['#1a0a3a', '#0a0a1a'] as [string, string]}
        style={[styles.heroGradient, { paddingTop: insets.top }]}
      >
        {/* Top actions */}
        <View style={styles.heroActions}>
          <Image
            source={require('@/assets/images/SupernovaStar.png')}
            style={styles.heroStar}
            resizeMode="contain"
          />
          <TouchableOpacity onPress={handleSettings} style={styles.heroIconBtn} activeOpacity={0.7}>
            <Gear size={22} color="rgba(255,255,255,0.7)" weight="regular" />
          </TouchableOpacity>
        </View>

        {/* Avatar + info */}
        <View style={styles.heroContent}>
          <Avatar uri={user?.photoURL} name={displayName} size="xl" />
          <Text style={styles.heroName}>{displayName}</Text>
          <Text style={styles.heroUsername}>@{username}</Text>
          {tier !== 'free' && <Badge variant={tier} style={styles.heroBadge} />}

          {/* Stats row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Followers', value: profile?.followersCount ?? 0 },
              { label: 'Following', value: profile?.followingCount ?? 0 },
              { label: 'Trips', value: allTrips.length },
            ].map(({ label, value }, i) => (
              <View key={label} style={[styles.stat, i > 0 && styles.statDivider]}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{label}</Text>
              </View>
            ))}
          </View>

          {/* Edit profile */}
          <TouchableOpacity
            style={[styles.editBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}
            onPress={openEditSheet}
            activeOpacity={0.75}
          >
            <PencilSimple size={15} color="rgba(255,255,255,0.8)" weight="bold" />
            <Text style={styles.editBtnText}>Edit Profile</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>

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
            style={[
              styles.tabItem,
              activeTab === id && styles.tabItemActive,
            ]}
            activeOpacity={0.7}
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
                    tripFilter === f ? 'rgba(167,139,250,0.2)' : colors.background.card,
                  borderColor:
                    tripFilter === f ? colors.brand.purple : colors.background.cardBorder,
                },
              ]}
              activeOpacity={0.75}
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
            <ActivityIndicator color={colors.brand.purple} />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        <FlashList
          data={filteredTrips}
          keyExtractor={(t) => t.id}
          estimatedItemSize={230}
          contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: 100 }}
          ListHeaderComponent={headerComponent}
          ItemSeparatorComponent={() => <View style={{ height: Spacing['3'] }} />}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <MapTrifold size={48} color={colors.text.tertiary} weight="duotone" />
              <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>
                {EMPTY_MESSAGES[tripFilter]}
              </Text>
              {tripFilter === 'Upcoming' && (
                <TouchableOpacity
                  style={[styles.emptyBtn, { backgroundColor: colors.brand.purple }]}
                  onPress={() => router.push('/trip/new')}
                  activeOpacity={0.85}
                >
                  <Text style={styles.emptyBtnText}>Create a Trip</Text>
                </TouchableOpacity>
              )}
            </View>
          }
          renderItem={({ item }) => (
            <TripCard
              trip={item}
              onPress={() => router.push(`/trip/${item.id}`)}
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
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.brand.purple} />
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
        <FlashList
          data={posts}
          keyExtractor={(p) => p.id}
          estimatedItemSize={POST_CELL}
          numColumns={3}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <SquaresFour size={48} color={colors.text.tertiary} weight="duotone" />
              <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>
                No posts yet. Share your first travel moment!
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.postCell}
              onPress={() => router.push(`/post/${item.id}`)}
              activeOpacity={0.85}
            >
              {item.mediaUrl ? (
                <Image source={{ uri: item.mediaUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              ) : (
                <LinearGradient
                  colors={['rgba(167,139,250,0.3)', 'rgba(244,114,182,0.3)'] as [string, string]}
                  style={StyleSheet.absoluteFill}
                />
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
          <ActivityIndicator color={colors.brand.purple} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background.primary }]}>
      <FlashList
        data={savedTrips}
        keyExtractor={(t) => t.id}
        estimatedItemSize={230}
        contentContainerStyle={{ paddingHorizontal: Spacing['4'], paddingBottom: 100 }}
        ListHeaderComponent={headerComponent}
        ItemSeparatorComponent={() => <View style={{ height: Spacing['3'] }} />}
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <BookmarkSimple size={48} color={colors.text.tertiary} weight="duotone" />
            <Text style={[styles.emptyTitle, { color: colors.text.secondary }]}>
              Save trips from your feed to find them here.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <TripCard
            trip={item}
            onPress={() => router.push(`/trip/${item.id}`)}
          />
        )}
      />
      <EditProfileSheet visible={editSheetVisible} onClose={closeEditSheet} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },

  heroGradient: {
    paddingBottom: Spacing['5'],
  },
  heroActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
  },
  heroStar: { width: 28, height: 28 },
  heroIconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  heroContent: {
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
    paddingTop: Spacing['2'],
  },
  heroName: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: '#ffffff',
    marginTop: Spacing['3'],
  },
  heroUsername: {
    fontSize: FontSize.sm,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: Spacing['2'],
  },
  heroBadge: { marginBottom: Spacing['3'] },

  statsRow: {
    flexDirection: 'row',
    marginVertical: Spacing['4'],
    gap: 0,
  },
  stat: {
    alignItems: 'center',
    paddingHorizontal: Spacing['6'],
  },
  statDivider: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(255,255,255,0.1)',
  },
  statValue: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.black,
    color: '#ffffff',
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },

  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['2'],
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    marginBottom: Spacing['2'],
  },
  editBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
    color: 'rgba(255,255,255,0.8)',
  },

  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing['3'],
    gap: 4,
    position: 'relative',
  },
  tabItemActive: {},
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
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  emptyWrap: {
    alignItems: 'center',
    paddingVertical: Spacing['10'],
    paddingHorizontal: Spacing['8'],
    gap: Spacing['3'],
  },
  emptyTitle: {
    fontSize: FontSize.base,
    textAlign: 'center',
    lineHeight: FontSize.base * 1.5,
  },
  emptyBtn: {
    marginTop: Spacing['2'],
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.xl,
  },
  emptyBtnText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.bold,
    color: '#ffffff',
  },

  postCell: {
    width: POST_CELL,
    height: POST_CELL,
    backgroundColor: 'rgba(167,139,250,0.1)',
    overflow: 'hidden',
  },
});
