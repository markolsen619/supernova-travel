/**
 * `readScreenshots` — the places in up to 5 screenshots (spec 2026-11-11). Order: the request, consent (screenshots),
 * the shared monthly wish-list limit (claimed before any cost, given back on failure), the images from the caller's
 * own folder, one Gemini call, then the link path's cleaning and Mapbox placement. Nothing is cached; images are never
 * logged or sent anywhere but Gemini.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { AI_CONSENT_REQUIRED_MESSAGE, hasAiConsent } from './aiConsent';
import { isPaidTier } from './flightPolling';
import { generateJson } from './agentModel';
import { PLACES_SCHEMA, cleanPlaces, monthKey, parsePlacesAnswer, releaseQuota, shotQuota, type QuotaDoc } from './socialPost';
import { SHOTS_PROMPT, SHOTS_SYSTEM, shotPaths, validShotsRequest } from './screenshotPlaces';
import { placeAll } from './socialPostFunctions';

const db = () => admin.firestore();
const MAX_BYTES = 2 * 1024 * 1024;

export const readScreenshots = onCall({ region: 'us-central1', timeoutSeconds: 60, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const ask = validShotsRequest(req.data);
  if (!ask) throw new HttpsError('invalid-argument', "Couldn't read these screenshots. Try again");

  const userSnap = await db().doc(`users/${uid}`).get();
  if (!hasAiConsent(userSnap.data(), 'screenshots')) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);
  const paid = isPaidTier(String(userSnap.get('tier') ?? 'free'));

  const now = Date.now();
  const quotaRef = db().doc(`usage_quotas/${uid}/wishlist/${monthKey(now)}`);
  // Every read counts toward the hour (a re-read is a new Gemini call); the month counts the save once (fresh review I-1).
  let monthNew = false;
  await db().runTransaction(async (tx) => {
    const q = shotQuota(((await tx.get(quotaRef)).data() ?? {}) as QuotaDoc, ask.saveId, paid, now);
    if (!q.ok) {
      throw new HttpsError('resource-exhausted', q.reason === 'monthly'
        ? 'Free accounts save 20 places a month. Pro saves as many as you like.'
        : "That's a lot of saving. Try again in a few minutes.", { reason: q.reason });
    }
    monthNew = q.monthNew;
    tx.set(quotaRef, q.patch, { merge: true });
  });
  const giveBack = async () => {
    await db().runTransaction(async (tx) => {
      tx.set(quotaRef, releaseQuota(((await tx.get(quotaRef)).data() ?? {}) as QuotaDoc, ask.saveId, now, { month: monthNew }));
    }).catch(() => {});
  };

  const bucket = admin.storage().bucket();
  let images: { mimeType: string; data: string }[];
  try {
    images = await Promise.all(shotPaths(uid, ask.saveId, ask.count).map(async (path) => {
      const file = bucket.file(path);
      const [meta] = await file.getMetadata();
      if (Number(meta.size) > MAX_BYTES) throw new Error('too big');
      const [buf] = await file.download();
      return { mimeType: 'image/jpeg', data: buf.toString('base64') };
    }));
  } catch {
    await giveBack();
    throw new HttpsError('not-found', "Couldn't find your screenshots. Try again");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) { await giveBack(); throw new HttpsError('unavailable', "Couldn't read these screenshots. Try again"); }
  try {
    const result = await generateJson({
      system: SHOTS_SYSTEM, turns: [{ role: 'user', text: SHOTS_PROMPT, images }], schema: PLACES_SCHEMA, apiKey, thinkingBudget: 0,
      parse: parsePlacesAnswer, timeoutMs: 45_000,
    });
    const answer = cleanPlaces(result.json);
    const placed = await placeAll(answer);
    console.log('readScreenshots', { uid, saveId: ask.saveId, images: images.length, places: placed.places.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs });
    return { saveId: ask.saveId, city: answer.city, country: answer.country, cityLat: placed.cityLat, cityLng: placed.cityLng, places: placed.places };
  } catch (err) {
    console.warn('readScreenshots: AI failed', { saveId: ask.saveId, err: String(err).slice(0, 160) });
    await giveBack();
    throw new HttpsError('unavailable', "Couldn't read these screenshots. Try again");
  }
});
