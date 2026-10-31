/**
 * "Ask Nova" (docs/superpowers/specs/2026-10-14-trip-agent-design.md).
 * One Gemini call per message; proposes operations, never edits the trip.
 * Pure rules: agentTripContext, agentTripOps, agentSurfaces, agentModel, quotaUtils.
 */
import * as admin from 'firebase-admin';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentDeleted } from 'firebase-functions/v2/firestore';
import { AI_CONSENT_REQUIRED_MESSAGE, agentConsentPurpose, hasAiConsent } from './aiConsent';
import { isValidRequestId } from './generationRequest';
import { agentGate, agentHourKey, agentQuotaPolicy, AGENT_INFLIGHT_MS } from './quotaUtils';
import { buildTripContext, bookingForContext, type CtxBooking, type CtxDay, type CtxTopPlace } from './agentTripContext';
import { validateTripOps } from './agentTripOps';
import { validateWalletOps, WALLET_OPS } from './agentWalletOps';
import { filterByCapabilities, isAgentSurface, threadId } from './agentSurfaces';
import { allowedCategories, keepAgentOp } from './adultVenues';
import { generate, type ModelTurn } from './agentModel';
import { AGENT_RESPONSE_SCHEMA, TRIP_SYSTEM_PROMPT, polishReply } from './agentPrompt';
import { loadCatalog } from './discoveryFunctions';
import { destinationKeysFor } from './discovery';
import type { AgentOp, AgentQuotaView, AgentResponse } from './agentTypes';

const db = () => admin.firestore();
const MESSAGE_MAX = 500;
const HISTORY = 10;
const FAIL = "Nova couldn't answer right now. Try again.";

const ms = (v: unknown) => (v && typeof (v as admin.firestore.Timestamp).toMillis === 'function' ? (v as admin.firestore.Timestamp).toMillis() : null);

function quotaView(tier: string, q: admin.firestore.DocumentData | undefined, extra = 0): AgentQuotaView {
  const p = agentQuotaPolicy(tier);
  return { used: ((q?.[p.quotaKey] as number) ?? 0) + extra, limit: p.limit, fairUse: p.fairUse, resetsAt: p.resetsAt.toISOString() };
}

export const getAgentQuota = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const [user, quota] = await Promise.all([db().doc(`users/${req.auth.uid}`).get(), db().doc(`usage_quotas/${req.auth.uid}`).get()]);
  return quotaView(String(user.get('tier') ?? 'free'), quota.data());
});

