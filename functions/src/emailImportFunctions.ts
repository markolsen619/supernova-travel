import * as admin from 'firebase-admin';
import { onRequest } from 'firebase-functions/v2/https';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { simpleParser } from 'mailparser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  IMPORT_DOMAIN, IMPORT_LOG_KEEP, MAX_BOOKINGS_PER_EMAIL, bookingsFromParse, importIdFor, dailyKey, emailPushCopy, gmailConfirmation, gmailConfirmationLink,
  importGate, looksLikeBooking, newToken, signatureValid, tokenFromAddress, trimImportLog, type ImportStatus,
} from './emailImport';
import { buildExtractionPrompt } from './parseTravelConfirmation';
import { loyaltyFromParse, loyaltyPushCopy, mixedPushCopy, loyaltyWrite, looksLikeLoyalty, matchLoyalty, MAX_LOYALTY_PER_EMAIL } from './loyaltyImport';
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
  const rows = await col.orderBy('receivedAt', 'desc').limit(IMPORT_LOG_KEEP + 10).get();
  const stale = trimImportLog(rows.docs.map((d) => ({ id: d.id, receivedAt: d.data().receivedAt?.toMillis?.() ?? Date.now() })));
  await Promise.all(stale.map((s) => col.doc(s).delete()));
}

function emailPrompt(): string {
  return `${buildExtractionPrompt()}

This is a forwarded email and may hold several bookings (for example an outbound and a return flight, or a
hotel and a car). Return {"bookings": [ ... ]} where each entry is one object in exactly one of the two
formats above. At most ${MAX_BOOKINGS_PER_EMAIL}.
This replaces the rule above about returning an empty "activity" reservation: if the email is not a confirmed
booking — a newsletter, an offer or deal, a price alert, a receipt for something that isn't travel — return
{"bookings": []}. Never invent a booking from an advertisement.

A rewards-program statement or account summary (an airline, hotel, car rental or credit card loyalty program
showing the member's CURRENT balance) is also an entry, in this third format:
{"kind": "loyalty", "fields": {"programName": "Delta SkyMiles", "programType": "airline|hotel|car_rental|credit_card|other",
"memberNumber": "as printed, keep any masking like ****1234, or null", "balance": 45210,
"unit": "miles|points|nights|segments", "tier": "standard|silver|gold|platinum|diamond or null",
"expiryDate": "YYYY-MM-DD or null", "statementDate": "YYYY-MM-DD the balance is as of, or null"}}
At most ${MAX_LOYALTY_PER_EMAIL}. Only when the email states the member's own balance — never for a promotion,
a "earn bonus points" offer, or a points estimate for a booking.`;
}

/** Cloudflare's Email Worker posts every message for @supernovatravel.xyz here (cloudflare/email-inbound). */
/**
 * Today's count, checked and counted in one transaction so a burst of
 * emails can't all read "under the cap" before any of them counts.
 */
