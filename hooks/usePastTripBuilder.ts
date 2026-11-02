/**
 * The past-trip flow's state (spec docs/superpowers/specs/2026-10-25-past-trips-from-photos-design.md):
 * pick → building (read photos, name places, Nova's words) → review → saving → done. The draft lives only in
 * memory until Save; nothing is written before.
 */
import { useCallback, useReducer, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { httpsCallable } from 'firebase/functions';
import { collection, doc } from 'firebase/firestore';
import { db, functions } from '@/services/firebase';
import { requireOnline } from '@/services/offline';
import { photoMeta } from '@/utils/photoMeta';
import { buildPastTrip, MAX_PICK, MAX_SPAN_DAYS, needsCities, spanDays, withTripCities, type DraftCity, type PastTripDraft, type PickedPhoto } from '@/utils/pastTrip';
import { editPastTrip, type PastTripEdit } from '@/utils/pastTripEdits';
import type { PastTripDocs } from '@/utils/pastTripDocs';
import { nameDraft } from '@/services/pastTripPlaces';
import { savePastTrip, uploadPastTripPhotos, type SavedPastTrip } from '@/services/pastTrip';
import type { TripVisibility } from '@/types';

export type PastTripPhase = 'intro' | 'cities' | 'building' | 'review' | 'saving' | 'done';
type Story = { title: string; description: string; dayCaptions: string[]; fromNova: boolean };
type Action = { set: PastTripDraft } | PastTripEdit;

const fallbackTitle = (d: PastTripDraft) => `Trip to ${d.cities[0]?.name || 'somewhere'}`;

function reducer(d: PastTripDraft | null, a: Action): PastTripDraft | null {
  if ('set' in a) return a.set;
  return d ? editPastTrip(d, a) : d;
}

/** `withConsent(action, onDismiss)`: the screen's AI consent gate (purpose `agent`). */
export function usePastTripBuilder(withConsent: (action: () => void, onDismiss: () => void) => void) {
  const [phase, setPhase] = useState<PastTripPhase>('intro');
  const [step, setStep] = useState(0); // 0 reading photos, 1 finding places, 2 writing the story
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [draft, dispatch] = useReducer(reducer, null);
  const [result, setResult] = useState<{ saved: SavedPastTrip; docs: PastTripDocs } | null>(null);
  const draftRef = useRef<PastTripDraft | null>(null);
  draftRef.current = draft;

  const writeStory = useCallback(async (d: PastTripDraft): Promise<PastTripDraft> => {
    const call = httpsCallable<unknown, Story>(functions, 'pastTripStory');
    const req = {
      requestId: doc(collection(db, 'trips')).id,
      cities: d.cities.length ? d.cities.map((c) => (c.name || 'Somewhere').slice(0, 80)) : ['Somewhere'],
      days: d.days.map((day) => ({
        day: day.day,
        city: Math.min(day.city, Math.max(0, d.cities.length - 1)),
        stops: day.stops.map((s) => ({ name: (s.name || 'A stop').slice(0, 80), time: s.time })),
      })),
    };
    try {
      const { data } = await call(req);
      return { ...d, title: data.title, description: data.description, days: d.days.map((day, i) => ({ ...day, caption: data.dayCaptions[i] ?? '' })) };
    } catch {
      return { ...d, title: fallbackTitle(d) };
    }
  }, []);

  // Name places, then Nova's words, then review. Shared by a normal pick and the "Where was this trip?" step.
  const build = useCallback(async (start: PastTripDraft) => {
    let d = start;
    setPhase('building'); setStep(0); setProgress(0);
    try {
      setStep(1);
      d = await nameDraft(d, (done, total) => setProgress(done / Math.max(1, total)));
      setStep(2);
      const named = d;
      d = await new Promise<PastTripDraft>((resolve) => {
        withConsent(() => { writeStory(named).then(resolve, () => resolve({ ...named, title: fallbackTitle(named) })); }, () => resolve({ ...named, title: fallbackTitle(named) }));
      });
      dispatch({ set: d.title ? d : { ...d, title: fallbackTitle(d) } });
      setPhase('review');
    } catch {
      setPhase('intro');
      setError("Couldn't build the trip. Check your connection and try again.");
    }
  }, [withConsent, writeStory]);

  // Photos with times but no locations (Android's picker removes them) wait here for their cities.
  const waitingRef = useRef<PastTripDraft | null>(null);
  const [waitingDays, setWaitingDays] = useState(0);

  const pick = useCallback(async () => {
    setError(null);
    if (!requireOnline()) return; // it says so itself ("You're offline")
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsMultipleSelection: true, selectionLimit: MAX_PICK, exif: true, quality: 1,
    });
    if (res.canceled || !res.assets.length) return;
    const photos: PickedPhoto[] = res.assets.slice(0, MAX_PICK).map((a, i) => ({
      id: a.assetId ?? `p${i}`,
      uri: a.uri,
      meta: photoMeta(a.exif as Record<string, unknown> | null | undefined),
    }));
    if (spanDays(photos) > MAX_SPAN_DAYS) { setError('These photos cover more than 60 days. Pick one trip at a time.'); return; }
    const d = buildPastTrip(photos);
    if (!d.days.length) { setError("These photos don't say when they were taken. Try photos from your camera."); return; }
    if (needsCities(d)) { waitingRef.current = d; setWaitingDays(d.days.length); setPhase('cities'); return; }
    await build(d);
  }, [build]);

  const chooseCities = useCallback(async (cities: DraftCity[]) => {
    const d = waitingRef.current;
    if (!d || !cities.length || !requireOnline()) return;
    waitingRef.current = null;
    await build(withTripCities(d, cities));
  }, [build]);

  const cancelCities = useCallback(() => { waitingRef.current = null; setPhase('intro'); }, []);

  const edit = useCallback((e: PastTripEdit) => dispatch(e), []);

  const save = useCallback(async (visibility: TripVisibility) => {
    const d = draftRef.current;
    if (!d) return;
    if (!requireOnline()) return; // it says so itself ("You're offline")
    setPhase('saving'); setProgress(0); setError(null);
    try {
      setResult(await savePastTrip(d, visibility, setProgress));
      setPhase('done');
    } catch {
      setPhase('review');
      setError("Couldn't save the trip. Check your connection and try again.");
    }
  }, []);

  const retryUploads = useCallback(async () => {
    const d = draftRef.current;
    if (!d || !result || !requireOnline()) return;
    try {
      const saved = await uploadPastTripPhotos(d, result.saved, result.docs);
      setResult({ ...result, saved });
    } catch {
      // Still failing: the finish screen keeps offering Try again.
    }
  }, [result]);

  return {
    phase, step, progress, error, draft, pick, chooseCities, cancelCities, waitingDays, edit, save, retryUploads, result,
    noLocations: !!draft && draft.cities.length === 0,
    placesByHand: !!draft && draft.days.some((day) => day.stops.some((s) => s.needsPlace)),
  };
}