export const agent = onCall({ region: 'us-central1', timeoutSeconds: 60, memory: '512MiB' }, async (req): Promise<AgentResponse> => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Must be signed in');
  const uid = req.auth.uid;
  const { surface, subjectId, message, requestId, capabilities } = (req.data ?? {}) as Record<string, unknown>;
  if (!isAgentSurface(surface)) throw new HttpsError('invalid-argument', 'Unknown surface');
  if (typeof subjectId !== 'string' || !/^[A-Za-z0-9]{10,40}$/.test(subjectId)) throw new HttpsError('invalid-argument', 'Bad trip');
  if (typeof message !== 'string' || !message.trim() || message.length > MESSAGE_MAX) throw new HttpsError('invalid-argument', `Messages can be up to ${MESSAGE_MAX} characters.`);
  if (!isValidRequestId(requestId)) throw new HttpsError('invalid-argument', 'Bad request');

  const thread = db().collection(`users/${uid}/agentThreads/${threadId(surface, subjectId)}/messages`);
  const replyRef = thread.doc(requestId);
  const userRef = db().doc(`users/${uid}`);
  const quotaRef = db().doc(`usage_quotas/${uid}`);
  const [userSnap, existing] = await Promise.all([userRef.get(), replyRef.get()]);
  const tier = String(userSnap.get('tier') ?? 'free');

  // Retry after a dropped connection: the saved answer, no quota, no model call.
  if (existing.exists) {
    const q = (await quotaRef.get()).data();
    return { messageId: existing.id, reply: existing.get('text'), operations: filterByCapabilities(existing.get('operations') ?? [], capabilities), dropped: existing.get('dropped') ?? 0, quota: quotaView(tier, q) };
  }

  if (!hasAiConsent(userSnap.data(), agentConsentPurpose(capabilities))) throw new HttpsError('failed-precondition', AI_CONSENT_REQUIRED_MESSAGE);

  const tripRef = db().doc(`trips/${subjectId}`);
  const tripSnap = await tripRef.get();
  const trip = tripSnap.data();
  const members = trip ? [trip.authorUid, ...(Array.isArray(trip.collaborators) ? trip.collaborators : [])] : [];
  if (!trip || !members.includes(uid) || trip.moderationHidden === true) throw new HttpsError('permission-denied', 'You can only plan trips you\'re on.');

  // Monthly + hourly + one-at-a-time, claimed in one transaction.
  const policy = agentQuotaPolicy(tier);
  const hourKey = agentHourKey();
  await db().runTransaction(async (tx) => {
    const q = (await tx.get(quotaRef)).data() ?? {};
    const gate = agentGate({ used: q[policy.quotaKey] ?? 0, limit: policy.limit, hourCount: q[hourKey] ?? 0, inflightUntil: q.agentInflightUntil ?? null, now: Date.now() });
    // `details.reason` tells the app which limit: only the monthly one on a free account opens the paywall.
    if (gate === 'monthly') throw new HttpsError('resource-exhausted', policy.fairUse ? 'That\'s a lot of planning this month. It resets on the 1st.' : 'Free accounts get 10 messages a month. Pro gives you plenty more.', { reason: 'monthly', fairUse: policy.fairUse });
    if (gate === 'hourly') throw new HttpsError('resource-exhausted', 'Give it a few minutes and try again.', { reason: 'hourly' });
    if (gate === 'busy') throw new HttpsError('aborted', 'Nova is still answering your last message.');
    tx.set(quotaRef, { [hourKey]: admin.firestore.FieldValue.increment(1), agentInflightUntil: Date.now() + AGENT_INFLIGHT_MS }, { merge: true });
  });

  try {
    const [daysSnap, history, bookings, topPlaces, packingSnap] = await Promise.all([
      tripRef.collection('days').get(),
      thread.orderBy('createdAt', 'desc').limit(HISTORY).get(),
      loadBookings(uid, subjectId),
      loadTopPlaces(trip),
      tripRef.collection('packingItems').limit(40).get(),
    ]);
    const packing = packingSnap.docs.map((p) => ({ id: p.id, label: String(p.get('label') ?? ''), checked: p.get('checked') === true })).filter((p) => p.label);
    const bookedStops = new Set<string>();
    const days: CtxDay[] = await Promise.all(daysSnap.docs.map(async (d) => {
      const acts = await d.ref.collection('activities').get();
      acts.docs.forEach((a) => { const fb = a.get('fromBooking') as { id?: string } | undefined; if (fb?.id) bookedStops.add(fb.id); });
      return {
        id: d.id, dayNumber: Number(d.get('dayNumber') ?? 0), city: Number(d.get('destinationIndex') ?? 0),
        stops: acts.docs.map((a) => ({
          id: a.id, title: String(a.get('title') ?? ''), type: String(a.get('type') ?? 'activity'),
          startTime: (a.get('startTime') as string | null) ?? null, placed: a.get('lat') != null, order: Number(a.get('order') ?? 0),
          lat: (a.get('lat') as number | null) ?? null, lng: (a.get('lng') as number | null) ?? null,
        })),
      };
    }));
    const cities = [trip.destination, ...(Array.isArray(trip.additionalDestinations) ? trip.additionalDestinations : [])]
      .filter(Boolean).map((c: { name?: string; nights?: number | null }) => ({ name: String(c.name ?? ''), nights: typeof c.nights === 'number' ? c.nights : null }));
    const startMs = ms(trip.startDate);
    const startDay = typeof trip.startDay === 'string' ? trip.startDay : startMs != null ? new Date(startMs + 12 * 3_600_000).toISOString().slice(0, 10) : null;
    const endMs = ms(trip.endDate);
    const endDay = endMs != null ? new Date(endMs + 12 * 3_600_000).toISOString().slice(0, 10) : startDay;
    // Own wallet bookings only for apps that can act on them (and whose consent covers them).
    const wallet = agentConsentPurpose(capabilities) === 'agentWallet' ? await loadWallet(uid, subjectId, startDay, endDay, bookedStops) : [];
    const { text: context, labels } = buildTripContext({
      title: String(trip.title ?? 'Trip'), startDay, today: new Date().toISOString().slice(0, 10),
      cities, days, bookings: [...wallet, ...bookings].slice(0, 25), topPlaces, packing, visibility: String(trip.visibility ?? ''),
    });

    const turns: ModelTurn[] = [];
    for (const h of history.docs.reverse()) {
      const role = h.get('role') === 'assistant' ? 'model' : 'user';
      const status = h.get('status');
      turns.push({ role, text: role === 'model' ? JSON.stringify({ reply: h.get('text'), proposedChanges: (h.get('operations') ?? []).length, status }) : String(h.get('text')) });
    }
    turns.push({ role: 'user', text: `${context}\n\nREQUEST: ${message.trim()}` });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY missing');
    const result = await generate({ system: TRIP_SYSTEM_PROMPT, turns, schema: AGENT_RESPONSE_SCHEMA, apiKey });
    const cityOfDay = (dayId: string) => {
      const d = days.find((x) => x.id === dayId);
      return d ? (cities[d.city]?.name ?? cities[0]?.name ?? null) : null;
    };
    // Wallet operations and trip operations are checked by their own validators, then kept in the model's order.
    const rawOps: unknown[] = Array.isArray(result.json.operations) ? result.json.operations : [];
    const isWallet = (o: unknown) => !!o && typeof o === 'object' && WALLET_OPS.has(String((o as { op?: unknown }).op));
    const tripPart = validateTripOps(rawOps.filter((o) => !isWallet(o)), labels, cityOfDay);
    const walletPart = validateWalletOps(rawOps.filter(isWallet), labels, { startDay, endDay });
    // Title, description and visibility are the author's (the app's Edit trip is owner-only): a collaborator's are dropped.
    const isAuthor = trip.authorUid === uid;
    const tripOps = isAuthor ? tripPart.ops : tripPart.ops.filter((o) => o.kind !== 'trip.updateTrip');
    const ops = [...tripOps, ...walletPart.ops];
    const dropped = tripPart.dropped + walletPart.dropped + (tripPart.ops.length - tripOps.length);
    const capable: AgentOp[] = filterByCapabilities(ops, capabilities);
    // Adult and gambling places only when asked (adultVenues.ts): the message or the trip itself ("Bachelor party in Vegas").
    const asked = allowedCategories(`${message} ${trip.title ?? ''} ${trip.description ?? ''}`);
    const allowed: AgentOp[] = capable.filter((o) => keepAgentOp(o as { kind: string }, asked));
    const totalDropped = dropped + (ops.length - allowed.length);
    const said = polishReply(String(result.json.reply ?? ''));
    const reply = totalDropped > 0
      ? `${said}\n${totalDropped === 1 ? "1 suggestion didn't fit the trip." : `${totalDropped} suggestions didn't fit the trip.`}`
      : said;

    console.log('agent', { uid, surface, inputTokens: result.inputTokens, outputTokens: result.outputTokens, latencyMs: result.latencyMs, operations: allowed.length, dropped: totalDropped });

    const now = admin.firestore.Timestamp.now();
    const base = { agentThread: threadId(surface, subjectId), surface, subjectId };
    const batch = db().batch();
    batch.set(thread.doc(`${requestId}_u`), { ...base, role: 'user', text: message.trim(), createdAt: now });
    batch.set(replyRef, { ...base, role: 'assistant', text: reply, operations: allowed, dropped: totalDropped, status: allowed.length ? 'proposed' : null, createdAt: admin.firestore.Timestamp.fromMillis(now.toMillis() + 1) });
    batch.set(quotaRef, { [policy.quotaKey]: admin.firestore.FieldValue.increment(1), agentInflightUntil: null }, { merge: true });
    await batch.commit();

    const q = (await quotaRef.get()).data();
    return { messageId: requestId, reply, operations: allowed, dropped: totalDropped, quota: quotaView(tier, q) };
  } catch (err) {
    console.error('agent failed', { uid, err: String(err) });
    await quotaRef.set({ agentInflightUntil: null }, { merge: true });
    if (err instanceof HttpsError) throw err;
    throw new HttpsError('unavailable', FAIL);
  }
});

