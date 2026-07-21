import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Animated,
  Image,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import { ArrowLeft, MapTrifold, PencilSimple, MapPin, Plus, Compass } from 'phosphor-react-native';
import { VISIBILITY_ICONS } from '@/constants/icons';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTrip } from '@/hooks/useTrip';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { DayTimeline } from '@/components/trip/DayTimeline';
import { ActivityFormSheet, type ActivityFormData } from '@/components/trip/ActivityFormSheet';
import { AddStopSheet } from '@/components/trip/AddStopSheet';
import { EditTripSheet } from '@/components/trip/EditTripSheet';
import { TripMapView } from '@/components/trip/TripMapView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { TripActivity, TripDay } from '@/types';
import { enrichPlaceByQuery, enrichPlaceById, photoUrl } from '@/services/places/googlePlaces';
import { usePlacesStore } from '@/stores/usePlacesStore';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateRange(start: Timestamp | null, end: Timestamp | null): string {
  if (!start && !end) return 'Dates TBD';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start ? start.toDate().toLocaleDateString('en-US', opts) : '?';
  const endStr = end ? end.toDate().toLocaleDateString('en-US', opts) : '?';
  if (startStr === endStr) return startStr;
  return `${startStr} – ${endStr}`;
}

const STATUS_LABEL: Record<string, string> = {
  planning: 'Planning',
  active: 'Active',
  completed: 'Completed',
};

const VISIBILITY_LABEL: Record<string, string> = {
  public: 'Public',
  followers: 'Followers',
  private: 'Private',
};

