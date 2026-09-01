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
import { ArrowLeft, MapTrifold, PencilSimple, MapPin, Plus, Compass, Camera, UsersThree, Wallet, Backpack } from 'phosphor-react-native';
import { VISIBILITY_ICONS } from '@/constants/icons';
import { DarkColors } from '@/constants/colors';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/useAuthStore';
import { useTrip } from '@/hooks/useTrip';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { DayTimeline } from '@/components/trip/DayTimeline';
import { ActivityFormSheet, type ActivityFormData } from '@/components/trip/ActivityFormSheet';
import { AddStopSheet } from '@/components/trip/AddStopSheet';
import { EditTripSheet } from '@/components/trip/EditTripSheet';
import { JournalSheet } from '@/components/trip/JournalSheet';
import { TripRecapSheet } from '@/components/trip/TripRecapSheet';
import { InviteFriendsSheet } from '@/components/trip/InviteFriendsSheet';
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
import { groundStop, type GroundingContext } from '@/services/places/groundStop';
import type { GroundedPlace } from '@/utils/mapboxQuery';
import { boundsToBbox, bboxCenter } from '@/utils/geoBounds';
import { resolveDayDestinationIndices } from '@/utils/dayDestination';
import { selectStopsToGround } from '@/utils/groundingQueue';

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

  // TM-3: journal sheet for a visited stop — reachable from both the
  // timeline and the map, so it's owned here and rendered in both branches.
  const [journalActivity, setJournalActivity] = useState<{ activity: TripActivity; dayId: string } | null>(null);
  // TM-3d: trip recap
  const [recapVisible, setRecapVisible] = useState(false);
  // Invite friends (request/accept) — owner or existing collaborator only
  const [inviteVisible, setInviteVisible] = useState(false);

  const isOwner = !!trip && !!currentUserUid && trip.authorUid === currentUserUid;
  const isCollaborator = !!trip && !!currentUserUid && trip.collaborators.includes(currentUserUid);

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
      await patchActivityGrounding(id, dayId, activityId, {
        placeId: resolved.placeId,
        address: resolved.address,
        lat: resolved.lat,
        lng: resolved.lng,
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
  // snapshot at the moment the effect fires and is not re-read after that.
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
          const ctx = groundingContextFor(destinationAt(trip, stop.destinationIndex));
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
      const isGrounded = activity.lat != null && activity.lng != null;
      // TM-3c: a visited, grounded stop opens its journal ("your visit")
      // instead of jumping to the map — that's now the more useful default
      // once there's something personal to see there.
      if (activity.visited && isGrounded) {
        setJournalActivity({ activity, dayId });
        return;
      }
      if (isGrounded) {
        setFocusActivityId(activity.id);
        setViewMode('map');
        return;
      }
      handleGroundActivity(activity, dayId);
    },
    [handleGroundActivity],
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
      <>
        <TripMapView
          tripId={trip.id}
          tripTitle={trip.title}
          days={sortedDays}
          isOwner={isOwner}
          resolvingActivityId={resolvingActivityId}
          onLocateStop={handleGroundActivity}
          unresolvedActivityIds={unresolvedActivityIds}
          focusActivityId={focusActivityId}
          onViewInTimeline={handleViewInTimeline}
          onToggleVisited={isOwner ? handleToggleVisited : undefined}
          onOpenJournal={handleOpenJournal}
          currentActivityId={currentActivityId}
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
          <View style={[styles.chip, { backgroundColor: colors.background.sunken }]}>
            <MapPin size={13} color={colors.text.secondary} weight="bold" />
            <Text style={[styles.chipText, { color: colors.text.primary }]} numberOfLines={1}>
              {trip.destination.name}
            </Text>
          </View>

          {trip.additionalDestinations?.map((dest, i) => (
            <View
              key={`${dest.placeId}-${i}`}
              style={[styles.chip, { backgroundColor: colors.background.sunken }]}
            >
              <MapPin size={13} color={colors.text.secondary} weight="bold" />
              <Text style={[styles.chipText, { color: colors.text.primary }]} numberOfLines={1}>
                {dest.name}
              </Text>
            </View>
          ))}

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

          {/* Invite friends — owner or existing collaborator only; request/
              accept, not instant-add, so this only ever opens a picker. */}
          {(isOwner || isCollaborator) && (
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setInviteVisible(true);
              }}
              style={[styles.chip, { backgroundColor: colors.background.sunken }]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
              accessibilityLabel="Invite friends"
            >
              <UsersThree size={13} color={colors.text.secondary} weight="duotone" />
              <Text style={[styles.chipText, { color: colors.text.primary }]}>Invite</Text>
            </TouchableOpacity>
          )}

          {/* Budget — shows live progress once a budget's been set, plain
              label until then; either way it's just a shortcut to trip/budget. */}
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
              {trip.budgetAmount != null
                ? new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: trip.budgetCurrency ?? 'USD',
                    maximumFractionDigits: 0,
                  }).format(trip.budgetAmount)
                : 'Budget'}
            </Text>
          </TouchableOpacity>

          {/* Packing list */}
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
      <InviteFriendsSheet
        visible={inviteVisible}
        tripId={trip.id}
        collaborators={memberUids}
        onClose={() => setInviteVisible(false)}
      />
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
