/**
 * Apple Wallet boarding passes (spec 2026-10-22): a callable mints a 5-minute link for the owner's pass; the HTTPS
 * function behind /wallet/apple/** verifies it, re-checks ownership and serves a freshly signed .pkpass.
 */
import * as admin from 'firebase-admin';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import type { PassInput } from './applePass';
import { buildSignedPass } from './applePassSign';
import { signWalletToken, verifyWalletToken, walletAuthToken, walletTokenFromPath } from './walletLink';
import { WALLET_SERVICE_URL } from './appleWalletService';

export const PASSKIT_KEY = defineSecret('PASSKIT_KEY');
export const PASSKIT_CERT = defineSecret('PASSKIT_CERT');
export const PASSKIT_WWDR = defineSecret('PASSKIT_WWDR');
export const WALLET_LINK_SECRET = defineSecret('WALLET_LINK_SECRET');

const db = admin.firestore();
const HOST = 'https://supernova-a2125.web.app';

export const appleWalletLink = onCall({ region: 'us-central1', secrets: [WALLET_LINK_SECRET] }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const passId = (request.data as { passId?: unknown } | undefined)?.passId;
  if (typeof passId !== 'string' || !passId) throw new HttpsError('invalid-argument', 'passId is required');
  const snap = await db.doc(`boarding_passes/${passId}`).get();
  if (!snap.exists) throw new HttpsError('not-found', 'No such boarding pass');
  if (snap.get('ownerUid') !== request.auth.uid) throw new HttpsError('permission-denied', 'Not your boarding pass');
  const token = signWalletToken({ passId, uid: request.auth.uid }, WALLET_LINK_SECRET.value(), Date.now());
  return { url: `${HOST}/wallet/apple/${token}.pkpass` };
});

export const appleWalletPass = onRequest(
  { region: 'us-central1', secrets: [PASSKIT_KEY, PASSKIT_CERT, PASSKIT_WWDR, WALLET_LINK_SECRET] },
  async (req, res) => {
    const token = req.method === 'GET' || req.method === 'HEAD' ? walletTokenFromPath(req.path) : null;
    const claim = token ? verifyWalletToken(token, WALLET_LINK_SECRET.value(), Date.now()) : null;
    const snap = claim ? await db.doc(`boarding_passes/${claim.passId}`).get() : null;
    // Ownership is re-read here too: a valid link for a pass that changed hands (or was deleted) gets nothing.
    if (!claim || !snap?.exists || snap.get('ownerUid') !== claim.uid) { res.status(404).send(''); return; }
    try {
      const file = buildSignedPass({ id: snap.id, ...(snap.data() as Omit<PassInput, 'id'>) }, {
        signerKey: PASSKIT_KEY.value(), signerCert: PASSKIT_CERT.value(), wwdr: PASSKIT_WWDR.value(),
      }, undefined, { webServiceURL: WALLET_SERVICE_URL, authenticationToken: walletAuthToken(`bp-${snap.id}`, WALLET_LINK_SECRET.value()) });
      res.set('Content-Type', 'application/vnd.apple.pkpass');
      res.set('Content-Disposition', 'attachment; filename="boarding-pass.pkpass"');
      res.set('Cache-Control', 'no-store');
      res.status(200).send(file);
    } catch (e) {
      console.error('[appleWalletPass] signing failed:', (e as Error).message);
      res.status(500).send('');
    }
  },
);
