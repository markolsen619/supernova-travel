import * as admin from 'firebase-admin';
import { randomBytes } from 'crypto';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { notifyUser } from './notify';
import { isBlockedBetween } from './moderationEvents';
import { publishableCover } from './tripPreviewFunction';
import {
  INVITE_TTL_MS, canCreateLink, firstName, formatTripDates, inviteMessage, inviteUrl, isToken, linkDecision,
  makeToken, platformFromUserAgent, renderJoinPage, tokenFromJoinPath, utcDay, type InviteLink,
} from './tripInviteLinks';

const db = admin.firestore();
const onTrip = (trip: FirebaseFirestore.DocumentData | undefined, uid: string) =>
  !!trip && (trip.authorUid === uid || (trip.collaborators ?? []).includes(uid));
const toDate = (v: unknown) => (v instanceof admin.firestore.Timestamp ? v.toDate() : null);

function newToken(): string {
  for (;;) { const t = makeToken(randomBytes(32)); if (t) return t; }
}

export const createTripInviteLink = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const tripId = (req.data as { tripId?: unknown })?.tripId;
  if (typeof tripId !== 'string' || !tripId) throw new HttpsError('invalid-argument', 'tripId is required');
  const [tripSnap, userSnap] = await Promise.all([db.doc(`trips/${tripId}`).get(), db.doc(`users/${uid}`).get()]);
  const trip = tripSnap.data();
  if (!onTrip(trip, uid)) throw new HttpsError('permission-denied', "You aren't on this trip");

  const now = Date.now();
  const token = newToken();
  const counterRef = db.doc(`usage_quotas/${uid}/inviteLinks/${utcDay(now)}`);
  await db.runTransaction(async (tx) => {
    const open = await tx.get(db.collection('tripInviteLinks')
      .where('tripId', '==', tripId).where('inviterUid', '==', uid).where('status', '==', 'open'));
    const openCount = open.docs.filter((d) => (d.data().expiresAtMs ?? 0) > now).length;
    const today = (await tx.get(counterRef)).data()?.count ?? 0;
    if (!canCreateLink(openCount, today)) throw new HttpsError('resource-exhausted', 'You have made a lot of invite links. Try again tomorrow.');
    tx.set(db.doc(`tripInviteLinks/${token}`), {
      tripId, inviterUid: uid, status: 'open', createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAtMs: now + INVITE_TTL_MS, usedBy: null, usedAt: null,
    });
    tx.set(counterRef, { count: today + 1 }, { merge: true });
  });
  const url = inviteUrl(token);
  const user = userSnap.data() ?? {};
  return { token, url, message: inviteMessage(firstName(user.fullName ?? user.displayName), String(trip?.title ?? 'a trip'), url) };
});

export const cancelTripInviteLinks = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const tripId = (req.data as { tripId?: unknown })?.tripId;
  if (typeof tripId !== 'string' || !tripId) throw new HttpsError('invalid-argument', 'tripId is required');
  const open = await db.collection('tripInviteLinks')
    .where('tripId', '==', tripId).where('inviterUid', '==', uid).where('status', '==', 'open').get();
  const batch = db.batch();
  open.docs.forEach((d) => batch.update(d.ref, { status: 'cancelled' }));
  await batch.commit();
  return { cancelled: open.size };
});

export const openTripInviteLinks = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const tripId = (req.data as { tripId?: unknown })?.tripId;
  if (typeof tripId !== 'string' || !tripId) throw new HttpsError('invalid-argument', 'tripId is required');
  const now = Date.now();
  const open = await db.collection('tripInviteLinks')
    .where('tripId', '==', tripId).where('inviterUid', '==', uid).where('status', '==', 'open').get();
  return { open: open.docs.filter((d) => (d.data().expiresAtMs ?? 0) > now).length };
});

/** Everything a decision needs, read once. */
async function loadInvite(token: string, callerUid: string) {
  const linkSnap = await db.doc(`tripInviteLinks/${token}`).get();
  const link = (linkSnap.data() as InviteLink | undefined) ?? null;
  const tripSnap = link ? await db.doc(`trips/${link.tripId}`).get() : null;
  const trip = tripSnap?.data();
  const inviter = link ? (await db.doc(`users/${link.inviterUid}`).get()).data() : undefined;
  const blocked = link && link.inviterUid !== callerUid ? await isBlockedBetween(link.inviterUid, callerUid) : false;
  const decision = linkDecision({
    link, nowMs: Date.now(), tripExists: !!trip, inviterOnTrip: !!link && onTrip(trip, link.inviterUid),
    callerUid, callerIsMember: onTrip(trip, callerUid), blocked,
  });
  return { link, trip, inviter, decision, inviterFirst: inviter ? firstName(inviter.fullName ?? inviter.displayName) : null };
}

