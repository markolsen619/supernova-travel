import { useTripBudgetAmount } from '@/hooks/useTripBudget';
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
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Timestamp } from 'firebase/firestore';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import { ArrowLeft, MapTrifold, Signpost, PencilSimple, MapPin, Plus, Compass, Camera, UsersThree, Wallet, Backpack, DotsThree, EyeSlash, Export, Ticket } from 'phosphor-react-native';
import { VISIBILITY_ICONS } from '@/constants/icons';
import { DarkColors, LightColors } from '@/constants/colors';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTrip } from '@/hooks/useTrip';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { DayTimeline } from '@/components/trip/DayTimeline';
import { ActivityFormSheet, type ActivityFormData } from '@/components/trip/ActivityFormSheet';
import { AddStopSheet } from '@/components/trip/AddStopSheet';
import { PlaceDetailSheet } from '@/components/search/PlaceDetailSheet';
import { activityToPlace, canShowPlaceSheet } from '@/utils/activityPlace';
import { EditTripSheet } from '@/components/trip/EditTripSheet';
import { JournalSheet } from '@/components/trip/JournalSheet';
import { TripRecapSheet } from '@/components/trip/TripRecapSheet';
import { InviteFriendsSheet } from '@/components/trip/InviteFriendsSheet';
import { ShareTripSheet } from '@/components/trip/ShareTripSheet';
import { TripBookingsSheet } from '@/components/trip/TripBookingsSheet';
import { useTripBookings } from '@/hooks/useTripBookings';
import { bookingsByDay, type TripBooking } from '@/utils/bookingDays';
import { bookingRoute } from '@/utils/sharedBookings';
import { canShareTrip } from '@/utils/tripShare';
import { TripMapView } from '@/components/trip/TripMapView';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Avatar } from '@/components/ui/Avatar';
import { FontSize, FontWeight } from '@/constants/typography';
import { Spacing, BorderRadius } from '@/constants/spacing';
import { SPRING } from '@/constants/motion';
import { TripActivity, TripDay, Destination } from '@/types';
import { usePlacesStore } from '@/stores/usePlacesStore';
import { useTripCoverResolver } from '@/hooks/useTripCoverResolver';
import { useAuthorProfiles } from '@/hooks/useAuthorProfiles';
import { useModeration } from '@/hooks/useModeration';
import { useContentActions } from '@/components/moderation/useContentActions';
import { contentKey, isContentVisible } from '@/utils/moderation';
import { groundStop, type GroundingContext } from '@/services/places/groundStop';
import type { GroundedPlace } from '@/utils/mapboxQuery';
import { boundsToBbox, bboxCenter } from '@/utils/geoBounds';
import { resolveDayDestinationIndices } from '@/utils/dayDestination';
import * as WebBrowser from 'expo-web-browser';
import { CitySection } from '@/components/trip/CitySection';
import { RouteEditorSheet } from '@/components/trip/RouteEditorSheet';
import { draftFromRows, previewRoute, routeRowsFromTrip, tripLayout, useTripRoute } from '@/hooks/useTripRoute';
import { useTripSectionsStore } from '@/stores/useTripSectionsStore';
import { cityRanges, citySummary, dropsWarning, shortDay, moveRow, removeRow, setRowNights, type CityRange, type RouteRow } from '@/utils/tripRoute';
import { cityBookings } from '@/utils/cityBookings';
import { buildBookingAction } from '@/utils/bookingLinks';
import { isSectionOpen } from '@/utils/walletByTrip';
import { toCalendarDate } from '@/utils/calendarDate';
import { selectStopsToGround } from '@/utils/groundingQueue';
import { venueTitle } from '@/utils/venueTitle';
import { hotelStayDates } from '@/utils/hotelStay';
import { tripPlaceLabel } from '@/utils/tripRegion';
import { displayStatus, toDateOrNull, STATUS_LABEL as TRIP_STATUS_LABEL } from '@/utils/tripStatus';
import { useProGate } from '@/hooks/useProGate';
import { Badge } from '@/components/ui/Badge';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatDateRange(start: Timestamp | null, end: Timestamp | null): string {
  if (!start && !end) return 'Dates TBD';
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const startStr = start ? start.toDate().toLocaleDateString('en-US', opts) : '?';
  const endStr = end ? end.toDate().toLocaleDateString('en-US', opts) : '?';
  if (startStr === endStr) return startStr;
  return `${startStr} – ${endStr}`;
}


const VISIBILITY_LABEL: Record<string, string> = {
  public: 'Public',
  followers: 'Followers',
  private: 'Private',
};

// ─── Grounding context (Fix 10) ───────────────────────────────────────────────
// The primary destination lives at index 0; additionalDestinations[i - 1]
// holds every index beyond that, mirroring resolveDayDestinationIndices'
// output. Falls back to trip.destination when an index is out of range
// (shouldn't happen given resolveDayDestinationIndices' own clamping, but a
// missing box must never fall through to an unbiased search).
function destinationAt(
  trip: { destination: Destination; additionalDestinations: Destination[] },
  index: number,
): Destination {
  return index === 0 ? trip.destination : (trip.additionalDestinations[index - 1] ?? trip.destination);
}

/**
 * Derives the Mapbox bbox + Google bias center for a destination. Crucially,
 * `center` falls back to the destination's own lat/lng when there's no
 * persisted bounds box yet — groundStop must never receive a null bbox AND a
 * null center together, since that sends Google an unbiased global search.
 * That exact gap is how a La Paz, Baja California Sur trip used to resolve
 * its stops in La Paz, Bolivia.
 */
function groundingContextFor(dest: Destination): GroundingContext {
  const bbox = boundsToBbox(dest.bounds);
  const center =
    bbox != null
      ? bboxCenter(bbox)
      : dest.lat != null && dest.lng != null
        ? { lat: dest.lat, lng: dest.lng }
        : null;
  return { bbox, center };
}

/**
 * Outcome of one grounding lookup — deliberately not a bare `GroundedPlace |
 * null`. 'skipped' (the in-flight guard fired before any search ran) and
 * 'failed' (a real lookup came back with nothing) both need to be
 * distinguishable from each other and from 'resolved': collapsing 'skipped'
 * into the same null as 'failed' previously let the background pass mistake
 * "another caller already owns this activity" for "this doesn't exist" and
 * permanently persist a groundingFailedAt marker on a perfectly resolvable
 * stop. See groundAndPersist and the background pass below.
 */
type GroundingOutcome =
  | { status: 'resolved'; place: GroundedPlace }
  | { status: 'failed' }
  | { status: 'skipped' };

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

