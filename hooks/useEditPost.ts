import { useState } from 'react';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { uploadPostImage } from '@/services/postMedia';

export type PhotoItem = { kind: 'existing'; url: string } | { kind: 'new'; localUri: string };

/** Assembles the final `mediaUrls` array in item order: existing items keep
 * their URL, new items are looked up by their local URI in the just-uploaded
 * map. Order is driven entirely by `items` (post-drag-reorder), not by
 * upload completion order. */
export function resolveMediaUrls(items: PhotoItem[], uploadedByLocalUri: Record<string, string>): string[] {
  return items.map((item) => (item.kind === 'existing' ? item.url : uploadedByLocalUri[item.localUri]));
}

export function useEditPost(postId: string) {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const queryClient = useQueryClient();
  const [isSaving, setIsSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['userPosts'] });
    queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' });
    queryClient.invalidateQueries({ queryKey: ['post', postId] });
  }

  async function updateCaption(caption: string): Promise<void> {
    await updateDoc(doc(db, 'posts', postId), { caption: caption.trim() });
    invalidate();
  }

  async function updatePlace(placeName: string | null): Promise<void> {
    await updateDoc(doc(db, 'posts', postId), { placeName: placeName?.trim() || null });
    invalidate();
  }

  async function updatePhotos(items: PhotoItem[]): Promise<void> {
    if (!uid) throw new Error('Not authenticated');
    setIsSaving(true);
    setUploadProgress(0);
    try {
      const newItems = items.filter((i): i is Extract<PhotoItem, { kind: 'new' }> => i.kind === 'new');
      const uploadedByLocalUri: Record<string, string> = {};
      for (let i = 0; i < newItems.length; i++) {
        uploadedByLocalUri[newItems[i].localUri] = await uploadPostImage(uid, newItems[i].localUri, i);
        setUploadProgress(Math.round(((i + 1) / Math.max(newItems.length, 1)) * 100));
      }
      const mediaUrls = resolveMediaUrls(items, uploadedByLocalUri);
      await updateDoc(doc(db, 'posts', postId), {
        mediaUrls,
        mediaUrl: mediaUrls[0] ?? '',
        thumbnailUrl: mediaUrls[0] ?? null,
      });
      invalidate();
    } finally {
      setIsSaving(false);
      setUploadProgress(0);
    }
  }

  async function deletePost(): Promise<void> {
    await deleteDoc(doc(db, 'posts', postId));
    invalidate();
  }

  return { updateCaption, updatePlace, updatePhotos, deletePost, isSaving, uploadProgress };
}
