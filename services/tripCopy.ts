/**
 * Writes a "Make it yours" copy (rules in utils/tripCopy.ts): the trip first, then its days and stops in one batch —
 * rules' get() can't see a parent made in the same batch — and the trip is removed if that batch fails, so a
 * half-copied trip never stays. Dates are optional: a start date sets the end from the copy's length.
 */
import { collection, deleteDoc, doc, serverTimestamp, setDoc, Timestamp, writeBatch } from 'firebase/firestore';
import { auth, db } from '@/services/firebase';
import { requireOnline } from '@/services/offline';
import { toCalendarDate } from '@/utils/calendarDate';
import { selectFixedSpan } from '@/utils/dateRange';
import { copyTripDocs } from '@/utils/tripCopy';
import type { TripWithDays } from '@/types';

export async function copyTrip(src: TripWithDays, authorName: string, start: Date | null): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  if (!requireOnline()) throw new Error('offline');
  const docs = copyTripDocs(src, { authorName });
  const span = start ? selectFixedSpan(start, docs.days.length) : null;
  const tripRef = doc(collection(db, 'trips'));
  await setDoc(tripRef, {
    authorUid: uid, ...docs.trip,
    startDate: span?.start ? Timestamp.fromDate(span.start) : null,
    startDay: span?.start ? toCalendarDate(span.start) : null,
    endDate: span?.end ? Timestamp.fromDate(span.end) : null,
    // The cover with the place it's refreshed by (functions/src/coverRefresh.ts), else the cover job can't renew it.
    tags: [], coverImageUrl: src.coverImageUrl ?? null,
    ...(typeof (src as { coverPlaceId?: unknown }).coverPlaceId === 'string' ? { coverPlaceId: (src as { coverPlaceId?: string }).coverPlaceId, coverRefreshedAtMs: Date.now() } : {}),
    isAiGenerated: false, status: 'planning',
    collaborators: [], likesCount: 0, savesCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const dayIds: Record<string, string> = {};
  const batch = writeBatch(db);
  for (const day of docs.days) {
    const dayRef = doc(collection(db, 'trips', tripRef.id, 'days'));
    dayIds[day.key] = dayRef.id;
    batch.set(dayRef, { dayNumber: day.dayNumber, destinationIndex: day.destinationIndex, date: null, title: day.title, notes: day.notes });
  }
  for (const s of docs.stops) {
    const dayId = dayIds[s.dayKey];
    if (!dayId) continue;
    batch.set(doc(collection(db, 'trips', tripRef.id, 'days', dayId, 'activities')), {
      type: s.type, title: s.title, titleSource: s.titleSource, placeId: s.placeId, placeName: s.placeName, address: null,
      lat: s.lat, lng: s.lng, ...(s.searchQuery ? { searchQuery: s.searchQuery } : {}),
      startTime: null, endTime: null, durationMinutes: null, notes: '', bookingRef: null, cost: null, currency: null,
      mediaUrls: [], visited: false, visitedAt: null, order: s.order, createdAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (e) {
    await deleteDoc(tripRef).catch(() => {});
    throw e;
  }
  return tripRef.id;
}
