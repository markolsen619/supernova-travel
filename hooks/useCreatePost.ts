import { useState } from 'react';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { storage, db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { Trip } from '@/types';

interface CreatePhotoPostInput {
  localUris: string[];
  caption: string;
  placeName: string | null;
}

interface CreateTripPostInput {
  trip: Trip;
  caption: string;
}

function formatDateRange(start: Timestamp | null, end: Timestamp | null): string | null {
  if (!start) return null;
  const fmt = (ts: Timestamp) =>
    ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return end ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

async function uploadImage(uid: string, uri: string, index: number): Promise<string> {
  const blob = await fetch(uri).then((r) => r.blob());
  const storageRef = ref(storage, `posts/${uid}/${Date.now()}_${index}.jpg`);
  const task = uploadBytesResumable(storageRef, blob);
  await new Promise<void>((resolve, reject) => {
    task.on(
      'state_changed',
      undefined,
      (err) => reject(new Error(`Storage upload failed: ${err.message}`)),
      resolve,
    );
  });
  return getDownloadURL(storageRef);
}

export function useCreatePost() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useUserStore((s) => s.profile);

  function invalidateFeed() {
    queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' });
  }

  async function createPhotoPost(input: CreatePhotoPostInput): Promise<string> {
    if (!user) throw new Error('Not authenticated');
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const total = input.localUris.length;
      const mediaUrls: string[] = [];

      for (let i = 0; i < total; i++) {
        const url = await uploadImage(user.uid, input.localUris[i], i);
        mediaUrls.push(url);
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }

      const mediaUrl = mediaUrls[0];

      const docRef = await addDoc(collection(db, 'posts'), {
        authorUid: user.uid,
        authorDisplayName: profile?.displayName ?? user.displayName ?? 'Traveler',
        authorUsername: profile?.username ?? user.uid,
        authorAvatarUrl: profile?.avatarUrl ?? null,
        caption: input.caption.trim(),
        mediaType: 'photo',
        mediaUrl,
        mediaUrls,
        thumbnailUrl: mediaUrl,
        placeName: input.placeName,
        placeId: null,
        lat: null,
        lng: null,
        tripId: null,
        tripTitle: null,
        tripDestination: null,
        tripDateRange: null,
        likesCount: 0,
        commentsCount: 0,
        tags: [],
        createdAt: serverTimestamp(),
      });

      invalidateFeed();
      return docRef.id;
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  async function createTripPost(input: CreateTripPostInput): Promise<string> {
    if (!user) throw new Error('Not authenticated');
    setIsUploading(true);

    try {
      const { trip, caption } = input;
      const mediaUrl = trip.coverImageUrl ?? '';

      const docRef = await addDoc(collection(db, 'posts'), {
        authorUid: user.uid,
        authorDisplayName: profile?.displayName ?? user.displayName ?? 'Traveler',
        authorUsername: profile?.username ?? user.uid,
        authorAvatarUrl: profile?.avatarUrl ?? null,
        caption: caption.trim(),
        mediaType: 'trip',
        mediaUrl,
        mediaUrls: mediaUrl ? [mediaUrl] : [],
        thumbnailUrl: mediaUrl || null,
        placeName: trip.destination.name ?? null,
        placeId: trip.destination.placeId ?? null,
        lat: trip.destination.lat ?? null,
        lng: trip.destination.lng ?? null,
        tripId: trip.id,
        tripTitle: trip.title,
        tripDestination: trip.destination.name ?? null,
        tripDateRange: formatDateRange(trip.startDate, trip.endDate),
        likesCount: 0,
        commentsCount: 0,
        tags: trip.tags ?? [],
        createdAt: serverTimestamp(),
      });

      invalidateFeed();
      return docRef.id;
    } finally {
      setIsUploading(false);
    }
  }

  return { createPhotoPost, createTripPost, isUploading, uploadProgress };
}
