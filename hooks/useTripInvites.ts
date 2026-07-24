import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { db, functions } from '@/services/firebase';
import type { TripInvite } from '@/types';

async function fetchTripInvites(tripId: string): Promise<TripInvite[]> {
  const snap = await getDocs(collection(db, 'trips', tripId, 'invites'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as TripInvite);
}

/** Owner/collaborator-only per firestore.rules — lets the inviter see who's
 * already pending/accepted so InviteFriendsSheet doesn't offer a re-invite. */
export function useTripInvites(tripId: string | null) {
  return useQuery({
    queryKey: ['tripInvites', tripId],
    queryFn: () => fetchTripInvites(tripId!),
    enabled: !!tripId,
    staleTime: 30 * 1000,
  });
}

interface InviteResult {
  status: 'pending' | 'accepted' | 'already_member';
}

/** Sends a trip invite via the inviteToTrip Cloud Function — write is
 * Admin-SDK-only (firestore.rules: invites write: false), since accepting
 * later has to mutate the trip's collaborators[]. */
export function useInviteFriend(tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (inviteeUid: string) => {
      const fn = httpsCallable<{ tripId: string; inviteeUid: string }, InviteResult>(functions, 'inviteToTrip');
      return fn({ tripId, inviteeUid }).then((r) => r.data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tripInvites', tripId] });
    },
  });
}

interface RespondResult {
  status: 'accepted' | 'declined';
}

/** Accept/decline your own pending invite via respondToTripInvite. On
 * accept, the trip's collaborators[] changes server-side — invalidate both
 * the trip detail and list queries so it shows up without a manual refresh
 * (same reasoning as updateTrip()'s broadened invalidation this session). */
export function useRespondToInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ tripId, accept }: { tripId: string; accept: boolean }) => {
      const fn = httpsCallable<{ tripId: string; accept: boolean }, RespondResult>(functions, 'respondToTripInvite');
      return fn({ tripId, accept }).then((r) => r.data);
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['trip', variables.tripId] });
      queryClient.invalidateQueries({ queryKey: ['trips'] });
      queryClient.invalidateQueries({ queryKey: ['tripInvites', variables.tripId] });
    },
  });
}