async function claimDailyImport(uid: string, decide: (usedToday: number) => ImportStatus | 'parse'): Promise<ImportStatus | 'parse'> {
  const ref = db.doc(`usage_quotas/${uid}`);
  const key = dailyKey(new Date());
  return db.runTransaction(async (tx) => {
    const used = ((await tx.get(ref)).data() ?? {})[key] ?? 0;
    const gate = decide(used);
    if (gate === 'parse') tx.set(ref, { [key]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    return gate;
  });
}

/** Every live address this person has (normally one) — rotate and account deletion end them all. */
export async function addressesOf(uid: string) {
  return (await db.collection('inboundAddresses').where('uid', '==', uid).get()).docs;
}

// Low concurrency and 1 GiB: one 10 MB email peaks around 70 MB in flight, and
// an out-of-memory crash would kill every request sharing the instance.
export const inboundEmail = onRequest({ region: 'us-central1', maxInstances: 5, concurrency: 4, timeoutSeconds: 120, memory: '1GiB' }, async (req, res) => {
  const raw = req.rawBody;
  if (req.method !== 'POST' || !raw || !signatureValid(raw, req.get('X-Supernova-Signature'), process.env.INBOUND_EMAIL_SECRET ?? '')) {
    res.status(401).send('');
    return;
  }
  // From here on always 200: a retry would import twice.
  let uid: string | null = null;
  let importId = '';
  let subject = '';
  let committed = false;
  try {
    const { to, raw: mime } = req.body as { to?: string; raw?: string };
    const token = tokenFromAddress(to ?? '');
    const addr = token ? await db.doc(`inboundAddresses/${token}`).get() : null;
    if (!addr?.exists) { res.status(200).send(''); return; }
    uid = addr.data()!.uid as string;

    const rawMime = Buffer.from(mime ?? '', 'base64');
    const mail = await simpleParser(rawMime);
    subject = mail.subject ?? '';
    // Claim this message once: a redelivery or a second forward of the same email stops here.
    importId = importIdFor(uid, mail.messageId, rawMime);
    try {
      await db.collection('users').doc(uid).collection('emailImports').doc(importId)
        .create({ receivedAt: admin.firestore.FieldValue.serverTimestamp(), subject: subject.slice(0, 140), status: 'processing', items: [] });
    } catch (err) {
      if ((err as { code?: number }).code === 6) { res.status(200).send(''); return; }
      throw err;
    }
    const from = mail.from?.text ?? '';
    const text = (mail.text ?? (typeof mail.html === 'string' ? mail.html.replace(/<[^>]+>/g, ' ') : '')).slice(0, 60_000);
    const pdfs = mail.attachments.filter((a) => a.contentType === 'application/pdf' && a.size <= PDF_MAX).slice(0, 2);

    const code = gmailConfirmation(from, subject, text);
    if (code) {
      // The link is what confirms forwarding now; the code is kept for older Gmail flows.
      const link = gmailConfirmationLink(text);
      await privateDoc(uid).set({
        gmailForwardingCode: { code, at: admin.firestore.FieldValue.serverTimestamp(), ...(link ? { link } : {}) },
      }, { merge: true });
      await log(uid, importId, 'gmail_confirmation', subject);
      res.status(200).send('');
      return;
    }

    const user = (await db.doc(`users/${uid}`).get()).data();
    const looks = looksLikeBooking(subject, text, pdfs.length > 0) || looksLikeLoyalty(subject, text);
    const gate = await claimDailyImport(uid, (usedToday) =>
      importGate({ paid: isPaid(user), consent: hasAiConsent(user), usedToday, looksLikeBooking: looks }));
    if (gate !== 'parse') { await log(uid, importId, gate, subject); res.status(200).send(''); return; }

    const model = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '').getGenerativeModel({
      model: 'gemini-2.5-flash',
      generationConfig: { responseMimeType: 'application/json' },
    });
    const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [
      { text: emailPrompt() },
      { text: `Subject: ${subject}\n\n${text}` },
      ...pdfs.map((p) => ({ inlineData: { mimeType: 'application/pdf', data: p.content.toString('base64') } })),
    ];
    // Under the function's 120 s, so a slow answer still ends in a log row.
    const out = (await model.generateContent(parts, { timeout: 90_000 })).response.text();
    let parsed: unknown = null;
    try { parsed = JSON.parse(out.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim()); } catch { parsed = null; }
    const ctx = { uid, emailImportId: importId, nowIso: new Date().toISOString() };
    const docs = bookingsFromParse(parsed, ctx);
    const statements = loyaltyFromParse(parsed);
    if (docs.length === 0 && statements.length === 0) { await log(uid, importId, 'unreadable', subject); res.status(200).send(''); return; }

    // One batch: either everything from this email is saved, or none of it is.
    const batch = db.batch();
    const refs = docs.map((d) => { const ref = db.collection(d.collection).doc(); batch.set(ref, d.data); return { ref, d }; });
    const loyalty: { id: string; title: string; push: { title: string; body: string } }[] = [];
    if (statements.length) {
      const programs = (await db.collection('loyalty_programs').where('ownerUid', '==', uid).get()).docs;
      const rows = programs.map((d) => ({ id: d.id, ...(d.data() as { programName?: string; memberNumber?: string; balanceAsOf?: string }) }));
      for (const u of statements) {
        const matchId = matchLoyalty(u, rows);
        const existing = matchId ? rows.find((r) => r.id === matchId)! : null;
        const write = loyaltyWrite(u, existing, ctx);
        if (!write) continue; // an older statement than the balance on file
        const ref = write.create ? db.collection('loyalty_programs').doc() : db.doc(`loyalty_programs/${matchId}`);
        if (write.create) batch.set(ref, write.data); else batch.update(ref, write.data);
        const push = loyaltyPushCopy(u);
        loyalty.push({ id: ref.id, title: push.body, push });
      }
    }
    if (refs.length === 0 && loyalty.length === 0) {
      // Only statements older than what's already saved: nothing to change.
      await log(uid, importId, 'imported', subject, { items: [] });
      res.status(200).send('');
      return;
    }
    await batch.commit();
    committed = true;

    let linkedTrip: string | null = null;
    let asked = false;
    for (const { ref, d } of refs) {
      const r = await matchOne(uid, d.collection === 'boarding_passes' ? 'boarding_pass' : 'reservation', ref.id);
      if (r.kind === 'link') linkedTrip = linkedTrip ?? r.trip.title;
      if (r.kind === 'ask') asked = true;
    }
    const items = [
      ...refs.map(({ ref, d }) => ({ kind: d.collection === 'boarding_passes' ? 'boarding_pass' : 'reservation', id: ref.id, title: d.title })),
      ...loyalty.map((l) => ({ kind: 'loyalty', id: l.id, title: l.title })),
    ];
    await log(uid, importId, 'imported', subject, { items, ...(linkedTrip ? { tripTitle: linkedTrip } : {}) });

    if (refs.length === 0 && loyalty.length === 1) {
      await notifyUser(uid, {
        notification: { type: 'email_import_loyalty', programId: loyalty[0].id, ...loyalty[0].push },
        push: loyalty[0].push,
      });
      res.status(200).send('');
      return;
    }
    const copy = refs.length === 0
      ? { title: 'Balances updated', body: loyalty.map((l) => l.title).join(' · ') }
      : loyalty.length > 0
        ? mixedPushCopy(refs.length, loyalty.length)
        : emailPushCopy(items, linkedTrip, asked);
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
    // After the bookings are saved, a later failure (matching, the push) must not
    // relabel the email "Couldn't read" — the user would paste it in and duplicate them.
    if (uid && importId && !committed) await log(uid, importId, 'unreadable', subject).catch(() => undefined);
    if (uid && importId && committed) {
      await db.collection('users').doc(uid).collection('emailImports').doc(importId)
        .set({ status: 'imported' }, { merge: true }).catch(() => undefined);
    }
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
  const uid = request.auth.uid;
  const user = await requireProUser(uid);
  if (!hasAiConsent(user)) throw new HttpsError('failed-precondition', 'Allow AI import first.');
  // A live address on record wins — so two quick taps (or two devices) can't leave a second, forgotten one.
  const live = await addressesOf(uid);
  if (live.length > 0) {
    const token = live[0].id;
    await privateDoc(uid).set({ token }, { merge: true });
    return { address: `${token}@${IMPORT_DOMAIN}` };
  }
  return { address: await issueAddress(uid) };
});

/**
 * A new address; every old one stops working first. Not Pro-gated: someone
 * whose Pro lapsed must still be able to shut off an address that leaked.
 */
export const rotateImportAddress = onCall({ region: 'us-central1' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first');
  const uid = request.auth.uid;
  const live = await addressesOf(uid);
  await Promise.all(live.map((d) => d.ref.delete()));
  // The private doc never points at a dead address, even if issuing fails below.
  await privateDoc(uid).set({ token: admin.firestore.FieldValue.delete(), gmailForwardingCode: admin.firestore.FieldValue.delete() }, { merge: true });
  return { address: await issueAddress(uid) };
});
