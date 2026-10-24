/** Google Wallet boarding passes (spec 2026-10-23-google-wallet-pass-design.md): the owner's save link. */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import type { PassInput } from './applePass';
import { genericObject, googleObjectId, saveJwtClaims } from './googlePass';
import { ensureClass, signSaveJwt } from './googleWalletApi';

const db = admin.firestore();

export const googleWalletJwt = onCall({ region: 'us-central1', invoker: 'public' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const data = (request.data ?? {}) as { passId?: unknown; timeZone?: unknown };
  if (typeof data.passId !== 'string' || !googleObjectId(data.passId)) throw new HttpsError('invalid-argument', 'passId is required');
  const timeZone = typeof data.timeZone === 'string' && data.timeZone.length <= 64 ? data.timeZone : null;
  const ref = db.doc(`boarding_passes/${data.passId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such boarding pass');
  if (snap.get('ownerUid') !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your boarding pass');
  try {
    await ensureClass();
    const object = genericObject({ id: snap.id, ...(snap.data() as Omit<PassInput, 'id'>) }, timeZone);
    const jwt = await signSaveJwt(saveJwtClaims(object, Math.floor(Date.now() / 1000)));
    await ref.update({ walletTimeZone: timeZone, googleWalletObject: true });
    return { jwt };
  } catch (e) {
    console.error('[googleWalletJwt] failed', (e as Error).message);
    throw new HttpsError('unavailable', 'Could not prepare the pass');
  }
});