/** Other members' bookings shared with the trip (no labels: Nova can't change them). Own bookings come from loadWallet. */
async function loadBookings(uid: string, tripId: string): Promise<CtxBooking[]> {
  const shared = await db().collection(`trips/${tripId}/bookings`).get();
  const out: CtxBooking[] = [];
  shared.docs.forEach((d) => {
    if (d.get('ownerUid') === uid) return; // our own, already above
    const kind = d.id.startsWith('boarding_pass_') ? 'boarding_pass' : 'reservation';
    const b = bookingForContext(kind, d.data(), true);
    if (b) out.push(b);
  });
  return out.slice(0, 10);
}

/**
 * The caller's own bookings that belong to this trip: linked to it, or unlinked with a date inside it (±1 day).
 * Labelled b1… for wallet.v1; the model sees kind, name, date, time and whether a code exists — never the code.
 */
async function loadWallet(uid: string, tripId: string, startDay: string | null, endDay: string | null, bookedStops: Set<string>): Promise<CtxBooking[]> {
  const [passes, reservations] = await Promise.all([
    db().collection('boarding_passes').where('ownerUid', '==', uid).limit(200).get(),
    db().collection('reservations').where('ownerUid', '==', uid).limit(200).get(),
  ]);
  const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const lo = startDay ? shift(startDay, -1) : null;
  const hi = endDay ? shift(endDay, 1) : lo;
  const out: CtxBooking[] = [];
  const add = (kind: 'boarding_pass' | 'reservation', d: admin.firestore.QueryDocumentSnapshot) => {
    const data = d.data();
    const linked = data.tripId === tripId;
    const b = bookingForContext(kind, data, false);
    if (!b) return;
    const inDates = !data.tripId && !!b.date && !!lo && !!hi && b.date >= lo && b.date <= hi;
    if (!linked && !inDates) return;
    const code = kind === 'reservation' ? data.confirmationCode : data.recordLocator ?? data.confirmationCode;
    out.push({ ...b, label: `b${out.length + 1}`, linked, hasStop: bookedStops.has(d.id), hasCode: typeof code === 'string' && code.trim().length > 0, ref: { kind, id: d.id } });
  };
  passes.docs.forEach((d) => add('boarding_pass', d));
  reservations.docs.forEach((d) => add('reservation', d));
  return out.slice(0, 15);
}