/**
 * Icon colour for the floating header buttons (back, map, edit, more).
 *
 * Fixed dark, NOT colors.text.primary. headerBtnCircle is a deliberately
 * theme-independent light circle — it has to stay legible over an arbitrary
 * cover photo, which a themed surface cannot. Pairing it with the themed text
 * colour meant a near-white icon on a near-white circle in dark mode: the
 * back, map and edit buttons were invisible to anyone not on the light theme.
 *
 * The circle is light in every theme, so its contents are too.
 */
const HEADER_ICON = LightColors.text.primary;

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
    patchActivityGrounding,
    toggleVisited,
    deleteActivity,
    reorderActivities,
    moveActivityToDay,
    deleteDay,
  } = useCreateTrip();
  const setPlace = usePlacesStore((s) => s.setPlace);
  const getPlace = usePlacesStore((s) => s.getPlace);
  const { resolveCover } = useTripCoverResolver();

  // Who's on this trip — author + accepted collaborators. Only fetched once
  // there's actually a trip; the picker itself batches this same lookup.
  const memberUids = useMemo(
    () => (trip ? [trip.authorUid, ...trip.collaborators] : []),
    [trip],
  );
  const { data: memberProfiles = {} } = useAuthorProfiles(memberUids);

  // Collapsible description state
  const [descExpanded, setDescExpanded] = useState(false);

  // Lazy-grounding state (Part B) — id of the activity currently being resolved
  const [resolvingActivityId, setResolvingActivityId] = useState<string | null>(null);
  // Activities whose grounding search came back with no match this session —
  // lets the map's bulk "Locate all" skip re-billing a Text Search for a
  // stop it already knows won't resolve, without blocking a deliberate
  // individual retry (tapping that stop directly still tries again).
  const [unresolvedActivityIds, setUnresolvedActivityIds] = useState<Set<string>>(new Set());
  // In-flight grounding lookups, keyed by activityId — a ref, not state, so it
  // survives the awaits inside groundAndPersist without needing a re-render.
  // The background pass and "Locate all" both funnel through groundAndPersist,
  // and "Locate all" snapshots its stop list at click time (it doesn't shrink
  // as the background pass works), so without this guard the two loops can
  // both start a lookup for the same activity and double-bill it.
  const groundingInFlight = useRef<Set<string>>(new Set());

  // The background pass below is deliberately not keyed on `trip` — re-keying
  // would restart it on every write it makes. But it must still see a bounds
  // backfill that lands mid-pass, or a trip whose box arrives a beat after the
  // pass starts grounds every remaining stop unboxed, through Google, at ~10x
  // the intended cost. A ref gives it the latest trip without re-keying.
  const tripRef = useRef(trip);
  tripRef.current = trip;

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
  // The one-city view's section top (multi-city trips): day positions inside it are relative to it.
  const citySectionY = useRef(0);

  // Owner-only trip edit/delete sheet
  const [editTripVisible, setEditTripVisible] = useState(false);

  // TM-3: journal sheet for a visited stop — reachable from both the
  // timeline and the map, so it's owned here and rendered in both branches.
  const [journalActivity, setJournalActivity] = useState<{ activity: TripActivity; dayId: string } | null>(null);

  // The tapped stop's place sheet. Its own Animated.Value rather than sharing
  // one with another sheet — see search.tsx, where sharing would have dragged
  // two sheets at once.
  const [placeActivity, setPlaceActivity] = useState<TripActivity | null>(null);
  const placeSlideAnim = useRef(new Animated.Value(600)).current;

  const handleDismissPlace = useCallback(() => {
    Animated.spring(placeSlideAnim, { toValue: 600, ...SPRING }).start(() => {
      setPlaceActivity(null);
    });
  }, [placeSlideAnim]);

  // "Show on map" from inside the sheet — the pin is still one tap away for
  // anyone who wanted it, it just isn't the default any more.
  const handleShowPlaceOnMap = useCallback(() => {
    const activityId = placeActivity?.id;
    handleDismissPlace();
    if (activityId) {
      setFocusActivityId(activityId);
      setViewMode('map');
    }
  }, [placeActivity, handleDismissPlace]);
  // TM-3d: trip recap
  const [recapVisible, setRecapVisible] = useState(false);
  // Invite friends (request/accept) — owner or existing collaborator only
  const [inviteVisible, setInviteVisible] = useState(false);
  const [shareVisible, setShareVisible] = useState(false);
  const [bookingsVisible, setBookingsVisible] = useState(false);
  // Multi-city trips: tapping a city's pill shows only its days (utils/dayDestination daysInDestination).
  const [cityFilter, setCityFilter] = useState<number | null>(null);
  const toggleCity = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCityFilter((current) => (current === index ? null : index));
  }, []);
  const openBooking = useCallback((b: TripBooking) => {
    router.push(bookingRoute(b) as Href);
  }, [router]);

  // ── Multi-city route (docs/superpowers/specs/2026-10-09-city-route-design.md) ──
  const [routeEditorVisible, setRouteEditorVisible] = useState(false);
  const { saveRoute } = useTripRoute();
  const sectionsOpen = useTripSectionsStore((s) => s.open);
  const setSectionOpen = useTripSectionsStore((s) => s.setOpen);
  /** Save a changed route, confirming first if it would delete days that hold stops. */
  // One route save at a time: a second tap would plan from the same, not-yet-refreshed trip.
  const routeSaving = useRef(false);
  const applyRoute = useCallback((rows: RouteRow<Destination>[], alsoDelete: TripDay[] = []) => {
    if (!trip || routeSaving.current) return;
    const base = alsoDelete.length ? { ...trip, days: trip.days.filter((d) => !alsoDelete.some((g) => g.id === d.id)) } : trip;
    const draft = draftFromRows(rows);
    const plan = previewRoute(base, draft);
    const commit = () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setCityFilter(null); // city indices may have moved
      routeSaving.current = true;
      saveRoute(base, draft, alsoDelete)
        .catch((err) => {
          console.warn('[route] save failed', err);
          Alert.alert("The route didn't save", 'Check your connection and try again.');
        })
        .finally(() => { routeSaving.current = false; });
    };
    if (plan.dropsWithStops.length === 0) { commit(); return; }
    const names = [trip.destination.name, ...trip.additionalDestinations.map((d) => d.name)];
    Alert.alert('Delete these days?', dropsWarning(plan.dropsWithStops, names), [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: commit },
    ]);
  }, [trip, saveRoute]);
  const openCityMenu = useCallback((ci: number) => {
    if (!trip) return;
    // Android shows at most three alert buttons; the route editor has every action.
    if (Platform.OS === 'android') { setRouteEditorVisible(true); return; }
    const rows = routeRowsFromTrip(trip);
    const name = rows[ci]?.place.name ?? '';
    const neighbour = ci < rows.length - 1 ? rows[ci + 1].place.name : rows[ci - 1]?.place.name;
    const confirmRemove = () => Alert.alert(`Remove ${name}?`, 'What should happen to its days?', [
      ...(neighbour ? [{ text: `Move them to ${neighbour}`, onPress: () => applyRoute(removeRow(rows, ci, 'move')) }] : []),
      { text: 'Delete its days', style: 'destructive' as const, onPress: () => applyRoute(removeRow(rows, ci, 'delete')) },
      { text: 'Cancel', style: 'cancel' as const },
    ]);
    Alert.alert(name, undefined, [
      { text: 'Change nights', onPress: () => setRouteEditorVisible(true) },
      ...(ci > 0 ? [{ text: 'Move earlier', onPress: () => applyRoute(moveRow(rows, ci, -1)) }] : []),
      ...(ci < rows.length - 1 ? [{ text: 'Move later', onPress: () => applyRoute(moveRow(rows, ci, 1)) }] : []),
      ...(rows.length > 1 ? [{ text: 'Remove city', style: 'destructive' as const, onPress: confirmRemove }] : []),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  }, [trip, applyRoute]);
  /** Deleting one day in a city: that city loses a night, so later cities' dates stay right. */
  const deleteDayInCity = useCallback((day: TripDay, ci: number) => {
    if (!trip) return;
    const rows = routeRowsFromTrip(trip);
    if (!rows[ci] || rows[ci].nights <= 1) {
      Alert.alert(`${rows[ci]?.place.name ?? 'A city'} needs at least one night`, 'To drop it, remove the city from its ⋯ menu instead.');
      return;
    }
    Alert.alert(`Delete Day ${day.dayNumber}?`, `${rows[ci].place.name} becomes a night shorter, and the days after it move one day earlier.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => applyRoute(setRowNights(rows, ci, rows[ci].nights - 1), [day]) },
    ]);
  }, [trip, applyRoute]);
  const addDayInCity = useCallback((ci: number) => {
    if (!trip) return;
    const rows = routeRowsFromTrip(trip);
    applyRoute(setRowNights(rows, ci, rows[ci].nights + 1));
  }, [trip, applyRoute]);
  const findStay = useCallback((name: string, range: CityRange) => {
    const action = buildBookingAction({
      type: 'hotel', placeId: '', name, near: null, checkIn: range.arrive, checkOut: range.leave,
      affiliateId: process.env.EXPO_PUBLIC_BOOKING_AFFILIATE_ID ?? null,
    });
    if (action) WebBrowser.openBrowserAsync(action.url);
  }, []);
  const addBooking = useCallback(() => router.push('/(wallet)/reservation/add'), [router]);

  const isOwner = !!trip && !!currentUserUid && trip.authorUid === currentUserUid;
  const isCollaborator = !!trip && !!currentUserUid && trip.collaborators.includes(currentUserUid);
  // Your own wallet bookings linked to this trip — never anyone else's. Only
  // fetched when you're on the trip, the only trips a booking can link to;
  // anyone else opening it would pay two queries for nothing.
  const { bookings: tripBookings } = useTripBookings(trip && (isOwner || isCollaborator) ? trip.id : null);
  // The itinerary belongs to everyone taking the trip: the owner and accepted
  // invitees edit days and stops alike (firestore.rules allows both). Trip
  // settings (title, dates, visibility, delete) and the journal stay owner-only.
  const canEditItinerary = isOwner || isCollaborator;
  // Budget and packing belong to the people taking the trip — nobody else sees them.
  const { budget: tripBudget } = useTripBudgetAmount(trip?.id ?? null, isOwner || isCollaborator);
  const { isPro, requirePro } = useProGate();
  // Upcoming → Live → Completed from the trip's dates (utils/tripStatus).
  const tripStatus = trip
    ? displayStatus({ status: trip.status, startDate: toDateOrNull(trip.startDate), endDate: toDateOrNull(trip.endDate) }, new Date())
    : 'planning';

  const moderation = useModeration();
  const { openActions, reportSheet, unblock } = useContentActions();
  const moreRef = useRef<View>(null);
  const authorName = trip ? memberProfiles[trip.authorUid]?.name ?? 'this traveler' : 'this traveler';
  const handleMore = useCallback(() => {
    if (!trip) return;
    openActions({
      target: { type: 'trip', id: trip.id, ownerUid: trip.authorUid },
      ownerName: authorName,
      anchor: moreRef,
    });
  }, [trip, authorName, openActions]);

  // TM-2b: "current" is derived, never stored — the first not-yet-visited
  // activity in day/order sequence, only while the trip is actually active.
  // Recomputing this on every trip change is cheap and keeps it always
  // correct with zero extra writes to keep in sync.
  const currentActivityId = useMemo(() => {
    if (!trip || tripStatus !== 'active') return null;
    const sortedDaysForCurrent = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
    for (const day of sortedDaysForCurrent) {
      const next = [...day.activities].sort((a, b) => a.order - b.order).find((a) => !a.visited);
      if (next) return next.id;
    }
    return null; // every stop visited, or no stops yet
  }, [trip, tripStatus]);

  // TM-3d: gates the "Recap" chip — no point offering an empty story.
  const visitedCount = useMemo(() => {
    if (!trip) return 0;
    return trip.days.reduce((n, d) => n + d.activities.filter((a) => a.visited).length, 0);
  }, [trip]);

  // ── Cover photo auto-resolve (Fix 1) ─────────────────────────────────────────
  // A trip with no cover renders a blank header, which fails "photos lead."
  // Backfill it from the destination's Google place — including grounding
  // the destination itself first for AI-generated trips, which only ever
  // carry a name (see useTripCoverResolver). Owner-only (Firestore rule), so
  // a viewer opening an unresolved trip first just sees the placeholder
  // until an owner opens it once.
  useEffect(() => {
    if (!trip) return;
    resolveCover(trip, isOwner);
  }, [trip, isOwner, resolveCover]);

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
        groundingFailedAt: null,
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
      reorderActivities(id, dayId, orderedActivities).catch((err) => {
        // The list has already snapped back (reorderActivities reverts its
        // optimistic order), so say why rather than leave it looking ignored.
        console.error('[trip] reorder failed:', err);
        Alert.alert("Couldn't save the new order", 'Check your connection and try moving it again.');
      });
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
    // Carry the destination forward rather than writing null. Day 1 of an empty
    // trip is the primary destination; an appended day continues wherever the
    // trip currently is. This matters beyond tidiness:
    // resolveDayDestinationIndices is all-or-nothing, so a single null day
    // discards every other day's explicit index and demotes the whole itinerary
    // to transport-marker inference.
    const destinationIndex =
      trip.days.length === 0
        ? 0
        : trip.days[trip.days.length - 1]?.destinationIndex ?? null;
    await addDay(id, {
      dayNumber: nextDayNumber,
      destinationIndex,
      date: null,
      title: '',
      notes: '',
    });
  }, [id, trip, addDay]);

  // ── Lazy grounding (Phase 3 Part B, Fix 10) ──────────────────────────────────
  // destinationNames / dayDestinationIndices are the same tiered resolution
  // (explicit index → transport-marker inference → index 0) used both to bias
  // a single manual tap and to build the background pass' queue below — one
  // source of truth for "which city is this day in."
  const destinationNames = useMemo(
    () => (trip ? [trip.destination.name, ...trip.additionalDestinations.map((d) => d.name)] : []),
    [trip],
  );
  const dayDestinationIndices = useMemo(
    () => (trip ? resolveDayDestinationIndices(trip.days, destinationNames) : []),
    [trip, destinationNames],
  );

  // Booking hand-off for the tapped stop. A hotel gets its own nights (not
  // the whole trip's, which booked multi-city travelers into their first
  // hotel for every night) and the city its day is in, so a chain name
  // searches for the right property.
  const placeBooking = useMemo(() => {
    if (!trip || !placeActivity) return null;
    const dayIndex = trip.days.findIndex((d) => d.activities.some((a) => a.id === placeActivity.id));
    const near = destinationAt(trip, dayIndex >= 0 ? (dayDestinationIndices[dayIndex] ?? 0) : 0).name;
    const tripStart = trip.startDate ? trip.startDate.toDate() : null;
    const tripEnd = trip.endDate ? trip.endDate.toDate() : null;
    const stay = placeActivity.type === 'hotel'
      ? hotelStayDates(
          trip.days.map((d) => ({ dayNumber: d.dayNumber, date: d.date ? d.date.toDate() : null, activities: d.activities })),
          placeActivity,
          { start: tripStart, end: tripEnd },
        )
      : { checkIn: tripStart, checkOut: tripEnd };
    return {
      type: placeActivity.type,
      near,
      checkIn: stay.checkIn ? toCalendarDate(stay.checkIn) : null,
      checkOut: stay.checkOut ? toCalendarDate(stay.checkOut) : null,
    };
  }, [trip, placeActivity, dayDestinationIndices]);

  // Persists one already-resolved grounding outcome to one activity — success
  // writes coordinates, failure persists `groundingFailedAt`. Split out of
  // groundAndPersist so a single lookup shared across a deduplicated group of
  // stops (StopToGround.targets) can be applied to every target without a
  // second Mapbox/Google call — see groundAndPersist and the background pass
  // below.
  //
  // Note: `groundingFailedAt` is read by the automatic pass (selectStopsToGround
  // skips it) and by this session's own re-tap of the same in-memory activity
  // (unresolvedActivityIds), but NOT by "Locate all" or a fresh tap on a
  // different mount — unresolvedActivityIds starts empty every mount and is
  // never seeded from the persisted marker, so those paths still re-bill an
  // already-known-unresolvable stop until the automatic pass catches it again.
  //
  // Writes go through `patchActivityGrounding`, not `updateActivity`: the same
  // Firestore write, but it reconciles the cached trip instead of invalidating
  // it. The background pass is sequential and runs this once per stop, so an
  // invalidation here made every stop wait on a full trip refetch (trip doc +
  // days query + one activities query per day) before the next lookup started.
  const applyGroundingResult = useCallback(
    async (dayId: string, activityId: string, resolved: GroundedPlace | null) => {
      if (!id) return;
      if (!resolved) {
        setUnresolvedActivityIds((prev) => new Set(prev).add(activityId));
        await patchActivityGrounding(id, dayId, activityId, { groundingFailedAt: Timestamp.now() });
        return;
      }
      // A business also names the stop: an AI stop often arrives as a
      // category ("Hotels near Mission Beach"), and without this the timeline
      // never says which hotel grounding picked. Areas are never used — see
      // isVenue.
      // tripRef, not trip: keying this on trip would restart the background
      // pass on every write it makes (see tripRef above).
      const activity = tripRef.current?.days.find((d) => d.id === dayId)?.activities.find((a) => a.id === activityId);
      const renamed = resolved.isVenue && activity ? venueTitle(activity, resolved.name) : null;
      await patchActivityGrounding(id, dayId, activityId, {
        placeId: resolved.placeId,
        address: resolved.address,
        lat: resolved.lat,
        lng: resolved.lng,
        ...(resolved.isVenue && resolved.name ? { placeName: resolved.name } : {}),
        ...(renamed ? { title: renamed } : {}),
      });
      // Only a Google result carries a real Google placeId — a Mapbox result
      // would poison the Search screen's place-detail cache (keyed by
      // placeId) with an entry that has none. And never downgrade an entry
      // already cached at tier2 (full Place Details) this session — a
      // grounding-mask tier1 write would force a later re-enrichment call for
      // no reason, since tier2's data already covers everything tier1 has.
      if (resolved.source === 'google' && getPlace(resolved.placeId ?? '')?.tier !== 'tier2') {
        setPlace({
          placeId: resolved.placeId ?? '',
          name: resolved.name,
          address: resolved.address ?? '',
          lat: resolved.lat,
          lng: resolved.lng,
          countryCode: resolved.countryCode,
          tier: 'tier1',
        });
      }
      setUnresolvedActivityIds((prev) => {
        if (!prev.has(activityId)) return prev;
        const next = new Set(prev);
        next.delete(activityId);
        return next;
      });
    },
    [id, patchActivityGrounding, setPlace, getPlace],
  );

  // Runs one grounding lookup and persists it — the single Mapbox/Google call
  // per (dayId, activityId, searchQuery). Guarded by `groundingInFlight` so
  // the background pass and "Locate all" can never both start a lookup for
  // the same activity: the ref (not state, so it survives the awaits below)
  // is checked-and-added before the call and cleared in `finally`. Returns a
  // GroundingOutcome rather than overloading `null` — 'skipped' (the in-flight
  // guard fired; nothing was searched, nothing was written) is a materially
  // different outcome from 'failed' (a real lookup came back with nothing).
  // Collapsing those into one null previously let a caller grounding a
  // deduplicated group of stops mistake "someone else already owns this" for
  // "this doesn't exist" and permanently brand the rest of the group
  // unresolvable — see the background pass below, which is why this
  // distinction exists. Shared by the manual tap-to-locate path
  // (handleGroundActivity below, itself shared with the map's per-stop /
  // "Locate all" actions) AND the background auto-grounding pass — one
  // search path, not two.
  const groundAndPersist = useCallback(
    async (dayId: string, activityId: string, searchQuery: string, ctx: GroundingContext): Promise<GroundingOutcome> => {
      if (!id) return { status: 'skipped' };
      if (groundingInFlight.current.has(activityId)) return { status: 'skipped' };
      groundingInFlight.current.add(activityId);
      try {
        const resolved = await groundStop(searchQuery, ctx);
        if (!resolved) {
          console.error('[trip/[id]] could not ground activity:', searchQuery);
          await applyGroundingResult(dayId, activityId, null);
          return { status: 'failed' };
        }
        await applyGroundingResult(dayId, activityId, resolved);
        return { status: 'resolved', place: resolved };
      } finally {
        groundingInFlight.current.delete(activityId);
      }
    },
    [id, applyGroundingResult],
  );

  // Grounds one AI-generated stop from a user gesture. Shared by the timeline
  // tap-to-locate AND the map's per-stop / "Locate all" actions (Phase 4 Part
  // C) — one grounding path, not two.
  const handleGroundActivity = useCallback(
    async (activity: TripActivity, dayId: string) => {
      const alreadyGrounded = activity.lat != null && activity.lng != null;
      if (!id || !trip || alreadyGrounded || !activity.searchQuery || resolvingActivityId) return;
      setResolvingActivityId(activity.id);
      try {
        const dayIndex = trip.days.findIndex((d) => d.id === dayId);
        const destinationIndex = dayIndex >= 0 ? (dayDestinationIndices[dayIndex] ?? 0) : 0;
        const ctx = groundingContextFor(destinationAt(trip, destinationIndex));
        await groundAndPersist(dayId, activity.id, activity.searchQuery, ctx);
      } catch (err) {
        console.error('[trip/[id]] grounding failed:', err);
      } finally {
        setResolvingActivityId(null);
      }
    },
    [id, trip, resolvingActivityId, dayDestinationIndices, groundAndPersist],
  );

  // Destination readiness gate for the background pass below. `resolveCover`
  // (the effect above) kicks off `resolveBounds` asynchronously and nothing
  // awaits it, so on the primary path — generate a trip, open it — the trip
  // snapshot this component first renders with is the one generateTrip wrote:
  // `{ lat: null, lng: null, bounds: null }`. Starting the pass against that
  // snapshot gives groundingContextFor nothing to work with, which sends
  // every stop to Google with no bbox and no bias at all — the exact
  // unbiased global search this whole design exists to eliminate, at roughly
  // ten times the cost, permanently persisted and then skipped forever by
  // selectStopsToGround. So the pass waits until the destination has either a
  // box or coordinates. Restarting once they land is safe and idempotent:
  // selectStopsToGround filters out everything already grounded, so a restart
  // only ever re-selects what remains. If a destination resolves neither, the
  // automatic pass simply never runs and the owner still has "Locate all" —
  // strictly better than grounding the whole itinerary against the planet.
  const destReady =
    trip?.destination.bounds != null || trip?.destination.lat != null;

  // ── Background auto-grounding (Fix 10) ───────────────────────────────────────
  // A freshly generated trip otherwise opens to an empty map, asking the
  // owner to press "Locate all" to find their own itinerary. Owner-gated and
  // AI-only, runs once per trip open, strictly sequentially (no concurrency —
  // this is a background pass nobody is waiting on, so keeping the request
  // rate low and the code obvious wins over speed). `cancelled` stops the
  // loop cleanly on unmount/navigation instead of writing into an activity
  // that's no longer being viewed. Each stop is wrapped in its own try/catch:
  // a rejected fetch (offline, DNS) inside groundStop's Google fallback must
  // not abort the whole pass and silently skip every remaining stop for this
  // open — it should just move on to the next one.
  //
  // Each StopToGround carries one or more targets (activities that share its
  // deduplicated query within this destination — see selectStopsToGround).
  // The lookup itself only runs once, for the first target; its result is
  // then applied directly to every remaining target via applyGroundingResult,
  // with no further Mapbox/Google call.
  //
  // Deliberately keyed only on [trip?.id, isOwner, destReady] — not on `trip`
  // itself, `dayDestinationIndices`, or `groundAndPersist` — so a write this
  // same pass makes (which refetches `trip` and recreates those) never
  // restarts the loop mid-flight. The queue is built once from the trip
  // snapshot at the moment the effect fires and is not rebuilt after that;
  // only each stop's grounding context is re-read (via tripRef) so a bounds
  // write landing mid-pass still boxes the stops that remain.
  // `destReady` is in the key on purpose (see above): it flips false → true
  // exactly once, when the bounds/destination backfill lands, and that is the
  // first moment the pass has a geographic anchor to search inside.
  useEffect(() => {
    if (!trip?.isAiGenerated || !isOwner || !destReady) return;
    let cancelled = false;

    (async () => {
      const queue = selectStopsToGround(trip.days, dayDestinationIndices);
      for (const stop of queue) {
        if (cancelled) return;
        try {
          const [first, ...rest] = stop.targets;
          // Read the destination from the ref, not the effect-time snapshot:
          // a bounds backfill that lands mid-pass must reach the stops still
          // to come. Falls back to the captured trip if the ref is empty.
          const ctx = groundingContextFor(destinationAt(tripRef.current ?? trip, stop.destinationIndex));
          const outcome = await groundAndPersist(first.dayId, first.activityId, stop.searchQuery, ctx);
          // A skip means another path (manual tap or "Locate all") owns this
          // activity right now and will persist its own result. Fanning `null`
          // out here would brand every duplicate permanently unresolvable over
          // a transient collision.
          if (outcome.status === 'skipped') continue;
          for (const target of rest) {
            if (cancelled) return;
            await applyGroundingResult(
              target.dayId,
              target.activityId,
              outcome.status === 'resolved' ? outcome.place : null,
            );
          }
        } catch (err) {
          console.error('[trip/[id]] background grounding failed for stop:', stop.searchQuery, err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip?.id, isOwner, destReady]);

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
      // Grounded means "has coordinates", not "has a Google placeId" — a
      // Mapbox-grounded stop has no placeId but is fully pinnable (mirrors
      // TripMapView's collectStops predicate).
      const isGrounded = canShowPlaceSheet(activity);
      // TM-3c: a visited, grounded stop opens its journal ("your visit")
      // instead of jumping to the map — that's now the more useful default
      // once there's something personal to see there.
      if (activity.visited && isGrounded) {
        setJournalActivity({ activity, dayId });
        return;
      }
      if (isGrounded) {
        // The place sheet, not the map. Flying to a pin is what made a trip
        // full of hand-picked places look like circles on a map — the sheet
        // leads with photos, which is the house rule for any place screen.
        // "Show on map" lives inside the sheet for anyone who wanted the pin.
        const place = activityToPlace(activity);
        if (place) {
          setPlaceActivity(activity);
          Animated.spring(placeSlideAnim, { toValue: 0, ...SPRING }).start();
          return;
        }
        setFocusActivityId(activity.id);
        setViewMode('map');
        return;
      }
      handleGroundActivity(activity, dayId);
    },
    // placeSlideAnim is a useRef(...).current — a stable identity for the life
    // of the component, so listing it changes nothing at runtime. Listed anyway
    // rather than silenced: an exhaustive-deps warning left standing is one
    // nobody reads when it later flags something real.
    [handleGroundActivity, placeSlideAnim],
  );

  const handleOpenJournal = useCallback((activity: TripActivity, dayId: string) => {
    setJournalActivity({ activity, dayId });
  }, []);

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
    // A multi-city trip opens the stop's own city (one section, never folded); others show everything.
    let city: number | null = null;
    if (trip && trip.additionalDestinations.length > 0) {
      const sorted = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
      const cities = tripLayout(trip).dayCities; // the same layout the city sections use
      const k = sorted.findIndex((d) => d.activities.some((a) => a.id === activityId));
      city = k >= 0 ? cities[k] ?? null : null;
    }
    setCityFilter(city);
    setFocusActivityId(null);
    setHighlightActivityId(activityId);
  }, [trip]);

  useEffect(() => {
    if (viewMode !== 'timeline' || !highlightActivityId || !trip) return;
    const day = trip.days.find((d) => d.activities.some((a) => a.id === highlightActivityId));
    if (!day) return;
    const scrollTimer = setTimeout(() => {
      // Inside a city section, a day's y is relative to that section.
      const y = dayLayoutY.current[day.id] != null
        ? dayLayoutY.current[day.id] + (trip.additionalDestinations.length > 0 ? citySectionY.current : 0)
        : null;
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
            <ArrowLeft size={18} color={HEADER_ICON} weight="bold" />
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

  // Collaborators keep access: they were invited, and hiding a trip they're
  // helping plan would be stranger than the report.
  const authorBlocked = moderation.blockedUids.has(trip.authorUid);
  if (
    !isOwner &&
    !isCollaborator &&
    !isContentVisible(moderation, {
      authorUid: trip.authorUid,
      key: contentKey({ type: 'trip', id: trip.id }),
      moderationHidden: trip.moderationHidden,
    })
  ) {
    return (
      <View style={[styles.centeredFull, { backgroundColor: colors.background.primary }]}>
        <EmptyState
          icon={EyeSlash}
          title={authorBlocked ? `You blocked ${authorName}` : "This trip isn't available"}
          description={
            authorBlocked
              ? 'Unblock them to see their trips again.'
              : "It was reported and removed from your feed. We'll review it within 24 hours."
          }
          actionLabel="Go back"
          onAction={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.back();
          }}
          actionHaptic="none"
          secondaryLabel={authorBlocked ? 'Unblock' : undefined}
          onSecondary={authorBlocked ? () => unblock(trip.authorUid, authorName) : undefined}
        />
      </View>
    );
  }

  const sortedDays = [...trip.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const multiCity = destinationNames.length > 1;
  // Each city's nights (saved, else derived) → its dates and day numbers (utils/tripRoute).
  const routeRows = multiCity ? routeRowsFromTrip(trip) : [];
  const tripStart = trip.startDate ? toCalendarDate(trip.startDate.toDate()) : null;
  const ranges = cityRanges(routeRows.map((r) => r.nights), tripStart);
  const perCity = multiCity ? cityBookings(tripBookings, destinationNames, ranges) : [];
  const routeSaved = [trip.destination, ...trip.additionalDestinations].every((d) => typeof d.nights === 'number');
  // A save can remove cities; a stale selection falls back to All.
  const activeCity = cityFilter !== null && cityFilter < destinationNames.length ? cityFilter : null;
  // Days per city as a route save would lay them out (a trip whose days all sit in the first city is split by position).
  const sectionDayCities = multiCity ? tripLayout(trip).dayCities : [];
  const shownCities = activeCity === null ? destinationNames.map((_, i) => i) : [activeCity];
  const renderDay = (day: (typeof sortedDays)[number], index: number, ci?: number) => (
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
                    editable={canEditItinerary}
                    onAddActivity={canEditItinerary ? () => handleOpenAddActivity(day) : undefined}
                    onAddStop={canEditItinerary ? () => handleOpenAddStop(day) : undefined}
                    onEditActivity={canEditItinerary ? (activity) => handleOpenEditActivity(activity, day.id) : undefined}
                    onActivityPress={canEditItinerary ? handleActivityPress : undefined}
                    onToggleVisited={canEditItinerary ? handleToggleVisited : undefined}
                    onReorderActivities={canEditItinerary ? handleReorderActivities : undefined}
                    onDeleteDay={canEditItinerary ? () => (ci !== undefined && routeSaved ? deleteDayInCity(day, ci) : handleDeleteDay(day)) : undefined}
                    resolvingActivityId={resolvingActivityId}
                    highlightActivityId={highlightActivityId}
                    currentActivityId={currentActivityId}
                    dayBookings={bookingsOnDays[day.id]}
                    onBookingPress={openBooking}
                  />
                </AnimatedDaySection>
  );
  const bookingsOnDays = bookingsByDay(sortedDays.map((d) => ({ id: d.id, date: d.date?.toDate() ?? null })), tripBookings);
  const hasDescription = Boolean(trip.description?.trim());
  const dayCount = sortedDays.length;
  const eyebrow = `${formatDateRange(trip.startDate, trip.endDate).toUpperCase()}${
    dayCount > 0 ? ` · ${dayCount} DAY${dayCount === 1 ? '' : 'S'}` : ''
  }`;

  if (viewMode === 'map') {
    return (
      <>
        <TripMapView
          tripId={trip.id}
          tripTitle={trip.title}
          days={sortedDays}
          canEdit={canEditItinerary}
          resolvingActivityId={resolvingActivityId}
          onLocateStop={handleGroundActivity}
          unresolvedActivityIds={unresolvedActivityIds}
          focusActivityId={focusActivityId}
          onViewInTimeline={handleViewInTimeline}
          onToggleVisited={canEditItinerary ? handleToggleVisited : undefined}
          onOpenJournal={handleOpenJournal}
          currentActivityId={currentActivityId}
          canEditRoutes={isOwner || isCollaborator}
          tripStatus={tripStatus}
          tripEndDate={trip.endDate ? trip.endDate.toDate() : null}
          onOpenRecap={() => {
            setViewMode('timeline');
            setRecapVisible(true);
          }}
          onBack={() => {
            setViewMode('timeline');
            setFocusActivityId(null);
          }}
        />
        {journalActivity ? (
          <JournalSheet
            visible
            tripId={trip.id}
            dayId={journalActivity.dayId}
            activity={journalActivity.activity}
            isOwner={isOwner}
            onClose={() => setJournalActivity(null)}
            colors={DarkColors}
          />
        ) : null}
      </>
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
                {tripPlaceLabel(trip)}
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
              <ArrowLeft size={18} color={HEADER_ICON} weight="bold" />
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
              // Always the second slot: the first is Edit for the owner, More for everyone else.
              { top: insets.top + Spacing['2'], right: Spacing['4'] + 44 + Spacing['2'] },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Show trip map"
          >
            <View style={styles.headerBtnCircle}>
              <MapTrifold size={18} color={HEADER_ICON} weight="bold" />
            </View>
          </TouchableOpacity>

          {/* Share — third slot, left of the map. Not for private or hidden trips. */}
          {canShareTrip(trip) && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setShareVisible(true);
              }}
              style={[
                styles.headerBtn,
                { top: insets.top + Spacing['2'], right: Spacing['4'] + (44 + Spacing['2']) * 2 },
              ]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Share trip"
            >
              <View style={styles.headerBtnCircle}>
                <Export size={18} color={HEADER_ICON} weight="bold" />
              </View>
            </TouchableOpacity>
          )}

          {/* Report or block, for anyone else's trip. */}
          {!isOwner && (
            <TouchableOpacity
              ref={moreRef}
              onPress={handleMore}
              style={[styles.headerBtn, { top: insets.top + Spacing['2'], right: Spacing['4'] }]}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="More options for this trip"
            >
              <View style={styles.headerBtnCircle}>
                <DotsThree size={18} color={HEADER_ICON} weight="bold" />
              </View>
            </TouchableOpacity>
          )}

          {/* Owner-only trip editing — the map toggle above reserves this slot. */}
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
                <PencilSimple size={18} color={HEADER_ICON} weight="bold" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 2. Title block — eyebrow + editorial title ── */}
        <View style={styles.titleBlock}>
          <Text style={[styles.eyebrow, { color: colors.text.tertiary }]}>{eyebrow}</Text>
          <Text style={[styles.title, { color: colors.text.primary }]}>{trip.title}</Text>
        </View>

        {/* Trip members — only worth a row once someone besides the owner
            has actually accepted; an author-only stack of one isn't news. */}
        {trip.collaborators.length > 0 && (
          <View style={styles.membersRow}>
            {memberUids.slice(0, 5).map((uid, i) => (
              <View
                key={uid}
                style={[
                  styles.memberAvatar,
                  { marginLeft: i === 0 ? 0 : -Spacing['2'], borderColor: colors.background.primary },
                ]}
              >
                <Avatar uri={memberProfiles[uid]?.avatarUrl ?? null} name={memberProfiles[uid]?.name} size="xs" />
              </View>
            ))}
            <Text style={[styles.membersText, { color: colors.text.tertiary }]}>
              {memberUids.length} on this trip
            </Text>
          </View>
        )}

        {/* ── 3. Chips: destination + status + visibility ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipStrip}
          contentContainerStyle={styles.chipStripContent}
        >
          {multiCity && (
            <TouchableOpacity
              onPress={() => activeCity !== null && toggleCity(activeCity)}
              hitSlop={6}
              style={[styles.chip, { backgroundColor: activeCity === null ? colors.text.primary : colors.background.sunken }]}
              accessibilityRole="button"
              accessibilityState={{ selected: activeCity === null }}
              accessibilityLabel="All cities"
            >
              <Text style={[styles.chipText, { color: activeCity === null ? colors.background.primary : colors.text.primary }]}>All</Text>
            </TouchableOpacity>
          )}
          {destinationNames.map((name, i) => {
            const selected = activeCity === i;
            const pickable = multiCity;
            return (
              <TouchableOpacity
                key={`${name}-${i}`}
                disabled={!pickable}
                hitSlop={6}
                onPress={() => toggleCity(i)}
                style={[styles.chip, { backgroundColor: selected ? colors.text.primary : colors.background.sunken }]}
                accessibilityRole={pickable ? 'button' : 'text'}
                accessibilityState={pickable ? { selected } : undefined}
                accessibilityLabel={pickable ? `${name}, show its days` : name}
              >
                <MapPin size={13} color={selected ? colors.background.primary : colors.text.secondary} weight="bold" />
                <Text style={[styles.chipText, { color: selected ? colors.background.primary : colors.text.primary }]} numberOfLines={1}>
                  {name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {multiCity && canEditItinerary && (
            <TouchableOpacity
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setRouteEditorVisible(true); }}
              hitSlop={6}
              style={[styles.chip, { backgroundColor: colors.background.sunken }]}
              accessibilityRole="button"
            >
              <Signpost size={13} color={colors.text.secondary} weight="bold" />
              <Text style={[styles.chipText, { color: colors.text.primary }]}>Edit route</Text>
            </TouchableOpacity>
          )}

          <View
            style={[
              styles.chip,
              { backgroundColor: colors.status[tripStatus]?.bg ?? colors.background.sunken },
            ]}
          >
            <Text
              style={[
                styles.chipText,
                { color: colors.status[tripStatus]?.text ?? colors.text.secondary },
              ]}
            >
              {TRIP_STATUS_LABEL[tripStatus]}
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

          {/* Invite friends — owner or existing collaborator only; request/
              accept, not instant-add, so this only ever opens a picker. */}
          {(isOwner || isCollaborator) && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                // Travelling together is Pro (inviteToTrip enforces it too).
                requirePro(() => setInviteVisible(true));
              }}
              style={[styles.chip, { backgroundColor: colors.background.sunken }]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel={isPro ? 'Invite friends' : 'Invite friends. Pro feature'}
            >
              <UsersThree size={13} color={colors.text.secondary} weight="duotone" />
              <Text style={[styles.chipText, { color: colors.text.primary }]}>Invite</Text>
              {!isPro ? <Badge variant="pro" /> : null}
            </TouchableOpacity>
          )}

          {/* Budget and packing — members only (owner + accepted invitees). */}
          {(isOwner || isCollaborator) && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/trip/budget', params: { id: trip.id } });
            }}
            style={[styles.chip, { backgroundColor: colors.background.sunken }]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityLabel="Trip budget"
          >
            <Wallet size={13} color={colors.text.secondary} weight="duotone" />
            <Text style={[styles.chipText, { color: colors.text.primary }]}>
              {tripBudget
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: tripBudget.currency,
                    maximumFractionDigits: 0,
                  }).format(tripBudget.amount)
                : 'Budget'}
            </Text>
          </TouchableOpacity>
          )}

          {(isOwner || isCollaborator) && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push({ pathname: '/trip/packing', params: { id: trip.id } });
            }}
            style={[styles.chip, { backgroundColor: colors.background.sunken }]}
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            accessibilityLabel="Packing list"
          >
            <Backpack size={13} color={colors.text.secondary} weight="duotone" />
            <Text style={[styles.chipText, { color: colors.text.primary }]}>Packing</Text>
          </TouchableOpacity>
          )}

          {/* Your wallet bookings linked to this trip (only you see them). */}
          {tripBookings.length > 0 && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setBookingsVisible(true);
              }}
              style={[styles.chip, { backgroundColor: colors.background.sunken }]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel={`Bookings, ${tripBookings.length}`}
            >
              <Ticket size={13} color={colors.text.secondary} weight="duotone" />
              <Text style={[styles.chipText, { color: colors.text.primary }]}>Bookings · {tripBookings.length}</Text>
            </TouchableOpacity>
          )}

          {/* TM-3d — only worth surfacing once there's a story to tell */}
          {visitedCount > 0 && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRecapVisible(true);
              }}
              style={[styles.chip, { backgroundColor: `${colors.brand.purple}1A` }]}
              accessibilityLabel="View trip recap"
            >
              <Camera size={13} color={colors.brand.purple} weight="duotone" />
              <Text style={[styles.chipText, { color: colors.brand.purple }]}>Recap</Text>
            </TouchableOpacity>
          )}
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
          {multiCity ? (
            sortedDays.length === 0 && !routeSaved ? (
              canEditItinerary ? (
                <EmptyState
                  icon={Signpost}
                  title="Plan it city by city"
                  description="Set how many nights you'll spend in each city, and every city gets its own days."
                  actionLabel="Set your route"
                  onAction={() => setRouteEditorVisible(true)}
                  actionHaptic="light"
                />
              ) : (
                <EmptyState icon={MapTrifold} title="No itinerary yet" />
              )
            ) : (
              shownCities.map((ci) => {
                const days = sortedDays.filter((_, k) => sectionDayCities[k] === ci);
                const key = `${trip.id}:${ci}`;
                const open = activeCity !== null || isSectionOpen(key, ci, sectionsOpen);
                const range = ranges[ci];
                const dates = range?.arrive && range.leave
                  ? `${shortDay(range.arrive).toUpperCase()} – ${shortDay(range.leave).toUpperCase()}`
                  : `DAYS ${range?.firstDay ?? 1}–${range?.lastDay ?? 1}`;
                const nights = range?.nights ?? days.length;
                return (
                  <View key={key} onLayout={activeCity !== null ? (e) => { citySectionY.current = e.nativeEvent.layout.y; } : undefined}>
                  <CitySection
                    name={destinationNames[ci]}
                    eyebrow={`${dates} · ${nights} NIGHT${nights === 1 ? '' : 'S'}`}
                    summary={citySummary({
                      days: days.length,
                      stops: days.reduce((n, d) => n + d.activities.length, 0),
                      staying: (perCity[ci]?.staying.length ?? 0) > 0,
                    })}
                    open={open}
                    onToggle={activeCity === null ? () => setSectionOpen(key, !open) : undefined}
                    onMenu={canEditItinerary ? () => openCityMenu(ci) : undefined}
                    arriving={perCity[ci]?.arriving ?? []}
                    staying={perCity[ci]?.staying ?? []}
                    onBookingPress={openBooking}
                    onAddBooking={isOwner || isCollaborator ? addBooking : undefined}
                    onFindStay={range ? () => findStay(destinationNames[ci], range) : undefined}
                    onAddDay={canEditItinerary ? () => addDayInCity(ci) : undefined}
                  >
                    {days.map((day, index) => renderDay(day, index, ci))}
                  </CitySection>
                  </View>
                );
              })
            )
          ) : sortedDays.length === 0 ? (
            canEditItinerary ? (
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
              {sortedDays.map((day, index) => renderDay(day, index))}

              {/* ── 6. Add Day — tertiary text link, not a competing action ──
                  Writes a day immediately (handleAddDay), so Medium — fired
                  here rather than inside handleAddDay itself, since that
                  handler is shared with the empty-days EmptyState action
                  above, which already gets its haptic from Button. */}
              {canEditItinerary && (
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

      {/* ── Place sheet for a tapped stop ──
          Photos, rating, hours and address for the place itself. Reuses the
          globe's sheet (third consumer, after search and AddStopSheet) so
          there is one place-rendering component, not three. */}
      {placeActivity ? (
        <PlaceDetailSheet
          place={activityToPlace(placeActivity)!}
          slideAnim={placeSlideAnim}
          bottomInset={insets.bottom}
          onDismiss={handleDismissPlace}
          onAddToTrip={handleShowPlaceOnMap}
          addToTripLabel="Show on map"
          // The stop's own type picks the destination — a hotel goes to
          // Booking.com with these dates, anything else to its Maps entry.
          booking={placeBooking ?? undefined}
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

      {/* ── Journal for a visited stop (TM-3) ── */}
      {journalActivity ? (
        <JournalSheet
          visible
          tripId={trip.id}
          dayId={journalActivity.dayId}
          activity={journalActivity.activity}
          isOwner={isOwner}
          onClose={() => setJournalActivity(null)}
        />
      ) : null}

      {/* ── Trip recap (TM-3d) ── */}
      <TripRecapSheet
        visible={recapVisible}
        trip={trip}
        onClose={() => setRecapVisible(false)}
        onViewOnMap={() => {
          setRecapVisible(false);
          setViewMode('map');
        }}
      />

      {/* ── Invite friends (request/accept) ── */}
      <ShareTripSheet visible={shareVisible} trip={trip} onClose={() => setShareVisible(false)} />
      {multiCity && canEditItinerary && (
        <RouteEditorSheet visible={routeEditorVisible} trip={trip} onClose={() => setRouteEditorVisible(false)} onSaved={() => setCityFilter(null)} />
      )}
      <TripBookingsSheet
        visible={bookingsVisible}
        bookings={tripBookings}
        onClose={() => setBookingsVisible(false)}
        onBookingPress={openBooking}
      />

      <InviteFriendsSheet
        visible={inviteVisible}
        tripId={trip.id}
        collaborators={memberUids}
        onClose={() => setInviteVisible(false)}
      />

      {reportSheet}
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
    // Fixed light-translucent circle + fixed dark icon (HEADER_ICON above) —
    // legible over BOTH a photo (helped by the scrim above it) and the plain
    // placeholder, unlike a fixed dark overlay which reads as a grey blob
    // with no photo behind it. Both halves must be theme-independent: this
    // circle stays light in dark mode, so a themed icon disappears into it.
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

  membersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing['5'],
    marginTop: Spacing['3'],
    gap: Spacing['2'],
  },
  memberAvatar: {
    borderRadius: 999,
    borderWidth: 2,
  },
  membersText: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.medium,
    marginLeft: Spacing['1'],
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
