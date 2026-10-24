/**
 * Apple Wallet live passes (spec 2026-10-23 §3). appleWalletService is the PassKit web service Wallet calls
 * (registrations, "what changed", the latest pass, logs); onBoardingPassWrittenWallet stamps walletUpdatedAtMs and
 * pushes Wallet when a field shown on the pass changes (and PATCHes the Google Wallet copy — googlePass.ts; Apple and Google
 * run independently, a Google failure never stops the Apple push). Registrations live at
 * appleWalletRegistrations/{device}__{serial} (server only; removed with the pass and by deleteAccount).
 */
import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { PASS_TYPE_ID, type PassInput } from './applePass';
import { buildSignedPass } from './applePassSign';
import { walletAuthToken } from './walletLink';
import { pushPassUpdates } from './apns';
import { genericObject, googleObjectId, inactiveObject } from './googlePass';
import { putObject } from './googleWalletApi';
import { PASSKIT_CERT, PASSKIT_KEY, PASSKIT_WWDR, WALLET_LINK_SECRET } from './appleWalletFunctions';
import { parseWalletServicePath, passIdFromSerial, serialsUpdatedSince, tokenFromAuthHeader, walletFieldsChanged, WALLET_SERVICE_URL } from './appleWalletService';

const db = admin.firestore();
const REGS = 'appleWalletRegistrations';

export const appleWalletService = onRequest(
  { region: 'us-central1', invoker: 'public', secrets: [PASSKIT_KEY, PASSKIT_CERT, PASSKIT_WWDR, WALLET_LINK_SECRET] },
  async (req, res) => {
    const route = parseWalletServicePath(req.method, req.path);
    if (!route) { res.status(404).send(''); return; }
    if (route.kind === 'log') { console.log('[appleWalletService] wallet log', JSON.stringify(req.body?.logs ?? []).slice(0, 2000)); res.status(200).send(''); return; }
    if (route.passType !== PASS_TYPE_ID) { res.status(401).send(''); return; }

    if (route.kind === 'serials') {
      const regs = await db.collection(REGS).where('device', '==', route.device).get();
      const ids = regs.docs.map((d) => passIdFromSerial(String(d.get('serial')))).filter((x): x is string => !!x);
      const passes = ids.length ? await db.getAll(...ids.map((id) => db.doc(`boarding_passes/${id}`))) : [];
      const rows = passes.filter((p) => p.exists).map((p) => ({ serial: `bp-${p.id}`, updatedAtMs: Number(p.get('walletUpdatedAtMs') ?? 0) }));
      const answer = serialsUpdatedSince(rows, typeof req.query.passesUpdatedSince === 'string' ? req.query.passesUpdatedSince : undefined);
      if (!answer) { res.status(204).send(''); return; }
      res.status(200).json(answer); return;
    }

    // Every other route is about one pass and carries its token.
    const passId = passIdFromSerial(route.serial);
    const token = tokenFromAuthHeader(req.get('Authorization'));
    if (!passId || !token || token !== walletAuthToken(route.serial, WALLET_LINK_SECRET.value())) { res.status(401).send(''); return; }
    const snap = await db.doc(`boarding_passes/${passId}`).get();
    const regRef = (device: string) => db.doc(`${REGS}/${device}__${route.serial}`);

    if (route.kind === 'unregister') { await regRef(route.device).delete(); res.status(200).send(''); return; }
    if (!snap.exists) { res.status(401).send(''); return; }

    if (route.kind === 'register') {
      const pushToken = typeof req.body?.pushToken === 'string' ? req.body.pushToken : null;
      if (!pushToken) { res.status(400).send(''); return; }
      const ref = regRef(route.device);
      const existed = (await ref.get()).exists;
      await ref.set({ device: route.device, pushToken, serial: route.serial, passId, ownerUid: snap.get('ownerUid'), updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      res.status(existed ? 200 : 201).send(''); return;
    }

    // route.kind === 'pass': the latest copy, or 304 when Wallet already has it.
    const updatedMs = Number(snap.get('walletUpdatedAtMs') ?? snap.updateTime?.toMillis() ?? Date.now());
    const lastModified = new Date(Math.floor(updatedMs / 1000) * 1000);
    const since = Date.parse(req.get('If-Modified-Since') ?? '');
    if (Number.isFinite(since) && since >= lastModified.getTime()) { res.status(304).send(''); return; }
    try {
      const file = buildSignedPass({ id: snap.id, ...(snap.data() as Omit<PassInput, 'id'>) },
        { signerKey: PASSKIT_KEY.value(), signerCert: PASSKIT_CERT.value(), wwdr: PASSKIT_WWDR.value() },
        undefined, { webServiceURL: WALLET_SERVICE_URL, authenticationToken: token });
      res.set('Content-Type', 'application/vnd.apple.pkpass');
      res.set('Last-Modified', lastModified.toUTCString());
      res.set('Cache-Control', 'no-store');
      res.status(200).send(file);
    } catch (e) {
      console.error('[appleWalletService] signing failed:', (e as Error).message);
      res.status(500).send('');
    }
  },
);

export const onBoardingPassWrittenWallet = onDocumentWritten(
  { document: 'boarding_passes/{passId}', region: 'us-central1', secrets: [PASSKIT_KEY, PASSKIT_CERT] },
  async (event) => {
    const serial = `bp-${event.params.passId}`;
    const before = event.data?.before.data() ?? null;
    const after = event.data?.after.data() ?? null;
    const googleId = googleObjectId(event.params.passId);
    const google = async (object: Record<string, unknown>) => {
      if (!googleId || !(before?.googleWalletObject || after?.googleWalletObject)) return;
      try { await putObject(googleId, object); } catch (e) { console.warn('[googleWallet] update failed', (e as Error).message); }
    };
    const apple = async (deleted: boolean) => {
      const regs = await db.collection(REGS).where('serial', '==', serial).get();
      if (deleted) { await Promise.all(regs.docs.map((d) => d.ref.delete())); return; }
      if (regs.empty) return;
      const gone = await pushPassUpdates(regs.docs.map((d) => String(d.get('pushToken'))), { cert: PASSKIT_CERT.value(), key: PASSKIT_KEY.value() });
      await Promise.all(regs.docs.filter((d) => gone.includes(String(d.get('pushToken')))).map((d) => d.ref.delete()));
    };
    // Apple and Google side by side: one slow or failing never delays or stops the other.
    if (!after) {
      await Promise.allSettled([apple(true), google(inactiveObject(event.params.passId))]);
      return;
    }
    if (!walletFieldsChanged(before, after)) return;
    await event.data!.after.ref.update({ walletUpdatedAtMs: Date.now() });
    const results = await Promise.allSettled([
      apple(false),
      google(genericObject({ id: event.params.passId, ...(after as Omit<PassInput, 'id'>) }, (after.walletTimeZone as string | null) ?? null)),
    ]);
    for (const r of results) if (r.status === 'rejected') console.warn('[wallet] update failed', (r.reason as Error)?.message);
  },
);
