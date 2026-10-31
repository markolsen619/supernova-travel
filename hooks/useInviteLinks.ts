import { useCallback, useState } from 'react';
import { Share } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { cancelInviteLinks, createInviteLink, openInviteLinkCount } from '@/services/inviteLinks';

export function useInviteLinks(tripId: string, enabled: boolean) {
  const queryClient = useQueryClient();
  const { data: openCount = 0 } = useQuery({
    queryKey: ['inviteLinks', tripId],
    queryFn: () => openInviteLinkCount(tripId),
    enabled: enabled && !!tripId,
    staleTime: 30_000,
  });
  const [sharing, setSharing] = useState(false);
  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['inviteLinks', tripId] }), [queryClient, tripId]);

  const shareLink = useCallback(async () => {
    setSharing(true);
    try {
      const { message } = await createInviteLink(tripId);
      await Share.share({ message });
    } finally {
      setSharing(false);
      refresh();
    }
  }, [tripId, refresh]);

  const cancelAll = useCallback(async () => {
    await cancelInviteLinks(tripId);
    refresh();
  }, [tripId, refresh]);

  return { openCount, shareLink, cancelAll, sharing };
}
