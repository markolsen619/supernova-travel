import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { FlashList } from '@shopify/flash-list';
import { MapTrifold, CheckCircle } from 'phosphor-react-native';
import { useCreatePost } from '@/hooks/useCreatePost';
import { useTripList } from '@/hooks/useTripList';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTheme } from '@/hooks/useTheme';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonListRow } from '@/components/ui/Skeleton';
import { Trip } from '@/types';
import { ThemeColors } from '@/constants/colors';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';

function formatDateRange(trip: Trip): string | null {
  if (!trip.startDate) return null;
  const fmt = (ts: { toDate: () => Date }) =>
    ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return trip.endDate ? `${fmt(trip.startDate)} – ${fmt(trip.endDate)}` : fmt(trip.startDate);
}

interface TripRowProps {
  trip: Trip;
  selected: boolean;
  onPress: (trip: Trip) => void;
  colors: ThemeColors;
}

function TripRow({ trip, selected, onPress, colors }: TripRowProps) {
  const dateRange = formatDateRange(trip);
  return (
    <TouchableOpacity
      style={[
        styles.tripRow,
        {
          backgroundColor: colors.background.card,
          borderColor: selected ? colors.brand.purple : colors.background.cardBorder,
        },
      ]}
      onPress={() => onPress(trip)}
      activeOpacity={0.75}
    >
      {trip.coverImageUrl ? (
        <Image source={{ uri: trip.coverImageUrl }} style={styles.tripThumb} resizeMode="cover" />
      ) : (
        <LinearGradient colors={colors.gradient.purplePink} style={styles.tripThumb} />
      )}
      <View style={styles.tripInfo}>
        <Text style={[styles.tripTitle, { color: colors.text.primary }]} numberOfLines={1}>
          {trip.title}
        </Text>
        <Text style={[styles.tripDestination, { color: colors.text.secondary }]} numberOfLines={1}>
          {trip.destination.name}
        </Text>
        {dateRange && (
          <Text style={[styles.tripDates, { color: colors.text.tertiary }]}>{dateRange}</Text>
        )}
      </View>
      {selected && <CheckCircle size={22} color={colors.brand.purple} weight="duotone" />}
    </TouchableOpacity>
  );
}

export default function CreateTripPostScreen() {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const { createTripPost, isUploading } = useCreatePost();
  const { data: trips, isLoading } = useTripList(uid);

  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [caption, setCaption] = useState('');

  const handleSelectTrip = useCallback((trip: Trip) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTrip((prev) => (prev?.id === trip.id ? null : trip));
  }, []);

  const handleShare = useCallback(async () => {
    if (!selectedTrip || isUploading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await createTripPost({ trip: selectedTrip, caption });
      router.navigate('/');
    } catch (e: unknown) {
      Alert.alert('Share failed', e instanceof Error ? e.message : 'Check your connection and try again.');
    }
  }, [selectedTrip, isUploading, caption, createTripPost]);

  const canShare = !!selectedTrip && !isUploading;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background.primary }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header — Cancel is the only header action; the footer button is the
          screen's one primary action */}
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + Spacing['2'], borderBottomColor: colors.background.cardBorder },
        ]}
      >
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerBack, { color: colors.text.secondary }]}>Cancel</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text.primary }]}>Share a trip</Text>
        <View style={styles.headerBtn} />
      </View>

      {/* Trip list */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          {[0, 1, 2, 3].map((i) => (
            <SkeletonListRow key={i} />
          ))}
        </View>
      ) : !trips || trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <EmptyState
            icon={MapTrifold}
            title="Share your first trip"
            description="Create a trip, then feature it on the feed."
            actionLabel="Create a trip"
            onAction={() => router.replace('/trip/new')}
            actionHaptic="light"
          />
        </View>
      ) : (
        <FlashList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripRow
              trip={item}
              selected={selectedTrip?.id === item.id}
              onPress={handleSelectTrip}
              colors={colors}
            />
          )}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={[styles.sectionHeader, { color: colors.text.tertiary }]}>
              YOUR TRIPS
            </Text>
          }
          ListFooterComponent={
            <View style={styles.captionSection}>
              <TextInput
                style={[
                  styles.captionInput,
                  {
                    backgroundColor: colors.background.card,
                    borderColor: colors.background.cardBorder,
                    color: colors.text.primary,
                  },
                ]}
                placeholder="Say something about this trip…"
                placeholderTextColor={colors.text.tertiary}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={500}
              />

              <TouchableOpacity
                style={[
                  styles.shareButton,
                  { backgroundColor: colors.action.primary },
                  !canShare && styles.shareButtonDisabled,
                ]}
                onPress={handleShare}
                disabled={!canShare}
                activeOpacity={0.8}
              >
                <Text style={[styles.shareButtonText, { color: colors.action.primaryText }]}>
                  {isUploading ? 'Sharing…' : 'Share trip'}
                </Text>
              </TouchableOpacity>
            </View>
          }
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    minWidth: 60,
    paddingVertical: Spacing['2'],
  },
  headerBack: {
    fontSize: FontSize.base,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
  loadingContainer: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    gap: Spacing['3'],
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  listContent: {
    paddingBottom: Spacing['10'],
  },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    textTransform: 'uppercase',
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    paddingBottom: Spacing['3'],
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['3'],
    paddingHorizontal: Spacing['5'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing['4'],
    marginBottom: Spacing['2'],
    borderWidth: StyleSheet.hairlineWidth,
  },
  tripThumb: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
  },
  tripInfo: {
    flex: 1,
    gap: 2,
  },
  tripTitle: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
  },
  tripDestination: {
    fontSize: FontSize.sm,
  },
  tripDates: {
    fontSize: FontSize.xs,
  },
  captionSection: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    gap: Spacing['4'],
  },
  captionInput: {
    borderRadius: BorderRadius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing['4'],
    fontSize: FontSize.base,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  shareButton: {
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  shareButtonDisabled: {
    opacity: 0.4,
  },
  shareButtonText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.semiBold,
  },
});