async function loadTopPlaces(trip: admin.firestore.DocumentData): Promise<CtxTopPlace[]> {
  const cities = [trip.destination, ...(Array.isArray(trip.additionalDestinations) ? trip.additionalDestinations : [])].filter(Boolean);
  const catalog = await loadCatalog();
  const perCity = cities.map((c: { lat?: number | null; lng?: number | null }) => destinationKeysFor([{ lat: c.lat ?? null, lng: c.lng ?? null }], catalog)[0] ?? null);
  const slugs = [...new Set(perCity.filter((s): s is string => !!s))];
  if (!slugs.length) return [];
  const docs = await db().getAll(...slugs.map((s) => db().doc(`destinations/${s}`)));
  const bySlug = new Map(docs.map((d) => [d.id, (d.get('topPlaces') as { name: string; type: string }[] | undefined) ?? []]));
  const out: CtxTopPlace[] = [];
  perCity.forEach((slug, i) => { if (slug) (bySlug.get(slug) ?? []).slice(0, 5).forEach((p) => out.push({ city: i, name: p.name, type: p.type })); });
  return out;
}

/** A deleted trip takes every member's private thread about it. */
export const onTripDeletedAgentThreads = onDocumentDeleted('trips/{tripId}', async (event) => {
  const snap = await db().collectionGroup('messages').where('agentThread', '==', `trip_${event.params.tripId}`).get();
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = db().batch();
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
});
