import * as admin from 'firebase-admin';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { sendPushNotification } from './notify';

const db = admin.firestore();

/**
 * Fires on every new DM message. Updates the parent thread's denormalized
 * lastMessage* fields (the client can't — see firestore.rules `dmThreads`
 * update: if false) and pushes every other participant. Deliberately does
 * NOT write a users/{uid}/notifications doc: the Messages tab itself, read
 * via lastMessageAt vs. the recipient's own read cursor, is the
 * notification for DMs (see the design spec's "DM notification delivery"
 * decision).
 */
export const onMessageCreated = onDocumentCreated(
  'dmThreads/{threadId}/messages/{messageId}',
  async (event) => {
    const snap = event.data;
    if (!snap) return;
    const { threadId } = event.params;
    const message = snap.data();

    const threadRef = db.doc(`dmThreads/${threadId}`);
    const threadSnap = await threadRef.get();
    if (!threadSnap.exists) return;
    const thread = threadSnap.data()!;

    await threadRef.update({
      lastMessageText: message.text,
      lastMessageAt: message.createdAt,
      lastMessageSenderUid: message.senderUid,
    });

    const recipients: string[] = (thread.participants ?? []).filter(
      (uid: string) => uid !== message.senderUid,
    );
    if (recipients.length === 0) return;

    const senderDoc = await db.doc(`users/${message.senderUid}`).get();
    const senderData = senderDoc.data() ?? {};
    const senderName: string = senderData.fullName ?? senderData.displayName ?? 'Someone';

    const tokenLists = await Promise.all(
      recipients.map(async (uid) => {
        const userDoc = await db.doc(`users/${uid}`).get();
        return (userDoc.data()?.expoPushTokens ?? []) as string[];
      }),
    );
    const tokens = tokenLists.flat();
    if (tokens.length === 0) return;

    const text: string = message.text ?? '';
    const preview = text.length > 80 ? `${text.slice(0, 80)}…` : text;
    await sendPushNotification(tokens, senderName, preview);
  },
);
