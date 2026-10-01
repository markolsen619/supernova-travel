import { deleteDoc, doc } from 'firebase/firestore';
import type { QueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';

/**
 * Deletes a post the signed-in user wrote (rules allow only the author).
 * Everything that hangs off it — comments, likes, its photos in Storage, the
 * author's like/comment notifications, other people's saved copies — is
 * removed server-side by onPostDeleted.
 */
export async function deletePost(postId: string, queryClient: QueryClient): Promise<void> {
  await deleteDoc(doc(db, 'posts', postId));
  queryClient.invalidateQueries({ queryKey: ['userPosts'] });
  queryClient.invalidateQueries({ queryKey: ['feed'], refetchType: 'all' });
  queryClient.removeQueries({ queryKey: ['post', postId] });
}
