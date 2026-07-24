import * as functions from 'firebase-functions/v2';
import * as admin from 'firebase-admin';

const db = admin.firestore();

const MAX_GROUP_SIZE = 12;

interface CreateDmThreadRequest {
  participantUids: string[]; // the OTHER participants — caller is added automatically
}

interface CreateDmThreadResult {
  threadId: string;
  isNew: boolean;
}

/** `${uidA}_${uidB}` sorted alphabetically — mirrors utils/dm.ts's
 * sortedPairId() on the client. Deterministic so a 1:1 thread can never be
 * duplicated by tapping "Message" twice. */
function sortedPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

async function isMutualFriend(uidA: string, uidB: string): Promise<boolean> {
  const [aFollowsB, bFollowsA] = await Promise.all([
    db.doc(`follows/${uidA}_${uidB}`).get(),
    db.doc(`follows/${uidB}_${uidA}`).get(),
  ]);
  return aFollowsB.exists && bFollowsA.exists;
}

/**
 * Creates (or, for a 1:1 pair, resolves the existing) DM thread. Friendship
 * validation against a variable-length participants array can't be
 * expressed in firestore.rules (no loop/forall over an array), so thread
 * creation is Admin-SDK-only — see firestore.rules `dmThreads` create/update:
 * if false.
 */
export const createDmThread = functions.https.onCall(
  { region: 'us-central1', enforceAppCheck: false },
  async (request): Promise<CreateDmThreadResult> => {
    if (!request.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be signed in');
    }
    const callerUid = request.auth.uid;
    const { participantUids } = request.data as CreateDmThreadRequest;

    if (!Array.isArray(participantUids) || participantUids.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', 'participantUids is required');
    }
    const others = Array.from(new Set(participantUids.filter((uid) => uid !== callerUid)));
    if (others.length === 0) {
      throw new functions.https.HttpsError('invalid-argument', "Can't start a thread with only yourself");
    }
    const participants = [callerUid, ...others];
    if (participants.length > MAX_GROUP_SIZE) {
      throw new functions.https.HttpsError('invalid-argument', `Groups are limited to ${MAX_GROUP_SIZE} people`);
    }

    const friendChecks = await Promise.all(others.map((uid) => isMutualFriend(callerUid, uid)));
    if (friendChecks.some((isFriend) => !isFriend)) {
      throw new functions.https.HttpsError('permission-denied', 'You can only message mutual friends');
    }

    const isDirect = participants.length === 2;
    const threadId = isDirect
      ? sortedPairId(participants[0], participants[1])
      : db.collection('dmThreads').doc().id;
    const threadRef = db.doc(`dmThreads/${threadId}`);

    if (isDirect) {
      const existing = await threadRef.get();
      if (existing.exists) {
        return { threadId, isNew: false };
      }
    }

    await threadRef.set({
      type: isDirect ? 'direct' : 'group',
      participants,
      createdByUid: callerUid,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      lastMessageText: null,
      lastMessageAt: null,
      lastMessageSenderUid: null,
    });

    return { threadId, isNew: true };
  },
);
