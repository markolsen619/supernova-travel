import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

export type InvitePreview =
  | { status: 'open'; inviterFirst: string; tripTitle: string; dates: string | null; coverUrl: string | null; coverCredit?: string | null }
  | { status: 'expired'; inviterFirst: string | null }
  | { status: 'member'; tripId: string };
export type AcceptResult = { status: 'joined' | 'member'; tripId: string; inviterFirst: string; tripTitle: string };

const call = <I, O>(name: string) => (data: I) => httpsCallable<I, O>(functions, name)(data).then((r) => r.data);

export const createInviteLink = (tripId: string) =>
  call<{ tripId: string }, { token: string; url: string; message: string }>('createTripInviteLink')({ tripId });
export const cancelInviteLinks = (tripId: string) =>
  call<{ tripId: string }, { cancelled: number }>('cancelTripInviteLinks')({ tripId }).then((r) => r.cancelled);
export const openInviteLinkCount = (tripId: string) =>
  call<{ tripId: string }, { open: number }>('openTripInviteLinks')({ tripId }).then((r) => r.open);
export const previewInvite = (token: string) => call<{ token: string }, InvitePreview>('previewTripInviteLink')({ token });
export const acceptInvite = (token: string) => call<{ token: string }, AcceptResult>('acceptTripInviteLink')({ token });
