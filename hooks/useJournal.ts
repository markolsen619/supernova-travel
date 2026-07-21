import { useCallback, useState } from 'react';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { db, storage } from '@/services/firebase';

/** "A few photos" per TM-3's brief — deliberately smaller than a feed
 * post's 10-photo cap (app/post/create-photo.tsx), since this is a quick
 * per-stop note, not a curated post. */
export const MAX_JOURNAL_PHOTOS = 5;

export interface JournalEntry {
  note: string;
  photoUrls: string[];
}

function journalRef(tripId: string, dayId: string, activityId: string) {
  // Fixed doc ID ("entry") — structurally one entry per stop, no list to
  // dedupe or paginate, matching "no multiple entries" from the brief.
  return doc(db, 'trips', tripId, 'days', dayId, 'activities', activityId, 'journal', 'entry');
}

async function fetchJournal(tripId: string, dayId: string, activityId: string): Promise<JournalEntry | null> {
  const snap = await getDoc(journalRef(tripId, dayId, activityId));
  if (!snap.exists()) return null;
  const data = snap.data();
  return { note: data.note ?? '', photoUrls: data.photoUrls ?? [] };
}

/** Reads a stop's journal — returns null if none exists yet. Firestore
 * rules gate this read (owner, or non-owner only on a shared trip); a
 * denied read surfaces as a query error, not a silent empty result. */
export function useJournalEntry(
  tripId: string | null,
  dayId: string | null,
  activityId: string | null,
  enabled = true,
) {
  return useQuery({
    queryKey: ['journal', tripId, dayId, activityId],
    queryFn: () => fetchJournal(tripId!, dayId!, activityId!),
    enabled: enabled && !!tripId && !!dayId && !!activityId,
    staleTime: 2 * 60 * 1000,
  });
}

/**
 * Batched journal fetch for the trip recap (TM-3d) — one query for every
 * visited stop's journal at once, keyed by activityId. Read-only; still
 * gated by the same per-entry firestore.rules as useJournalEntry (a
 * non-owner viewing an unshared trip never reaches this — the trip/
 * activities themselves already fail to load first).
 */
export function useTripJournals(tripId: string | null, refs: { dayId: string; activityId: string }[]) {
  const key = refs.map((r) => r.activityId).join(',');
  return useQuery({
    queryKey: ['tripJournals', tripId, key],
    queryFn: async () => {
      const entries = await Promise.all(
        refs.map(async (r) => [r.activityId, await fetchJournal(tripId!, r.dayId, r.activityId)] as const),
      );
      return Object.fromEntries(entries) as Record<string, JournalEntry | null>;
    },
    enabled: !!tripId && refs.length > 0,
    staleTime: 2 * 60 * 1000,
  });
}

export function useJournal() {
  const queryClient = useQueryClient();
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  /**
   * Pick from the library (multi-select, capped to whatever's left of the 5-
   * photo budget), compress, upload to
   * `journal_photos/{uid}/{tripId}/{activityId}/…` (Storage rules owner-gate
   * this path — see storage.rules). Returns the new URLs, or an error
   * message for inline display.
   */
  const pickJournalPhotos = useCallback(
    async (
      uid: string,
      tripId: string,
      activityId: string,
      existingCount: number,
    ): Promise<{ urls: string[]; error: string | null }> => {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        return { urls: [], error: 'Photo access is off. Enable it in iOS Settings to add photos.' };
      }

      const remaining = MAX_JOURNAL_PHOTOS - existingCount;
      if (remaining <= 0) {
        return { urls: [], error: `You can add up to ${MAX_JOURNAL_PHOTOS} photos per stop.` };
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: remaining,
        quality: 0.6,
        exif: false,
      });
      if (result.canceled || result.assets.length === 0) return { urls: [], error: null };

      setUploading(true);
      try {
        const urls: string[] = [];
        for (let i = 0; i < result.assets.length; i++) {
          const response = await fetch(result.assets[i].uri);
          const blob = await response.blob();
          const photoRef = ref(storage, `journal_photos/${uid}/${tripId}/${activityId}/${Date.now()}_${i}.jpg`);
          await new Promise<void>((resolve, reject) => {
            const task = uploadBytesResumable(photoRef, blob, { contentType: 'image/jpeg' });
            task.on('state_changed', undefined, reject, () => resolve());
          });
          urls.push(await getDownloadURL(photoRef));
        }
        return { urls, error: null };
      } catch (err) {
        console.error('[useJournal] photo upload failed:', err);
        return { urls: [], error: "Couldn't upload those photos. Check your connection and try again." };
      } finally {
        setUploading(false);
      }
    },
    [],
  );

  /** Owner-only per firestore.rules — this will reject for anyone else. */
  const saveJournal = useCallback(
    async (
      tripId: string,
      dayId: string,
      activityId: string,
      data: JournalEntry,
    ): Promise<string | null> => {
      setSaving(true);
      try {
        const trimmed: JournalEntry = { note: data.note.trim(), photoUrls: data.photoUrls };
        await setDoc(journalRef(tripId, dayId, activityId), {
          ...trimmed,
          updatedAt: serverTimestamp(),
        });
        queryClient.setQueryData(['journal', tripId, dayId, activityId], trimmed);
        return null;
      } catch (err) {
        console.error('[useJournal] save failed:', err);
        return "Couldn't save your journal entry. Try again in a moment.";
      } finally {
        setSaving(false);
      }
    },
    [queryClient],
  );

  return { pickJournalPhotos, saveJournal, uploading, saving };
}
