import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db, auth } from '@/services/firebase';
import { TripDay, TripActivity, CreateTripInput, UpdateTripInput } from '@/types';

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
      startDate: data.startDate ? Timestamp.fromDate(data.startDate) : null,
      endDate: data.endDate ? Timestamp.fromDate(data.endDate) : null,
      visibility: data.visibility,
      tags: data.tags,
      coverImageUrl: data.coverImageUrl,
      isAiGenerated: data.isAiGenerated,
      status: 'planning',
      collaborators: [],
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
  }

  async function deleteTrip(tripId: string): Promise<void> {
    const tripRef = doc(db, 'trips', tripId);
    await deleteDoc(tripRef);
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
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

  async function deleteActivity(
    tripId: string,
    dayId: string,
    activityId: string
  ): Promise<void> {
    const activityRef = doc(db, 'trips', tripId, 'days', dayId, 'activities', activityId);
    await deleteDoc(activityRef);
    await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
  }

  return {
    createTrip,
    updateTrip,
    deleteTrip,
    addDay,
    addActivity,
    updateActivity,
    deleteActivity,
  };
}
