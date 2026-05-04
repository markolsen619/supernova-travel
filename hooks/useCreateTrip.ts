import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { auth } from '@/services/firebase';
import { Trip, TripDay, TripActivity, CreateTripInput } from '@/types';

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
    return docRef.id;
  }

  async function updateTrip(tripId: string, data: Partial<Trip>): Promise<void> {
    const tripRef = doc(db, 'trips', tripId);
    await updateDoc(tripRef, {
      ...data,
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
    activity: Omit<TripActivity, 'id' | 'order'>
  ): Promise<string> {
    const activitiesRef = collection(db, 'trips', tripId, 'days', dayId, 'activities');

    // Auto-set order = existing activity count
    const existingSnap = await getDocs(
      query(activitiesRef, orderBy('order'))
    );
    const order = existingSnap.size;

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