export const previewTripInviteLink = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const token = (req.data as { token?: unknown })?.token;
  if (!isToken(token)) return { status: 'expired', inviterFirst: null };
  const { link, trip, decision, inviterFirst } = await loadInvite(token, uid);
  if (decision === 'member') return { status: 'member', tripId: link!.tripId };
  if (decision !== 'join') return { status: 'expired', inviterFirst };
  const cover = await publishableCover(link!.tripId, trip!.coverImageUrl);
  return {
    status: 'open', inviterFirst: inviterFirst ?? 'A friend', tripTitle: String(trip!.title ?? 'a trip'),
    dates: formatTripDates(toDate(trip!.startDate), toDate(trip!.endDate)), coverUrl: cover?.url ?? null,
    coverCredit: cover?.credit ?? null,
  };
});

export const acceptTripInviteLink = onCall({ region: 'us-central1' }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first');
  const token = (req.data as { token?: unknown })?.token;
  if (!isToken(token)) throw new HttpsError('invalid-argument', 'This invite link is not valid');
  const blockedCheck = await loadInvite(token, uid); // blocks need reads outside the transaction
  if (blockedCheck.decision === 'blocked') throw new HttpsError('permission-denied', "You can't join this trip");
  if (blockedCheck.decision === 'self') throw new HttpsError('invalid-argument', 'This is your own invite link');

  const linkRef = db.doc(`tripInviteLinks/${token}`);
  const result = await db.runTransaction(async (tx) => {
    const link = ((await tx.get(linkRef)).data() as InviteLink | undefined) ?? null;
    const tripRef = link ? db.doc(`trips/${link.tripId}`) : null;
    const trip = tripRef ? (await tx.get(tripRef)).data() : undefined;
    const decision = linkDecision({
      link, nowMs: Date.now(), tripExists: !!trip, inviterOnTrip: !!link && onTrip(trip, link.inviterUid),
      callerUid: uid, callerIsMember: onTrip(trip, uid), blocked: false,
    });
    if (decision === 'member') return { status: 'member' as const, tripId: link!.tripId, title: String(trip!.title ?? 'a trip'), inviterUid: link!.inviterUid };
    if (decision !== 'join') throw new HttpsError('failed-precondition', 'expired');
    tx.update(tripRef!, { collaborators: admin.firestore.FieldValue.arrayUnion(uid) });
    tx.set(tripRef!.collection('invites').doc(uid), {
      inviterUid: link!.inviterUid, status: 'accepted', via: 'link',
      createdAt: admin.firestore.FieldValue.serverTimestamp(), respondedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    tx.update(linkRef, { status: 'used', usedBy: uid, usedAt: admin.firestore.FieldValue.serverTimestamp() });
    return { status: 'joined' as const, tripId: link!.tripId, title: String(trip!.title ?? 'a trip'), inviterUid: link!.inviterUid };
  });

  if (result.status === 'joined') {
    const me = (await db.doc(`users/${uid}`).get()).data() ?? {};
    const name: string = me.fullName ?? me.displayName ?? 'A traveler';
    await notifyUser(result.inviterUid, {
      notification: { type: 'trip_invite_accepted', tripId: result.tripId, tripTitle: result.title, accepterUid: uid, accepterName: name, accepterAvatarUrl: me.avatarUrl ?? null },
      push: { title: 'Trip invite accepted', body: `${name} joined ${result.title}` },
    }).catch((e) => console.warn('acceptTripInviteLink notify failed', e));
  }
  return { status: result.status, tripId: result.tripId, inviterFirst: blockedCheck.inviterFirst ?? 'A friend', tripTitle: result.title };
});

/** Hosting `/join/**`: the invite when the app isn't installed. Never cached, so a used link reads as used at once. */
export const joinPage = onRequest({ region: 'us-central1', memory: '256MiB', maxInstances: 5 }, async (req, res) => {
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('Cache-Control', 'no-store');
  const token = tokenFromJoinPath(req.path);
  try {
    if (!token) { res.status(200).send(renderJoinPage(null, {})); return; }
    const link = ((await db.doc(`tripInviteLinks/${token}`).get()).data() as InviteLink | undefined) ?? null;
    const trip = link ? (await db.doc(`trips/${link.tripId}`).get()).data() : undefined;
    const inviter = link ? (await db.doc(`users/${link.inviterUid}`).get()).data() : undefined;
    const inviterFirst = inviter ? firstName(inviter.fullName ?? inviter.displayName) : null;
    const decision = linkDecision({
      link, nowMs: Date.now(), tripExists: !!trip, inviterOnTrip: !!link && onTrip(trip, link.inviterUid),
      callerUid: '', callerIsMember: false, blocked: false,
    });
    if (decision !== 'join') { res.status(200).send(renderJoinPage(null, { inviterFirst })); return; }
    const cover = await publishableCover(link!.tripId, trip!.coverImageUrl);
    res.status(200).send(renderJoinPage({
      token, inviterFirst: inviterFirst ?? 'A friend', tripTitle: String(trip!.title ?? 'a trip'),
      dates: formatTripDates(toDate(trip!.startDate), toDate(trip!.endDate)), coverUrl: cover?.url ?? null,
      coverCredit: cover?.credit ?? null,
    }, { platform: platformFromUserAgent(req.get('user-agent')) }));
  } catch (err) {
    console.error('joinPage failed', err);
    res.status(200).send(renderJoinPage(null, {}));
  }
});
