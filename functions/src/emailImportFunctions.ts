import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { simpleParser } from 'mailparser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  IMPORT_DOMAIN, MAX_BOOKINGS_PER_EMAIL, bookingsFromParse, dailyKey, emailPushCopy, gmailConfirmation,
  importGate, looksLikeBooking, newToken, signatureValid, tokenFromAddress, trimImportLog, type ImportStatus,
} from './emailImport';
import { buildExtractionPrompt } from './parseTravelConfirmation';
import { matchOne } from './bookingMatchFunctions';
import { hasAiConsent } from './aiConsent';
import { notifyUser } from './notify';

const db = admin.firestore();
const PDF_MAX = 5 * 1024 * 1024;

const isPaid = (u: Record<string, unknown> | undefined) => u?.tier === 'pro' || u?.tier === 'business';

/**
 * The address token and Gmail's code live here, not on users/{uid}: any
 * signed-in user can read a profile, and the token is the only thing
 * standing between a stranger and your wallet. Owner-read, server-write.
 */
const privateDoc = (uid: string) => db.doc(`users/${uid}/private/emailImport`);

async function log(uid: string, id: string, status: ImportStatus, subject: string, extra: Record<string, unknown> = {}) {
  const col = db.collection('users').doc(uid).collection('emailImports');
  await col.doc(id).set({ receivedAt: admin.firestore.FieldValue.serverTimestamp(), subject: subject.slice(0, 140), status, items: [], ...extra });
  const rows = await col.orderBy('receivedAt', 'desc').get();
  const stale = trimImportLog(rows.docs.map((d) => ({ id: d.id, receivedAt: d.data().receivedAt?.toMillis?.() ?? Date.now() })));
  await Promise.all(stale.map((s) => col.doc(s).delete()));
}

function emailPrompt(): string {
  return `${buildExtractionPrompt()}

This is a forwarded email and may hold several bookings (for example an outbound and a return flight, or a
hotel and a car). Return {"bookings": [ ... ]} where each entry is one object in exactly one of the two
formats above. At most ${MAX_BOOKINGS_PER_EMAIL}. If there is no booking at all, return {"bookings": []}.`;
}

