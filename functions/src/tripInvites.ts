import * as functions from 'firebase-functions/v2';
import { isPaidTier } from './flightPolling';
import * as admin from 'firebase-admin';
import { notifyUser } from './notify';
import { isBlockedBetween } from './moderationEvents';

const db = admin.firestore();

interface InviteToTripRequest {
  tripId: string;
  inviteeUid: string;
}

interface RespondToTripInviteRequest {
  tripId: string;
  accept: boolean;
}

/** Trip owner or existing collaborator — mirrors firestore.rules'
 * canWriteTrip() on the trips collection, re-derived here since Admin SDK
 * reads bypass rules entirely. */
function canManageTrip(tripData: FirebaseFirestore.DocumentData, uid: string): boolean {
  return tripData.authorUid === uid || (tripData.collaborators ?? []).includes(uid);
}

/**
 * Sends (or re-sends, after a prior decline) a trip invite. Idempotent for
 * an already-pending or already-accepted invite — no duplicate notification
 * spam if the inviter taps twice or a race lands two calls.
 */
export const inviteToTrip = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const inviterUid = request.auth.uid;
    const { tripId, inviteeUid } = request.data as InviteToTripRequest;
    if (!tripId || !inviteeUid) {
      throw new functions.https.HttpsError('invalid-argument', 'tripId and inviteeUid are required');
    }
    if (inviteeUid === inviterUid) {
      throw new functions.https.HttpsError('invalid-argument', "Can't invite yourself");
    }

    if (await isBlockedBetween(inviterUid, inviteeUid)) {
      throw new functions.https.HttpsError('permission-denied', "You can't invite this person");
    }

    const tripRef = db.doc(`trips/${tripId}`);
    const tripSnap = await tripRef.get();
    if (!tripSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Trip not found');
    }
    const trip = tripSnap.data()!;
    if (!canManageTrip(trip, inviterUid)) {
      throw new functions.https.HttpsError('permission-denied', "You aren't on this trip");
    }

    // Travelling together — and with it the shared packing list and shared
    // budget, which only exist once a trip has collaborators — is a paid
    // feature. Enforced here rather than only in the UI: the callable is the
    // sole way a collaborator is ever added (firestore.rules keeps
    // trips/{id}/invites write-closed), so this is the real boundary.
    //
    // Checked on the INVITER only. Being invited is free: a paid user
    // bringing friends along should not require those friends to subscribe,
    // or the feature sells nothing.
    const inviterDoc = await db.doc(`users/${inviterUid}`).get();
    if (!isPaidTier(inviterDoc.data()?.tier)) {
      throw new functions.https.HttpsError(
        'permission-denied',
        'Sharing a trip is a Pro feature. Upgrade to plan together, split a budget and share a packing list.',
      );
    }
    if ((trip.collaborators ?? []).includes(inviteeUid)) {
      return { status: 'already_member' as const };
    }

    const inviteRef = tripRef.collection('invites').doc(inviteeUid);
    const inviteSnap = await inviteRef.get();
    const existingStatus = inviteSnap.data()?.status;
    if (existingStatus === 'pending' || existingStatus === 'accepted') {
      return { status: existingStatus as 'pending' | 'accepted' };
    }

    // Reuses the document already read for the tier gate above — the inviter
    // cannot have changed between the two.
    const inviterData = inviterDoc.data() ?? {};
    const inviterName: string = inviterData.fullName ?? inviterData.displayName ?? 'A traveler';
    const inviterAvatarUrl: string | null = inviterData.avatarUrl ?? null;

    await inviteRef.set({
      inviterUid,
      status: 'pending',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      respondedAt: null,
    });

    await notifyUser(inviteeUid, {
      notification: {
        type: 'trip_invite',
        tripId,
        tripTitle: trip.title ?? 'a trip',
        inviterUid,
        inviterName,
        inviterAvatarUrl,
      },
      push: {
        title: 'Trip invite',
        body: `${inviterName} invited you to ${trip.title ?? 'a trip'}`,
      },
    });

    return { status: 'pending' as const };
  }
);

/**
 * Accept/decline your own pending invite. Runs as Admin SDK specifically so
 * accept can safely mutate the parent trip's collaborators[] — a client-side
 * rule can't let a non-collaborator add themselves without opening the same
 * door to anyone forging a collaborators write.
 */
export const respondToTripInvite = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request) => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const uid = request.auth.uid;
    const { tripId, accept } = request.data as RespondToTripInviteRequest;
    if (!tripId || typeof accept !== 'boolean') {
      throw new functions.https.HttpsError('invalid-argument', 'tripId and accept are required');
    }

    const tripRef = db.doc(`trips/${tripId}`);
    const inviteRef = tripRef.collection('invites').doc(uid);
    const inviteSnap = await inviteRef.get();
    if (!inviteSnap.exists || inviteSnap.data()?.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'No pending invite for this trip');
    }
    const invite = inviteSnap.data()!;

    await inviteRef.update({
      status: accept ? 'accepted' : 'declined',
      respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (!accept) {
      return { status: 'declined' as const };
    }

    await tripRef.update({
      collaborators: admin.firestore.FieldValue.arrayUnion(uid),
    });

    const [tripSnap, accepterDoc] = await Promise.all([tripRef.get(), db.doc(`users/${uid}`).get()]);
    const tripTitle: string = tripSnap.data()?.title ?? 'a trip';
    const accepterData = accepterDoc.data() ?? {};
    const accepterName: string = accepterData.fullName ?? accepterData.displayName ?? 'A traveler';
    const accepterAvatarUrl: string | null = accepterData.avatarUrl ?? null;

    await notifyUser(invite.inviterUid, {
      notification: {
        type: 'trip_invite_accepted',
        tripId,
        tripTitle,
        accepterUid: uid,
        accepterName,
        accepterAvatarUrl,
      },
      push: {
        title: 'Trip invite accepted',
        body: `${accepterName} joined ${tripTitle}`,
      },
    });

    return { status: 'accepted' as const };
  }
);
