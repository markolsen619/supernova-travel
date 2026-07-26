import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  limit,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db, auth } from '@/services/firebase';
import { TripDay, TripActivity, TripWithDays, CreateTripInput, UpdateTripInput } from '@/types';

export function useCreateTrip() {
  const queryClient = useQueryClient();

  async function createTrip(data: CreateTripInput): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Not authenticated');

    const docRef = await addDoc(collection(db, 'trips'), {
      authorUid: uid,
      title: data.title,
      description: data.description,
      destination: data.destination,
      additionalDestinations: data.additionalDestinations,
      startDate: data.startDate ? Timestamp.fromDate(data.startDate) : null,
      endDate: data.endDate ? Timestamp.fromDate(data.endDate) : null,
      visibility: data.visibility,
      tags: data.tags,
      coverImageUrl: data.coverImageUrl,
      isAiGenerated: data.isAiGenerated,
      status: 'planning',
      collaborators: [],
      budgetAmount: null,
      budgetCurrency: null,
      likesCount: 0,
      savesCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await queryClient.invalidateQueries({ queryKey: ['trips', uid] });
    if (data.visibility === 'public') {
      await queryClient.invalidateQueries({ queryKey: ['publicTrips'] });
    }
    return docRef.id;
  }

  async function updateTrip(tripId: string, data: UpdateTripInput): Promise<void> {
    const tripRef = doc(db, 'trips', tripId);
    const { startDate, endDate, ...rest } = data;
    await updateDoc(tripRef, {
      ...rest,
      ...(startDate !== undefined && { startDate: startDate ? Timestamp.fromDate(startDate) : null }),
      ...(endDate !== undefined && { endDate: endDate ? Timestamp.fromDate(endDate) : null }),
      updatedAt: serverTimestamp(),
    });
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    // Prefix match (no uid) — also catches ['trips', uid] (profile's own
    // list) and ['publicTrips'], so a silent backfill (cover photo,
    // destination grounding) shows up in list views immediately, not just
    // on the single trip's own detail query.
    await queryClient.invalidateQueries({ queryKey: ['trips'] });
    await queryClient.invalidateQueries({ queryKey: ['publicTrips'] });
  }

  async function deleteTrip(tripId: string): Promise<void> {
    // Firestore doesn't cascade subcollection deletes — orphaned days and
    // activities would linger (invisible, but billed and unreachable). Batch
    // them ahead of the trip doc so a mid-delete failure leaves the trip
    // itself intact and retryable.
    const daysSnap = await getDocs(collection(db, 'trips', tripId, 'days'));
    const batch = writeBatch(db);
    for (const dayDoc of daysSnap.docs) {
      const activitiesSnap = await getDocs(
        collection(db, 'trips', tripId, 'days', dayDoc.id, 'activities'),
      );
      activitiesSnap.docs.forEach((activityDoc) => batch.delete(activityDoc.ref));
      batch.delete(dayDoc.ref);
    }
    batch.delete(doc(db, 'trips', tripId));
    await batch.commit();

    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    await queryClient.invalidateQueries({ queryKey: ['trips'] });
    await queryClient.invalidateQueries({ queryKey: ['publicTrips'] });
  }

  async function addDay(
    tripId: string,
    day: Omit<TripDay, 'id' | 'activities'>
  ): Promise<string> {
    const daysRef = collection(db, 'trips', tripId, 'days');
    const docRef = await addDoc(daysRef, day);
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    return docRef.id;
  }

  async function addActivity(
    tripId: string,
    dayId: string,
    activity: Omit<TripActivity, 'id' | 'order'>,
    order: number = Date.now()
  ): Promise<string> {
    const activitiesRef = collection(db, 'trips', tripId, 'days', dayId, 'activities');
    const docRef = await addDoc(activitiesRef, { ...activity, order });
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
    return docRef.id;
  }

  async function updateActivity(
    tripId: string,
    dayId: string,
    activityId: string,
    data: Partial<TripActivity>
  ): Promise<void> {
    const activityRef = doc(db, 'trips', tripId, 'days', dayId, 'activities', activityId);
    await updateDoc(activityRef, { ...data });
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
  }

  /**
   * TM-2b: manual visited toggle — no GPS, just this tap. Patches the
   * `['trip', tripId]` cache directly (not a dedicated local boolean)
   * before the write resolves: the timeline row and the map pin both read
   * that same query, so one optimistic patch keeps them in lockstep with
   * no divergent state, instead of two components separately guessing at
   * the same fact. Reverted on failure.
   */
  async function toggleVisited(
    tripId: string,
    dayId: string,
    activityId: string,
    visited: boolean
  ): Promise<void> {
    const activityRef = doc(db, 'trips', tripId, 'days', dayId, 'activities', activityId);
    const queryKey = ['trip', tripId];
    const previous = queryClient.getQueryData<TripWithDays | null>(queryKey);

    queryClient.setQueryData<TripWithDays | null>(queryKey, (old) => {
      if (!old) return old;
      return {
        ...old,
        days: old.days.map((day) =>
          day.id !== dayId
            ? day
            : {
                ...day,
                activities: day.activities.map((a) =>
                  a.id !== activityId ? a : { ...a, visited, visitedAt: visited ? Timestamp.now() : null }
                ),
              }
        ),
      };
    });

    try {
      await updateDoc(activityRef, {
        visited,
        visitedAt: visited ? serverTimestamp() : null,
      });
    } catch (err) {
      queryClient.setQueryData(queryKey, previous);
      throw err;
    } finally {
      await queryClient.invalidateQueries({ queryKey });
    }
  }

  async function deleteActivity(
    tripId: string,
    dayId: string,
    activityId: string
  ): Promise<void> {
    const activityRef = doc(db, 'trips', tripId, 'days', dayId, 'activities', activityId);
    await deleteDoc(activityRef);
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
  }

  /**
   * "Add to trip" (Part D) needs a dayId to write an activity into, but a Trip
   * from useTripList doesn't carry its days subcollection. Returns the trip's
   * last existing day (by dayNumber), or creates Day 1 if it has none yet —
   * keeps the picker flow simple (append to where the trip currently ends)
   * without a day-picker UI in this phase.
   */
  async function getOrCreateLastDay(tripId: string): Promise<string> {
    const daysQuery = query(
      collection(db, 'trips', tripId, 'days'),
      orderBy('dayNumber', 'desc'),
      limit(1)
    );
    const snap = await getDocs(daysQuery);
    if (!snap.empty) return snap.docs[0].id;
    return addDay(tripId, { dayNumber: 1, date: null, title: '', notes: '' });
  }

  /**
   * Persists a full drag-and-drop reorder of one day's activities. Rewrites
   * every activity's `order` field with the same sparse spacing addActivity
   * uses on create (idx * 1000), in one batch. A full rewrite — not midpoint
   * insertion between neighbors — because a drag-end can move any item to any
   * position in one gesture (not just insert a single new one), so there's no
   * single "gap" to insert into; midpoint insertion also degrades over many
   * edits as gaps get bisected into ever-smaller increments. A day realistically
   * holds a handful of stops, so a full rewrite is at most a handful of writes.
   */
  async function reorderActivities(
    tripId: string,
    dayId: string,
    orderedActivities: TripActivity[]
  ): Promise<void> {
    const batch = writeBatch(db);
    orderedActivities.forEach((activity, idx) => {
      const activityRef = doc(db, 'trips', tripId, 'days', dayId, 'activities', activity.id);
      batch.update(activityRef, { order: idx * 1000 });
    });
    await batch.commit();
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
  }

  /**
   * Moves an activity to a different day. Firestore has no native "move"
   * across subcollections (dayId is part of the document path), so this
   * creates a new doc in the target day — appended to the end via Date.now(),
   * matching addActivity's own default — and deletes the original. The
   * activity gets a new id; nothing outside this trip references TripActivity
   * ids, so that's harmless.
   */
  async function moveActivityToDay(
    tripId: string,
    fromDayId: string,
    toDayId: string,
    activity: TripActivity
  ): Promise<void> {
    if (fromDayId === toDayId) return;
    const { id, ...rest } = activity; // rest.order is overridden below
    const targetCollection = collection(db, 'trips', tripId, 'days', toDayId, 'activities');
    const sourceRef = doc(db, 'trips', tripId, 'days', fromDayId, 'activities', id);
    const newActivityRef = doc(targetCollection);

    const batch = writeBatch(db);
    batch.set(newActivityRef, { ...rest, order: Date.now() });
    batch.delete(sourceRef);
    await batch.commit();
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
  }

  /**
   * Deletes a day and all its activities, then renumbers the remaining days
   * sequentially (1, 2, 3…) so dayNumber stays contiguous — the timeline UI
   * assumes no gaps. Caller passes the remaining days already sorted with the
   * deleted one excluded (it already has this list on hand for rendering).
   */
  async function deleteDay(
    tripId: string,
    dayId: string,
    remainingDaysInOrder: TripDay[]
  ): Promise<void> {
    const activitiesSnap = await getDocs(
      collection(db, 'trips', tripId, 'days', dayId, 'activities')
    );

    const batch = writeBatch(db);
    activitiesSnap.docs.forEach((activityDoc) => batch.delete(activityDoc.ref));
    batch.delete(doc(db, 'trips', tripId, 'days', dayId));

    remainingDaysInOrder.forEach((day, idx) => {
      const nextNumber = idx + 1;
      if (day.dayNumber !== nextNumber) {
        batch.update(doc(db, 'trips', tripId, 'days', day.id), { dayNumber: nextNumber });
      }
    });

    await batch.commit();
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
  }

  return {
    createTrip,
    updateTrip,
    deleteTrip,
    addDay,
    addActivity,
    updateActivity,
    toggleVisited,
    deleteActivity,
    getOrCreateLastDay,
    reorderActivities,
    moveActivityToDay,
    deleteDay,
  };
}
