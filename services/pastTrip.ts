/**
 * Saves a reviewed past trip: the trip doc, then every day and stop in one batch (rules read the parent trip with
 * get(), which can't see a trip created in the same batch — so the trip is deleted if the batch fails), then the
 * photos, re-encoded with no metadata or location, to each stop's journal (≤ 10 a stop), then the cover.
 */
import { collection, deleteDoc, doc, serverTimestamp, setDoc, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { auth, db, storage } from '@/services/firebase';
import type { TripVisibility } from '@/types';
import type { PastTripDraft } from '@/utils/pastTrip';
import { pastTripDocs, uploadQueue, type PastTripDocs } from '@/utils/pastTripDocs';
import { PHOTO_QUALITY, uploadResize } from '@/utils/photoUpload';

export interface SavedPastTrip { tripId: string; dayIds: Record<string, string>; stopIds: Record<string, string>; failed: { stopKey: string; photoId: string }[]; urls: Record<string, string> }

const localDate = (day: string) => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d); };

async function cleanJpeg(uri: string): Promise<string> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const resize = uploadResize(original.width, original.height);
  const image = resize ? await ImageManipulator.manipulate(uri).resize(resize).renderAsync() : original;
  return (await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG })).uri;
}

async function uploadOne(path: string, uri: string): Promise<string> {
  // Never upload the original: it carries the photo's location. A photo that can't be re-encoded fails instead.
  const blob = await fetch(await cleanJpeg(uri)).then((r) => r.blob());
  const r = ref(storage, path);
  await new Promise<void>((resolve, reject) => uploadBytesResumable(r, blob, { contentType: 'image/jpeg' }).on('state_changed', undefined, reject, () => resolve()));
  return getDownloadURL(r);
}

export async function savePastTrip(d: PastTripDraft, visibility: TripVisibility, onProgress?: (f: number) => void): Promise<{ saved: SavedPastTrip; docs: PastTripDocs }> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const docs = pastTripDocs(d, visibility);
  const tripRef = doc(collection(db, 'trips'));
  const start = localDate(docs.trip.startDay);
  await setDoc(tripRef, {
    authorUid: uid, title: docs.trip.title, description: docs.trip.description,
    destination: docs.trip.destination, additionalDestinations: docs.trip.additionalDestinations,
    startDate: Timestamp.fromDate(start), startDay: docs.trip.startDay, endDate: Timestamp.fromDate(localDate(docs.trip.endDay)),
    visibility, tags: [], coverImageUrl: null, isAiGenerated: false, source: 'photos', status: 'planning',
    collaborators: [], likesCount: 0, savesCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
  const dayIds: Record<string, string> = {};
  const stopIds: Record<string, string> = {};
  const batch = writeBatch(db);
  for (const day of docs.days) {
    const dayRef = doc(collection(db, 'trips', tripRef.id, 'days'));
    dayIds[day.key] = dayRef.id;
    batch.set(dayRef, { dayNumber: day.dayNumber, destinationIndex: day.destinationIndex, date: null, title: day.title, notes: day.notes });
  }
  for (const s of docs.stops) {
    const stopRef = doc(collection(db, 'trips', tripRef.id, 'days', dayIds[s.dayKey], 'activities'));
    stopIds[s.key] = stopRef.id;
    batch.set(stopRef, {
      type: s.type, title: s.title, titleSource: 'user', placeId: null, placeName: s.placeName, address: null,
      lat: s.lat, lng: s.lng, startTime: s.startTime, endTime: null, durationMinutes: null, notes: '',
      bookingRef: null, cost: null, currency: null, mediaUrls: [], order: s.order, createdAt: serverTimestamp(),
    });
  }
  try {
    await batch.commit();
  } catch (e) {
    await deleteDoc(tripRef).catch(() => {});
    throw e;
  }
  onProgress?.(0.1);
  const saved = await uploadPastTripPhotos(d, { tripId: tripRef.id, dayIds, stopIds, failed: [], urls: {} }, docs, (f) => onProgress?.(0.1 + f * 0.9));
  return { saved, docs };
}

/** Uploads every photo not yet uploaded (a retry passes the previous result), writes each stop's journal and the cover. */
export async function uploadPastTripPhotos(d: PastTripDraft, saved: SavedPastTrip, docs: PastTripDocs, onProgress?: (f: number) => void): Promise<SavedPastTrip> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Not authenticated');
  const urls = { ...saved.urls };
  const queue = uploadQueue(docs, new Set(Object.keys(urls)));
  const failed: SavedPastTrip['failed'] = [];
  let done = 0;
  const work = async (item: { stopKey: string; photoId: string }) => {
    const path = `journal_photos/${uid}/${saved.tripId}/${saved.stopIds[item.stopKey]}/${item.photoId.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
    const uri = d.photos[item.photoId]?.uri;
    try {
      urls[item.photoId] = await uploadOne(path, uri);
    } catch {
      try { urls[item.photoId] = await uploadOne(path, uri); } catch { failed.push(item); }
    }
    onProgress?.(++done / Math.max(1, queue.length));
  };
  for (let i = 0; i < queue.length; i += 3) await Promise.all(queue.slice(i, i + 3).map(work));

  const batch = writeBatch(db);
  for (const s of docs.stops) {
    const photoUrls = s.photoIds.map((id) => urls[id]).filter((u): u is string => !!u);
    if (!photoUrls.length) continue;
    batch.set(doc(db, 'trips', saved.tripId, 'days', saved.dayIds[s.dayKey], 'activities', saved.stopIds[s.key], 'journal', 'entry'), { note: '', photoUrls });
  }
  await batch.commit();
  const coverUrl = d.coverId ? urls[d.coverId] : undefined;
  if (coverUrl) await updateDoc(doc(db, 'trips', saved.tripId), { coverImageUrl: coverUrl, updatedAt: serverTimestamp() });
  return { ...saved, urls, failed };
}