// ─── Entrance motion (Fix 5) ──────────────────────────────────────────────────
// Staggered fade + rise-in for each day section, house spring only (tension
// 65 / friction 11) — no shimmer/timing curve. Runs once per mount.
function AnimatedDaySection({
  index,
  style,
  onLayout,
  children,
}: {
  index: number;
  style?: object;
  onLayout?: (event: import('react-native').LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(index * 70),
      Animated.parallel([
        Animated.spring(opacity, { toValue: 1, ...SPRING }),
        Animated.spring(translateY, { toValue: 0, ...SPRING }),
      ]),
    ]).start();
    // Runs once on mount only — day sections don't remount on reorder/edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]} onLayout={onLayout}>
      {children}
    </Animated.View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const currentUserUid = useAuthStore((s) => s.user?.uid ?? null);

  const { data: trip, isLoading } = useTrip(id ?? null);
  const {
    addDay,
    addActivity,
    updateActivity,
    toggleVisited,
    deleteActivity,
    reorderActivities,
    moveActivityToDay,
    deleteDay,
    updateTrip,
  } = useCreateTrip();
  const setPlace = usePlacesStore((s) => s.setPlace);
  const getPlace = usePlacesStore((s) => s.getPlace);

  // Collapsible description state
  const [descExpanded, setDescExpanded] = useState(false);

  // Lazy-grounding state (Part B) — id of the activity currently being resolved
  const [resolvingActivityId, setResolvingActivityId] = useState<string | null>(null);

  // Activity form sheet state (add + edit share one sheet — see ActivityFormSheet)
  const [formVisible, setFormVisible] = useState(false);
  const [formMode, setFormMode] = useState<'add' | 'edit'>('add');
  const [activeDay, setActiveDay] = useState<TripDay | null>(null);
  const [editingActivity, setEditingActivity] = useState<TripActivity | null>(null);

  // Add-stop (place search) sheet state — Phase 4 Part B
  const [addStopDay, setAddStopDay] = useState<TripDay | null>(null);

  // Map view state — Phase 4 Part C
  const [viewMode, setViewMode] = useState<'timeline' | 'map'>('timeline');
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);

  // Map → timeline bridge (TM-1c): "View in timeline" on a map pin scrolls
  // to and briefly highlights the matching row. dayLayoutY is populated by
  // each day section's onLayout as it renders — an approximate scroll
  // target (top of the day, not the exact row), which is enough to find it
  // at a glance since the highlight itself pinpoints the specific row.
  const [highlightActivityId, setHighlightActivityId] = useState<string | null>(null);
  const scrollRef = useRef<React.ElementRef<typeof NestableScrollContainer>>(null);
  const dayLayoutY = useRef<Record<string, number>>({});

  // Owner-only trip edit/delete sheet
  const [editTripVisible, setEditTripVisible] = useState(false);

  const isOwner = !!trip && !!currentUserUid && trip.authorUid === currentUserUid;

  // TM-2b: "current" is derived, never stored — the first not-yet-visited
  // activity in day/order sequence, only while the trip is actually active.
  // Recomputing this on every trip change is cheap and keeps it always
  // correct with zero extra writes to keep in sync.
  const currentActivityId = useMemo(() => {
    if (!trip || trip.status !== 'active') return null;
    const sortedDaysForCurrent = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
    for (const day of sortedDaysForCurrent) {
      const next = [...day.activities].sort((a, b) => a.order - b.order).find((a) => !a.visited);
      if (next) return next.id;
    }
    return null; // every stop visited, or no stops yet
  }, [trip]);

  // ── Cover photo auto-resolve (Fix 1) ─────────────────────────────────────────
  // A trip with no cover renders a blank header, which fails "photos lead."
  // Backfill it from the destination's Google place — but only once, ever, per
  // trip: cache-first (usePlacesStore), and on a cache miss the single Details
  // call's result is written back to the trip doc via updateTrip so every future
  // open of this trip (by anyone) is free. Only the owner can write the trip
  // doc (Firestore rule), so a viewer opening an unresolved trip first just
  // sees the placeholder until an owner opens it once.
  const coverResolveAttempted = useRef<string | null>(null);
  useEffect(() => {
    if (!trip || !isOwner) return;
    if (trip.coverImageUrl !== null) return; // already resolved (real URL, or '' = "no photo found")
    const placeId = trip.destination.placeId;
    if (!placeId) return;
    if (coverResolveAttempted.current === trip.id) return;
    coverResolveAttempted.current = trip.id;

    (async () => {
      const cached = getPlace(placeId);
      let photoNames = cached?.photoNames;

      if (!photoNames) {
        const enriched = await enrichPlaceById(placeId);
        if (!enriched) {
          // Transient failure (network/HTTP) — don't persist a sentinel, so
          // the next time this trip is opened it tries again.
          coverResolveAttempted.current = null;
          return;
        }
        photoNames = enriched.photoNames;
        setPlace({
          placeId,
          name: trip.destination.name,
          address: '',
          lat: trip.destination.lat ?? 0,
          lng: trip.destination.lng ?? 0,
          countryCode: trip.destination.countryCode,
          tier: 'tier2',
          ...enriched,
        });
      }

      const url = photoNames?.[0] ? photoUrl(photoNames[0], 1200) : '';
      await updateTrip(trip.id, { coverImageUrl: url });
    })();
  }, [trip, isOwner, getPlace, setPlace, updateTrip]);

  // ── Handlers: add / edit activity ────────────────────────────────────────────

  const handleOpenAddActivity = useCallback((day: TripDay) => {
    setFormMode('add');
    setActiveDay(day);
    setEditingActivity(null);
    setFormVisible(true);
  }, []);

  const handleOpenEditActivity = useCallback(
    (activity: TripActivity, dayId: string) => {
      const day = trip?.days.find((d) => d.id === dayId) ?? null;
      setFormMode('edit');
      setActiveDay(day);
      setEditingActivity(activity);
      setFormVisible(true);
    },
    [trip],
  );

  const handleCloseForm = useCallback(() => {
    setFormVisible(false);
    setActiveDay(null);
    setEditingActivity(null);
  }, []);

  const handleSubmitActivityForm = useCallback(
    async (data: ActivityFormData) => {
      if (!id || !activeDay) return;
      if (formMode === 'edit' && editingActivity) {
        await updateActivity(id, activeDay.id, editingActivity.id, {
          type: data.type,
          title: data.title,
          startTime: data.startTime,
          endTime: data.endTime,
          notes: data.notes,
        });
        return;
      }
      await addActivity(id, activeDay.id, {
        type: data.type,
        title: data.title,
        startTime: data.startTime,
        endTime: data.endTime,
        notes: data.notes,
        visited: false,
        visitedAt: null,
        placeId: null,
        address: null,
        lat: null,
        lng: null,
        durationMinutes: null,
        bookingRef: null,
        cost: null,
        currency: null,
        mediaUrls: [],
        createdAt: Timestamp.now(),
        searchQuery: null, // manually created — nothing to lazily ground
      });
    },
    [id, activeDay, formMode, editingActivity, addActivity, updateActivity],
  );

  const handleDeleteActivity = useCallback(async () => {
    if (!id || !activeDay || !editingActivity) return;
    await deleteActivity(id, activeDay.id, editingActivity.id);
  }, [id, activeDay, editingActivity, deleteActivity]);

  const handleMoveActivity = useCallback(
    async (targetDayId: string) => {
      if (!id || !activeDay || !editingActivity) return;
      await moveActivityToDay(id, activeDay.id, targetDayId, editingActivity);
    },
    [id, activeDay, editingActivity, moveActivityToDay],
  );

  // ── Handlers: reorder / add stop / delete day ────────────────────────────────

  const handleReorderActivities = useCallback(
    (dayId: string, orderedActivities: TripActivity[]) => {
      if (!id) return;
      reorderActivities(id, dayId, orderedActivities);
    },
    [id, reorderActivities],
  );

  const handleOpenAddStop = useCallback((day: TripDay) => {
    setAddStopDay(day);
  }, []);

  const handleCloseAddStop = useCallback(() => setAddStopDay(null), []);

  const handleDeleteDay = useCallback(
    (day: TripDay) => {
      if (!id || !trip) return;
      Alert.alert(
        'Delete Day',
        `Delete Day ${day.dayNumber} and all its activities? This can't be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => {
              const remaining = trip.days
                .filter((d) => d.id !== day.id)
                .sort((a, b) => a.dayNumber - b.dayNumber);
              deleteDay(id, day.id, remaining);
            },
          },
        ],
      );
    },
    [id, trip, deleteDay],
  );

  const handleAddDay = useCallback(async () => {
    if (!id || !trip) return;
    const nextDayNumber = trip.days.length + 1;
    await addDay(id, {
      dayNumber: nextDayNumber,
      date: null,
      title: '',
      notes: '',
    });
  }, [id, trip, addDay]);

  // ── Lazy grounding (Phase 3 Part B) ──────────────────────────────────────────
  // Grounds one AI-generated stop — one Text Search, persisted so it's never
  // resolved again. Shared by the timeline tap-to-locate AND the map's
  // per-stop / "Locate all" actions (Phase 4 Part C) — one grounding path,
  // not two.
  const handleGroundActivity = useCallback(
    async (activity: TripActivity, dayId: string) => {
      if (!id || activity.placeId || !activity.searchQuery || resolvingActivityId) return;
      setResolvingActivityId(activity.id);
      try {
        const resolved = await enrichPlaceByQuery(activity.searchQuery);
        if (!resolved) {
          console.error('[trip/[id]] could not ground activity:', activity.searchQuery);
          return;
        }
        await updateActivity(id, dayId, activity.id, {
          placeId: resolved.placeId,
          address: resolved.address,
          lat: resolved.lat,
          lng: resolved.lng,
        });
        // Also warm the Search screen's place cache — if the user encounters
        // this same place there later, it's already resolved (zero extra cost).
        setPlace(resolved);
      } catch (err) {
        console.error('[trip/[id]] grounding failed:', err);
      } finally {
        setResolvingActivityId(null);
      }
    },
    [id, resolvingActivityId, updateActivity, setPlace],
  );

  // Timeline tap: ungrounded → ground it in place; already-grounded → jump to
  // the map, centered on its pin (Part C: "tapping an activity in the
  // timeline flies to its pin"). Kept entirely owner-gated at the call site
  // (DayTimeline's onActivityPress prop below) rather than only gating the
  // grounding branch here — ActivityItem uses "is onPress wired at all" to
  // decide whether to show the "Tap to find on map" hint (Part D), so if this
  // were wired unconditionally, a viewer would see that hint on ungrounded
  // stops again, just silently do nothing on tap instead of erroring. Both
  // are a dead end; only fully omitting onPress for viewers avoids it.
  const handleActivityPress = useCallback(
    (activity: TripActivity, dayId: string) => {
      if (activity.placeId) {
        setFocusActivityId(activity.id);
        setViewMode('map');
        return;
      }
      handleGroundActivity(activity, dayId);
    },
    [handleGroundActivity],
  );

  // TM-2b: manual visited toggle — shared by the timeline row and the map's
  // selected-stop card, same as grounding (handleGroundActivity) above.
  const handleToggleVisited = useCallback(
    (activity: TripActivity, dayId: string) => {
      if (!id) return;
      toggleVisited(id, dayId, activity.id, !activity.visited);
    },
    [id, toggleVisited],
  );

  // Map's "View in timeline" (TM-1c) — switch back to the timeline and
  // queue a highlight; the scroll itself happens in the effect below, once
  // the timeline has actually mounted and each day section has reported its
  // layout position.
  const handleViewInTimeline = useCallback((activityId: string) => {
    setViewMode('timeline');
    setFocusActivityId(null);
    setHighlightActivityId(activityId);
  }, []);

  useEffect(() => {
    if (viewMode !== 'timeline' || !highlightActivityId || !trip) return;
    const day = trip.days.find((d) => d.activities.some((a) => a.id === highlightActivityId));
    if (!day) return;
    const scrollTimer = setTimeout(() => {
      const y = dayLayoutY.current[day.id];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - Spacing['4']), animated: true });
      }
    }, 150);
    const clearTimer = setTimeout(() => setHighlightActivityId(null), 2200);
    return () => {
      clearTimeout(scrollTimer);
      clearTimeout(clearTimer);
    };
  }, [viewMode, highlightActivityId, trip]);

  // ── Loading / empty states ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={[styles.headerBtn, { top: insets.top + Spacing['2'], left: Spacing['4'] }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityLabel="Go back"
        >
          <View style={styles.headerBtnCircle}>
            <ArrowLeft size={18} color={colors.text.primary} weight="bold" />
          </View>
        </TouchableOpacity>
        <SkeletonBlock height={HEADER_IMAGE_HEIGHT} radius={0} />
        <View style={styles.titleBlock}>
          <SkeletonBlock width={140} height={11} radius={4} />
          <SkeletonBlock width={220} height={26} radius={6} style={{ marginTop: Spacing['3'] }} />
        </View>
        <View style={[styles.chipStripContent, { marginTop: Spacing['4'] }]}>
          <SkeletonBlock width={110} height={32} radius={BorderRadius.full} />
          <SkeletonBlock width={80} height={32} radius={BorderRadius.full} />
          <SkeletonBlock width={70} height={32} radius={BorderRadius.full} />
        </View>
        <View style={styles.daysSection}>
          {[0, 1].map((i) => (
            <View
              key={i}
              style={[
                styles.daySection,
                i > 0 && { borderTopColor: colors.background.cardBorder, borderTopWidth: StyleSheet.hairlineWidth },
              ]}
            >
              <SkeletonBlock width={90} height={16} radius={4} />
              <View style={{ gap: Spacing['2'], marginTop: Spacing['3'] }}>
                <SkeletonBlock height={52} radius={BorderRadius.md} />
                <SkeletonBlock height={52} radius={BorderRadius.md} />
              </View>
            </View>
          ))}
        </View>
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={[styles.centeredFull, { backgroundColor: colors.background.primary }]}>
        <EmptyState
          icon={Compass}
          title="Trip not found"
          description="It may have been deleted, or you may not have access."
          actionLabel="Go back"
          onAction={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          actionHaptic="none"
        />
      </View>
    );
  }

  const sortedDays = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const hasDescription = Boolean(trip.description?.trim());
  const dayCount = sortedDays.length;
  const eyebrow = `${formatDateRange(trip.startDate, trip.endDate).toUpperCase()}${
    dayCount > 0 ? ` · ${dayCount} DAY${dayCount === 1 ? '' : 'S'}` : ''
  }`;

  if (viewMode === 'map') {
    return (
      <TripMapView
        tripId={trip.id}
        tripTitle={trip.title}
        days={sortedDays}
        isOwner={isOwner}
        resolvingActivityId={resolvingActivityId}
        onLocateStop={handleGroundActivity}
        focusActivityId={focusActivityId}
        onViewInTimeline={handleViewInTimeline}
        onToggleVisited={isOwner ? handleToggleVisited : undefined}
        currentActivityId={currentActivityId}
        onBack={() => {
          setViewMode('timeline');
          setFocusActivityId(null);
        }}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background.primary }]}>
      <NestableScrollContainer
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* ── 1. Photo header — image only; title lives below in the content block ── */}
        <View style={styles.headerImageContainer}>
          {trip.coverImageUrl ? (
            <>
              <Image
                source={{ uri: trip.coverImageUrl }}
                style={StyleSheet.absoluteFill}
                resizeMode="cover"
              />
              {/* Scrim: extra legibility margin for the header buttons over
                  unpredictable photo content — the buttons themselves don't
                  depend on it (see headerBtnCircle). */}
              <LinearGradient
                colors={['rgba(0,0,0,0.32)', 'rgba(0,0,0,0)']}
                style={styles.headerScrim}
                pointerEvents="none"
              />
              {/* Required Google attribution — every cover photo on this screen
                  comes from a Google place (no manual-upload path exists). */}
              <View style={styles.attributionPill}>
                <Text style={styles.attributionText}>Photo: Google</Text>
              </View>
            </>
          ) : (
            // Warm neutral placeholder — never a blank bar. Names the place so
            // it still reads as "this trip", not a generic empty box.
            <View style={[StyleSheet.absoluteFill, styles.headerPlaceholder, { backgroundColor: colors.background.sunken }]}>
              <MapTrifold size={30} color={colors.text.disabled} weight="duotone" />
              <Text style={[styles.headerPlaceholderText, { color: colors.text.disabled }]} numberOfLines={1}>
                {trip.destination.name}
              </Text>
            </View>
          )}

          {/* Back button — light-translucent circle + dark icon reads on both
              a photo (aided by the scrim above) and the plain placeholder. */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.back();
            }}
            style={[styles.headerBtn, { top: insets.top + Spacing['2'], left: Spacing['4'] }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Go back"
          >
            <View style={styles.headerBtnCircle}>
              <ArrowLeft size={18} color={colors.text.primary} weight="bold" />
            </View>
          </TouchableOpacity>

          {/* Map toggle — visible to everyone; owner-only actions are gated inside TripMapView */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setViewMode('map');
            }}
            style={[
              styles.headerBtn,
              { top: insets.top + Spacing['2'], right: isOwner ? Spacing['4'] + 44 + Spacing['2'] : Spacing['4'] },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Show trip map"
          >
            <View style={styles.headerBtnCircle}>
              <MapTrifold size={18} color={colors.text.primary} weight="bold" />
            </View>
          </TouchableOpacity>

          {/* Owner-only trip editing — the map toggle above already reserves
              this slot's width when isOwner. */}
          {isOwner && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setEditTripVisible(true);
              }}
              style={[styles.headerBtn, { top: insets.top + Spacing['2'], right: Spacing['4'] }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Edit trip"
            >
              <View style={styles.headerBtnCircle}>
                <PencilSimple size={18} color={colors.text.primary} weight="bold" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 2. Title block — eyebrow + editorial title ── */}
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{eyebrow}</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>{trip.title}</Text>
        </View>

        {/* ── 3. Chips: destination + status + visibility ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipStrip}
          contentContainerStyle={styles.chipStripContent}
        >
          <View style={[styles.chip, { backgroundColor: colors.background.sunken }]}>
            <MapPin size={13} color={colors.text.secondary} weight="bold" />
            <Text style={[styles.chipText, { color: colors.text.primary }]} numberOfLines={1}>
              {trip.destination.name}
            </Text>
          </View>

          <View
            style={[
              styles.chip,
              { backgroundColor: colors.status[trip.status]?.bg ?? colors.background.sunken },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.status[trip.status]?.text ?? colors.text.secondary },
              ]}
            >
              {STATUS_LABEL[trip.status] ?? trip.status}
            </Text>
          </View>

          {/* Visibility — labeled like its sibling chips; an icon alone here
              read as meaningless (nothing else in the row is icon-only). */}
          <View style={[styles.chip, { backgroundColor: colors.background.sunken }]}>
            {(() => {
              const { Icon: VIcon, color: vColor } = VISIBILITY_ICONS[trip.visibility] ?? VISIBILITY_ICONS.public;
              return <VIcon size={13} color={vColor} weight="duotone" />;
            })()}
            <Text style={[styles.chipText, { color: colors.text.primary }]}>
              {VISIBILITY_LABEL[trip.visibility] ?? trip.visibility}
            </Text>
          </View>
        </ScrollView>

        {/* ── 4. Description ── */}
        {hasDescription && (
          <View style={styles.descriptionContainer}>
            <Text
              style={[styles.descriptionText, { color: colors.text.secondary }]}
              numberOfLines={descExpanded ? undefined : 3}
            >
              {trip.description}
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDescExpanded((v) => !v);
              }}
              // A bare 13px text line with no padding wrapper is ~17pt tall —
              // hitSlop 4 landed at ~25pt, well short of the 44pt floor.
              hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
            >
              <Text style={[styles.readMoreText, { color: colors.text.primary }]}>
                {descExpanded ? 'Show less' : 'Read more'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 5. Day sections — hairline-divided, not boxed cards ── */}
        <View style={styles.daysSection}>
          {sortedDays.length === 0 ? (
            isOwner ? (
              <EmptyState
                icon={MapTrifold}
                title="Start your first day"
                description="Add a day to begin planning your itinerary."
                actionLabel="Add a day"
                onAction={handleAddDay}
              />
            ) : (
              <EmptyState icon={MapTrifold} title="No itinerary yet" />
            )
          ) : (
            <>
              {sortedDays.map((day, index) => (
                <AnimatedDaySection
                  key={day.id}
                  index={index}
                  style={[
                    styles.daySection,
                    index > 0 && { borderTopColor: colors.background.cardBorder, borderTopWidth: StyleSheet.hairlineWidth },
                  ]}
                  onLayout={(e) => { dayLayoutY.current[day.id] = e.nativeEvent.layout.y; }}
                >
                  <DayTimeline
                    day={day}
                    editable={isOwner}
                    onAddActivity={isOwner ? () => handleOpenAddActivity(day) : undefined}
                    onAddStop={isOwner ? () => handleOpenAddStop(day) : undefined}
                    onEditActivity={isOwner ? (activity) => handleOpenEditActivity(activity, day.id) : undefined}
                    onActivityPress={isOwner ? handleActivityPress : undefined}
                    onToggleVisited={isOwner ? handleToggleVisited : undefined}
                    onReorderActivities={isOwner ? handleReorderActivities : undefined}
                    onDeleteDay={isOwner ? () => handleDeleteDay(day) : undefined}
                    resolvingActivityId={resolvingActivityId}
                    highlightActivityId={highlightActivityId}
                    currentActivityId={currentActivityId}
                  />
                </AnimatedDaySection>
              ))}

              {/* ── 6. Add Day — tertiary text link, not a competing action ──
                  Writes a day immediately (handleAddDay), so Medium — fired
                  here rather than inside handleAddDay itself, since that
                  handler is shared with the empty-days EmptyState action
                  above, which already gets its haptic from Button. */}
              {isOwner && (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    handleAddDay();
                  }}
                  style={styles.addDayLink}
                  activeOpacity={0.7}
                  hitSlop={8}
                >
                  <Plus size={14} color={colors.text.secondary} weight="bold" />
                  <Text style={[styles.addDayLinkText, { color: colors.text.secondary }]}>
                    Add day
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </NestableScrollContainer>

      {/* ── Add / Edit Activity Sheet ── */}
      <ActivityFormSheet
        visible={formVisible}
        mode={formMode}
        activity={editingActivity}
        days={sortedDays}
        currentDayId={activeDay?.id}
        onClose={handleCloseForm}
        onSubmit={handleSubmitActivityForm}
        onDelete={formMode === 'edit' ? handleDeleteActivity : undefined}
        onMoveToDay={formMode === 'edit' ? handleMoveActivity : undefined}
      />

      {/* ── Add Stop Sheet (Part B — place search) ── */}
      {addStopDay && id ? (
        <AddStopSheet
          visible={!!addStopDay}
          tripId={id}
          dayId={addStopDay.id}
          dayNumber={addStopDay.dayNumber}
          onClose={handleCloseAddStop}
        />
      ) : null}

      {/* ── Edit / delete trip (owner only) ── */}
      {isOwner && trip ? (
        <EditTripSheet
          visible={editTripVisible}
          trip={trip}
          onClose={() => setEditTripVisible(false)}
          onDeleted={() => {
            setEditTripVisible(false);
            router.back();
          }}
        />
      ) : null}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const HEADER_IMAGE_HEIGHT = 280;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centeredFull: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['4'],
  },
  // ── Scroll ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: Spacing['12'],
  },

  // ── Header Image (photo only — no title overlay, see titleBlock) ──
  headerImageContainer: {
    height: HEADER_IMAGE_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  headerBtn: {
    position: 'absolute',
    zIndex: 10,
  },
  headerBtnCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    // Fixed light-translucent circle + dark icon (set at each call site via
    // colors.text.primary) — legible over BOTH a photo (helped by the scrim
    // above it) and the plain placeholder, unlike a fixed dark overlay which
    // reads as a grey blob with no photo behind it.
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  headerScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 96,
  },
  headerPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['2'],
    paddingHorizontal: Spacing['8'],
  },
  headerPlaceholderText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
  attributionPill: {
    position: 'absolute',
    right: Spacing['3'],
    bottom: Spacing['3'],
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: Spacing['2'],
    paddingVertical: 3,
  },
  attributionText: {
    fontSize: 10,
    fontWeight: FontWeight.medium,
    color: 'rgba(255,255,255,0.85)',
  },

  // ── Title block — the editorial signature: eyebrow above a big title ──
  titleBlock: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    gap: Spacing['2'],
  },
  eyebrow: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    letterSpacing: 0.08 * FontSize.xs,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: FontSize['2xl'],
    fontWeight: FontWeight.semiBold,
    letterSpacing: -0.02 * FontSize['2xl'],
    lineHeight: FontSize['2xl'] * 1.15,
  },

  // ── Chip strip ──
  chipStrip: {
    marginTop: Spacing['4'],
  },
  chipStripContent: {
    paddingHorizontal: Spacing['5'],
    gap: Spacing['2'],
    flexDirection: 'row',
    alignItems: 'center',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing['1'],
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing['3'],
    paddingVertical: Spacing['2'],
  },
  chipText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },

  // ── Description ──
  descriptionContainer: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['5'],
    gap: Spacing['2'],
  },
  descriptionText: {
    fontSize: FontSize.base,
    lineHeight: FontSize.base * 1.5,
  },
  readMoreText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.semiBold,
  },

  // ── Days Section — hairline-divided, not boxed cards ──
  daysSection: {
    paddingHorizontal: Spacing['5'],
    paddingTop: Spacing['8'],
    gap: Spacing['6'],
  },
  daySection: {
    paddingTop: Spacing['6'],
  },

  // ── Add Day — tertiary text link ──
  addDayLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing['1'],
    paddingVertical: Spacing['3'],
  },
  addDayLinkText: {
    fontSize: FontSize.sm,
    fontWeight: FontWeight.medium,
  },
});
