import { useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MapTrifold, CheckCircle } from 'phosphor-react-native';
import { useCreatePost } from '@/hooks/useCreatePost';
import { useTripList } from '@/hooks/useTripList';
import { useAuthStore } from '@/stores/useAuthStore';
import { Trip } from '@/types';
import { DarkColors } from '@/constants/colors';
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
}

function TripRow({ trip, selected, onPress }: TripRowProps) {
  const dateRange = formatDateRange(trip);
  return (
    <TouchableOpacity
      style={[styles.tripRow, selected && styles.tripRowSelected]}
      onPress={() => onPress(trip)}
      activeOpacity={0.75}
    >
      {trip.coverImageUrl ? (
        <Image source={{ uri: trip.coverImageUrl }} style={styles.tripThumb} resizeMode="cover" />
      ) : (
        <LinearGradient
          colors={['#a78bfa', '#f472b6'] as [string, string]}
          style={styles.tripThumb}
        />
      )}
      <View style={styles.tripInfo}>
        <Text style={styles.tripTitle} numberOfLines={1}>{trip.title}</Text>
        <Text style={styles.tripDestination} numberOfLines={1}>{trip.destination.name}</Text>
        {dateRange && <Text style={styles.tripDates}>{dateRange}</Text>}
      </View>
      {selected && (
        <CheckCircle size={22} color="#a78bfa" weight="duotone" />
      )}
    </TouchableOpacity>
  );
}

export default function CreateTripPostScreen() {
  const insets = useSafeAreaInsets();
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
      Alert.alert('Share failed', e instanceof Error ? e.message : 'Please try again.');
    }
  }, [selectedTrip, isUploading, caption, createTripPost]);

  const canShare = !!selectedTrip && !isUploading;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <LinearGradient
        colors={['#020208', '#07031a'] as [string, string]}
        style={StyleSheet.absoluteFill}
      />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + Spacing['2'] }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Text style={styles.headerBack}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share a Trip</Text>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={handleShare}
          disabled={!canShare}
          activeOpacity={0.7}
        >
          <Text style={[styles.headerShare, !canShare && styles.headerShareDisabled]}>Share</Text>
        </TouchableOpacity>
      </View>

      {/* Trip list */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color="#a78bfa" />
        </View>
      ) : !trips || trips.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MapTrifold size={48} color={DarkColors.text.tertiary} weight="duotone" />
          <Text style={styles.emptyTitle}>No trips yet</Text>
          <Text style={styles.emptyBody}>Create a trip first, then share it to the feed.</Text>
          <TouchableOpacity
            style={styles.createTripBtn}
            onPress={() => router.replace('/trip/new')}
            activeOpacity={0.8}
          >
            <Text style={styles.createTripBtnText}>Create a Trip</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TripRow
              trip={item}
              selected={selectedTrip?.id === item.id}
              onPress={handleSelectTrip}
            />
          )}
          style={styles.list}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <Text style={styles.sectionHeader}>Your Trips</Text>
          }
          ListFooterComponent={
            <View style={styles.captionSection}>
              <TextInput
                style={styles.captionInput}
                placeholder="Say something about this trip…"
                placeholderTextColor={DarkColors.text.tertiary}
                value={caption}
                onChangeText={setCaption}
                multiline
                maxLength={500}
              />

              <TouchableOpacity
                style={[styles.shareButton, !canShare && styles.shareButtonDisabled]}
                onPress={handleShare}
                disabled={!canShare}
                activeOpacity={0.8}
              >
                <LinearGradient
                  colors={canShare ? (['#a78bfa', '#f472b6'] as [string, string]) : (['#333', '#333'] as [string, string])}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.shareButtonGradient}
                >
                  <Text style={styles.shareButtonText}>
                    {isUploading ? 'Sharing…' : 'Share Trip'}
                  </Text>
                </LinearGradient>
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
    backgroundColor: '#020208',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing['4'],
    paddingBottom: Spacing['3'],
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  headerBtn: {
    minWidth: 60,
    paddingVertical: Spacing['2'],
  },
  headerBack: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
  },
  headerTitle: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
  },
  headerShare: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: '#a78bfa',
    textAlign: 'right',
  },
  headerShareDisabled: {
    color: DarkColors.text.tertiary,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing['8'],
    gap: Spacing['3'],
  },
  emptyTitle: {
    fontSize: FontSize.xl,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.primary,
  },
  emptyBody: {
    fontSize: FontSize.base,
    color: DarkColors.text.secondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  createTripBtn: {
    marginTop: Spacing['2'],
    paddingHorizontal: Spacing['6'],
    paddingVertical: Spacing['3'],
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: '#a78bfa',
  },
  createTripBtnText: {
    fontSize: FontSize.base,
    fontWeight: FontWeight.semiBold,
    color: '#a78bfa',
  },
  list: { flex: 1 },
  listContent: {
    paddingBottom: Spacing['10'],
  },
  sectionHeader: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.bold,
    color: DarkColors.text.tertiary,
    letterSpacing: 1,
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
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  tripRowSelected: {
    borderColor: '#a78bfa',
    backgroundColor: 'rgba(167,139,250,0.08)',
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
    color: DarkColors.text.primary,
  },
  tripDestination: {
    fontSize: FontSize.sm,
    color: DarkColors.text.secondary,
  },
  tripDates: {
    fontSize: FontSize.xs,
    color: DarkColors.text.tertiary,
  },
  captionSection: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    gap: Spacing['4'],
  },
  captionInput: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: Spacing['4'],
    color: DarkColors.text.primary,
    fontSize: FontSize.base,
    minHeight: 100,
    textAlignVertical: 'top',
  },
  shareButton: {
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
  },
  shareButtonDisabled: {
    opacity: 0.5,
  },
  shareButtonGradient: {
    paddingVertical: Spacing['4'],
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: FontSize.md,
    fontWeight: FontWeight.bold,
    color: '#fff',
  },
});
