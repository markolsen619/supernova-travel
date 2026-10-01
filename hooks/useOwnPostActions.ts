import { useCallback } from 'react';
import { ActionSheetIOS, Alert, Platform, findNodeHandle, type View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { deletePost } from '@/services/posts';
import { deletePostConfirm } from '@/utils/postActions';
import type { Post } from '@/types';

/**
 * The ⋯ menu on a post you wrote: Edit post, Delete post. Someone else's post
 * uses useContentActions (Report / Block) instead. `onDeleted` lets the post
 * screen leave once its post is gone; the feed just refetches.
 */
export function useOwnPostActions(onDeleted?: () => void) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const confirmDelete = useCallback((post: Post) => {
    const { title, message } = deletePostConfirm(post);
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          try {
            await deletePost(post.id, queryClient);
            onDeleted?.();
          } catch {
            Alert.alert("We couldn't delete your post", 'Check your connection and try again.');
          }
        },
      },
    ]);
  }, [queryClient, onDeleted]);

  const openOwnPostActions = useCallback((post: Post, anchor?: React.RefObject<View | null>) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const edit = () => router.push(`/post/edit/${post.id}`);
    if (Platform.OS === 'ios') {
      const anchorHandle = anchor?.current ? findNodeHandle(anchor.current) : null;
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options: ['Edit post', 'Delete post', 'Cancel'],
          destructiveButtonIndex: 1,
          cancelButtonIndex: 2,
          // iPad shows the sheet as a popover, which needs an anchor.
          ...(anchorHandle ? { anchor: anchorHandle } : {}),
        },
        (i) => {
          if (i === 0) edit();
          else if (i === 1) confirmDelete(post);
        },
      );
      return;
    }
    Alert.alert('Your post', undefined, [
      { text: 'Edit post', onPress: edit },
      { text: 'Delete post', style: 'destructive', onPress: () => confirmDelete(post) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [router, confirmDelete]);

  return { openOwnPostActions };
}