/** Cloudflare's Email Worker posts every message for @supernovatravel.xyz here (cloudflare/email-inbound). */
export const inboundEmail = onRequest({ region: 'us-central1', maxInstances: 5, timeoutSeconds: 120, memory: '512MiB' }, async (req, res) => {
  const raw = req.rawBody;
  if (req.method !== 'POST' || !raw || !signatureValid(raw, req.get('X-Supernova-Signature'), process.env.INBOUND_EMAIL_SECRET ?? '')) {
    res.status(401).send('');
    return;
  }
  // From here on always 200: a retry would import twice.
  let uid: string | null = null;
  const importId = db.collection('_').doc().id;
  let subject = '';
  try {
    const { to, raw: mime } = req.body as { to?: string; raw?: string };
    const token = tokenFromAddress(to ?? '');
    const addr = token ? await db.doc(`inboundAddresses/${token}`).get() : null;
    if (!addr?.exists) { res.status(200).send(''); return; }
    uid = addr.data()!.uid as string;

    const mail = await simpleParser(Buffer.from(mime ?? '', 'base64'));
    subject = mail.subject ?? '';
    const from = mail.from?.text ?? '';
    const text = (mail.text ?? (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : '')).slice(0, 60_000);
    const pdfs = mail.attachments.filter((a) => a.contentType === 'application/pdf' && a.size <= PDF_MAX).slice(0, 2);

    const code = gmailConfirmation(from, subject, text);
    if (code) {
      await privateDoc(uid).set({ gmailForwardingCode: { code, at: admin.firestore.FieldValue.serverTimestamp() } }, { merge: true });
      await log(uid, importId, 'gmail_confirmation', subject);
      res.status(200).send('');
      return;
    }

    const user = (await db.doc(`users/${uid}`).get()).data();
    const key = dailyKey(new Date());
    const usedToday = ((await db.doc(`usage_quotas/${uid}`).get()).data() ?? {})[key] ?? 0;
    const gate = importGate({ paid: isPaid(user), consent: hasAiConsent(user), usedToday, looksLikeBooking: looksLikeBooking(subject, text, pdfs.length > 0) });
    if (gate !== 'parse') { await log(uid, importId, gate, subject); res.status(200).send(''); return; }

    await db.doc(`usage_quotas/${uid}`).set({ [key]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '').getGenerativeModel({ model: 'gemini-2.5-flash' });
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
      { text: emailPrompt() },
      { text: `Subject: ${subject}\n\n${text}` },
      ...pdfs.map((p) => ({ inlineData: { mimeType: 'application/pdf', data: p.content.toString('base64') } })),
    ];
    const out = (await model.generateContent(parts)).response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(out.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim()); } catch { parsed = null; }
    const docs = bookingsFromParse(parsed, { uid, emailImportId: importId, nowIso: new Date().toISOString() });
    if (docs.length === 0) { await log(uid, importId, 'unreadable', subject); res.status(200).send(''); return; }

    // One batch: either every booking from this email is saved, or none is.
    const batch = db.batch();
    const refs = docs.map((d) => { const ref = db.collection(d.collection).doc(); batch.set(ref, d.data); return { ref, d }; });
    await batch.commit();

    let linkedTrip: string | null = null;
    let asked = false;
    for (const { ref, d } of refs) {
      const r = await matchOne(uid, d.collection === 'boarding_passes' ? 'boarding_pass' : 'reservation', ref.id);
      if (r.kind === 'link') linkedTrip = linkedTrip ?? r.trip.title;
      if (r.kind === 'ask') asked = true;
    }
    const items = refs.map(({ ref, d }) => ({ kind: d.collection === 'boarding_passes' ? 'boarding_pass' : 'reservation', id: ref.id, title: d.title }));
    await log(uid, importId, 'imported', subject, { items, ...(linkedTrip ? { tripTitle: linkedTrip } : {}) });

    const copy = emailPushCopy(items, linkedTrip, asked);
    const single = items.length === 1 ? items[0] : null;
    await notifyUser(uid, {
      notification: single
        ? (single.kind === 'boarding_pass'
          ? { type: 'email_import_pass', passId: single.id, title: copy.title, body: copy.body }
          : { type: 'email_import_reservation', reservationId: single.id, title: copy.title, body: copy.body })
        : { type: 'email_import_batch', emailImportId: importId, title: copy.title, body: copy.body },
      push: copy,
    });
    res.status(200).send('');
  } catch (err) {
    console.error('inboundEmail failed', err);
    if (uid) await log(uid, importId, 'unreadable', subject).catch(() => undefined);
    res.status(200).send('');
  }
});

async function requireProUser(uid: string) {
  const user = (await db.doc(`users/${uid}`).get()).data();
  if (!isPaid(user)) throw new HttpsError('permission-denied', 'Email import is a Pro feature.');
  return user;
}

async function issueAddress(uid: string): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const token = newToken();
    const ref = db.doc(`inboundAddresses/${token}`);
    try {
      await ref.create({ uid, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      await privateDoc(uid).set({ token, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      return `${token}@${IMPORT_DOMAIN}`;
    } catch (err) {
      if ((err as { code?: number }).code !== 6) throw err; // ALREADY_EXISTS → try another token
    }
  }
  throw new HttpsError('internal', 'Could not create an address. Try again.');
}

export const createImportAddress = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const user = await requireProUser(request.auth.uid);
  if (!hasAiConsent(user)) throw new HttpsError('failed-precondition', 'Allow AI import first.');
  const existing = (await privateDoc(request.auth.uid).get()).data()?.token;
  if (typeof existing === 'string') return { address: `${existing}@${IMPORT_DOMAIN}` };
  return { address: await issueAddress(request.auth.uid) };
});

export const rotateImportAddress = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const uid = request.auth.uid;
  await requireProUser(uid);
  const old = (await privateDoc(uid).get()).data()?.token;
  // The old address stops working before the new one exists.
  if (typeof old === 'string') await db.doc(`inboundAddresses/${old}`).delete();
  await privateDoc(uid).set({ gmailForwardingCode: admin.firestore.FieldValue.delete() }, { merge: true });
  return { address: await issueAddress(uid) };
});
