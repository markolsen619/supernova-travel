/** `pastTripStory` — one Nova message for a past trip's words (spec 2026-10-25-past-trips-from-photos). */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { AI_CONSENT_REQUIRED_MESSAGE, hasAiConsent } from './aiConsent';
import { agentGate, agentHourKey, agentQuotaPolicy } from './quotaUtils';
import { generateJson } from './agentModel';
import { STORY_SCHEMA, STORY_SYSTEM, fallbackStory, parseStory, storyPrompt, validateStoryRequest, type Story } from './pastTripStory';

const db = () => admin.firestore();

export const pastTripStory = onCall({ region: 'us-central1', timeoutSeconds: 45 }, async (req): Promise<Story & { fromNova: boolean }> => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const r = validateStoryRequest(req.data);
  if (!r) throw new HttpsError('invalid-argument', 'Bad trip');
  const userSnap = await db().doc(`users/${uid}`).get();
  if (!hasAiConsent(userSnap.data(), 'agent')) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);

  const tier = String(userSnap.get('tier') ?? 'free');
  const policy = agentQuotaPolicy(tier);
  const quotaRef = db().doc(`usage_quotas/${uid}`);
  const hourKey = agentHourKey();
  const doneRef = db().doc(`usage_quotas/${uid}/pastTripStories/${r.requestId}`);
  const done = await doneRef.get();
  if (done.exists) return { ...(done.data() as Story), fromNova: true };

  const q = (await quotaRef.get()).data() ?? {};
  const gate = agentGate({ used: q[policy.quotaKey] ?? 0, limit: policy.limit, hourCount: q[hourKey] ?? 0, inflightUntil: null, now: Date.now() });
  if (gate === 'monthly') throw new HttpsError('resource-exhausted', policy.fairUse ? 'That\'s a lot of Nova this month. It resets on the 1st.' : 'Free accounts get 10 Nova messages a month. Pro gives you plenty more.', { reason: 'monthly', fairUse: policy.fairUse });
  if (gate === 'hourly') throw new HttpsError('resource-exhausted', 'Give it a few minutes and try again.', { reason: 'hourly' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return { ...fallbackStory(r), fromNova: false };
  try {
    const result = await generateJson({
      system: STORY_SYSTEM, turns: [{ role: 'user', text: storyPrompt(r) }], schema: STORY_SCHEMA, apiKey,
      parse: (t) => parseStory(t, r.days.length),
    });
    const batch = db().batch();
    batch.set(quotaRef, { [policy.quotaKey]: admin.firestore.FieldValue.increment(1), [hourKey]: admin.firestore.FieldValue.increment(1) }, { merge: true });
    batch.set(doneRef, { ...result.json, createdAt: admin.firestore.FieldValue.serverTimestamp() });
    await batch.commit();
    console.log('pastTripStory', { uid, days: r.days.length, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs });
    return { ...result.json, fromNova: true };
  } catch (err) {
    console.error('pastTripStory failed', { uid, err: String(err) });
    return { ...fallbackStory(r), fromNova: false };
  }
});
