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
import { pastTripDocs, stopUploads, type PastTripDocs } from '@/utils/pastTripDocs';
import { PHOTO_QUALITY, uploadResize } from '@/utils/photoUpload';

export interface SavedPastTrip {
  tripId: string; dayIds: Record<string, string>; stopIds: Record<string, string>;
  failed: { stopKey: string; photoId: string }[];
  urls: Record<string, string>;
  /** Stops whose journal entry couldn't be written yet (retried with the photos). */
  journalPending: string[];
}

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
  const saved = await uploadPastTripPhotos(d, { tripId: tripRef.id, dayIds, stopIds, failed: [], urls: {}, journalPending: [] }, docs, (f) => onProgress?.(0.1 + f * 0.9));
  return { saved, docs };
}

/** A write that hangs offline (the web SDK waits for the network) counts as failed after this long. */
const WRITE_TIMEOUT_MS = 20_000;
const withTimeout = <T,>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), WRITE_TIMEOUT_MS))]);

/**
 * Uploads every photo not yet uploaded (a retry passes the previous result), stop by stop, writing each stop's
 * journal as soon as its photos are up, then the cover. Never throws: once the trip exists, a failure is reported
 * on the finish screen and retried from there, never as "Couldn't save" (final review I1 — that invited a second trip).
 */
export async function uploadPastTripPhotos(d: PastTripDraft, saved: SavedPastTrip, docs: PastTripDocs, onProgress?: (f: number) => void): Promise<SavedPastTrip> {
  const uid = auth.currentUser?.uid;
  const urls = { ...saved.urls };
  const pending = new Set(saved.journalPending);
  const failed: SavedPastTrip['failed'] = [];
  const work = stopUploads(docs, new Set(Object.keys(urls)), pending);
  const total = Math.max(1, work.reduce((n, w) => n + w.photoIds.length, 0));
  let done = 0;
  for (const w of work) {
    const stopId = saved.stopIds[w.stopKey];
    const one = async (photoId: string) => {
      const path = `journal_photos/${uid}/${saved.tripId}/${stopId}/${photoId.replace(/[^A-Za-z0-9_-]/g, '_')}.jpg`;
      const uri = d.photos[photoId]?.uri;
      try {
        urls[photoId] = await uploadOne(path, uri);
      } catch {
        try { urls[photoId] = await uploadOne(path, uri); } catch { failed.push({ stopKey: w.stopKey, photoId }); }
      }
      onProgress?.(++done / total);
    };
    for (let i = 0; i < w.photoIds.length; i += 3) await Promise.all(w.photoIds.slice(i, i + 3).map(one));
    const stop = docs.stops.find((s) => s.key === w.stopKey);
    const photoUrls = (stop?.photoIds ?? []).map((id) => urls[id]).filter((u): u is string => !!u);
    if (!uid || !stop || !photoUrls.length) { pending.delete(w.stopKey); continue; }
    try {
      await withTimeout(setDoc(doc(db, 'trips', saved.tripId, 'days', saved.dayIds[stop.dayKey], 'activities', stopId, 'journal', 'entry'), { note: '', photoUrls }));
      pending.delete(w.stopKey);
    } catch {
      pending.add(w.stopKey);
    }
  }
  const coverUrl = d.coverId ? urls[d.coverId] : undefined;
  if (coverUrl) await withTimeout(updateDoc(doc(db, 'trips', saved.tripId), { coverImageUrl: coverUrl, updatedAt: serverTimestamp() })).catch(() => {});
  return { ...saved, urls, failed, journalPending: [...pending] };
}
