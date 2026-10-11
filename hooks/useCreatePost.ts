import { isPrivateAccount, newPostVisibility } from '@/utils/privacy';
import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { Timestamp } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { uploadPostFile, uploadPostImage } from '@/services/postMedia';
import { Video, getVideoMetaData } from 'react-native-compressor';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { clipDurationSec, postingProgress, videoAspect, videoPostFields, videoProblem, videoStoragePaths } from '@/utils/videoPost';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUserStore } from '@/stores/useUserStore';
import { Trip } from '@/types';
import { containsObjectionableText, OBJECTIONABLE_TEXT_MESSAGE } from '@/utils/contentFilter';
import { tripPlaceLabel } from '@/utils/tripRegion';

interface CreatePhotoPostInput {
  localUris: string[];
  caption: string;
  placeName: string | null;
}

/** A clip that can't be posted as it is — its message is for the person posting. */
class VideoPostProblem extends Error {}

interface CreateVideoPostInput {
  localUri: string;
  /** expo-image-picker's `asset.duration` (ms), when it has one. */
  pickerDurationMs: number | null;
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

export function useCreatePost() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const profile = useUserStore((s) => s.profile);

  function invalidateFeed() {
    queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['userPosts'] });
  }

  async function createPhotoPost(input: CreatePhotoPostInput): Promise<string> {
    if (!user) throw new Error('Not authenticated');
    if (containsObjectionableText(input.caption) || containsObjectionableText(input.placeName)) {
      throw new Error(OBJECTIONABLE_TEXT_MESSAGE);
    }
    setIsUploading(true);
    setUploadProgress(0);

    try {
      const total = input.localUris.length;
      const mediaUrls: string[] = [];

      for (let i = 0; i < total; i++) {
        const url = await uploadPostImage(user.uid, input.localUris[i], i);
        mediaUrls.push(url);
        setUploadProgress(Math.round(((i + 1) / total) * 100));
      }

      const mediaUrl = mediaUrls[0];

      const docRef = await addDoc(collection(db, 'posts'), {
        authorUid: user.uid,
        authorDisplayName: profile?.fullName ?? user.displayName ?? 'Traveler',
        authorUsername: profile?.username ?? '',
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
        ...newPostVisibility(isPrivateAccount(profile)),
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

  async function createVideoPost(input: CreateVideoPostInput): Promise<string> {
    if (!user) throw new Error('Not authenticated');
    if (containsObjectionableText(input.caption) || containsObjectionableText(input.placeName)) {
      throw new Error(OBJECTIONABLE_TEXT_MESSAGE);
    }
    setIsUploading(true);
    setUploadProgress(0);
    try {
      const compressedUri = await Video.compress(
        input.localUri,
        { compressionMethod: 'manual', maxSize: 1280, bitrate: 2_500_000 },
        (p) => setUploadProgress(postingProgress('compress', p)),
      );
      const meta = await getVideoMetaData(compressedUri);
      const durationSec = clipDurationSec(input.pickerDurationMs, Number(meta.duration) || null);
      const problem = videoProblem({ durationSec, bytes: Number(meta.size) || null });
      if (problem) throw new VideoPostProblem(problem);
      const cover = await VideoThumbnails.getThumbnailAsync(compressedUri, { time: 500, quality: 0.8 });
      const paths = videoStoragePaths(user.uid, Date.now());
      const coverUrl = await uploadPostFile(paths.cover, cover.uri, 'image/jpeg');
      const videoUrl = await uploadPostFile(paths.video, compressedUri, 'video/mp4', (f) => setUploadProgress(postingProgress('upload', f)));
      // Written last: a failed upload never leaves a post pointing at a missing file.
      const docRef = await addDoc(collection(db, 'posts'), {
        authorUid: user.uid,
        authorDisplayName: profile?.fullName ?? user.displayName ?? 'Traveler',
        authorUsername: profile?.username ?? '',
        authorAvatarUrl: profile?.avatarUrl ?? null,
        caption: input.caption.trim(),
        ...videoPostFields({ videoUrl, coverUrl, durationSec: durationSec!, aspect: videoAspect(cover.width, cover.height) }),
        placeName: input.placeName,
        placeId: null, lat: null, lng: null,
        tripId: null, tripTitle: null, tripDestination: null, tripDateRange: null,
        likesCount: 0, commentsCount: 0,
        ...newPostVisibility(isPrivateAccount(profile)),
        tags: [],
        createdAt: serverTimestamp(),
      });
      invalidateFeed();
      return docRef.id;
    } catch (e) {
      // Our own checks already speak in sentences; anything native (compressor, upload) gets one.
      if (e instanceof VideoPostProblem) throw e;
      console.warn('[createVideoPost] failed', e);
      throw new Error("Your video didn't upload. Check your connection and try again.");
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  }

  async function createTripPost(input: CreateTripPostInput): Promise<string> {
    if (!user) throw new Error('Not authenticated');
    if (containsObjectionableText(input.caption)) throw new Error(OBJECTIONABLE_TEXT_MESSAGE);
    setIsUploading(true);

    try {
      const { trip, caption } = input;
      const mediaUrl = trip.coverImageUrl ?? '';

      const docRef = await addDoc(collection(db, 'posts'), {
        authorUid: user.uid,
        authorDisplayName: profile?.fullName ?? user.displayName ?? 'Traveler',
        authorUsername: profile?.username ?? '',
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
        // The region for a multi-stop trip ("Baja California Sur"), not just its first stop.
        tripDestination: tripPlaceLabel(trip) || null,
        tripDateRange: formatDateRange(trip.startDate, trip.endDate),
        likesCount: 0,
        commentsCount: 0,
        ...newPostVisibility(isPrivateAccount(profile)),
        tags: trip.tags ?? [],
        createdAt: serverTimestamp(),
      });

      invalidateFeed();
      return docRef.id;
    } finally {
      setIsUploading(false);
    }
  }

  return { createPhotoPost, createVideoPost, createTripPost, isUploading, uploadProgress };
}
