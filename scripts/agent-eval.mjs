// scripts/agent-eval.mjs
// Usage: cd functions && npm run build && cd .. && node scripts/agent-eval.mjs [--trip TRIP_ID] [--models gemini-2.5-flash,gemini-2.5-flash-lite]
// Reads one editorial trip (default: the first editorial trip with 2+ cities), sends REQUESTS through the
// real context + prompt + validator, and prints quality, tokens, latency and cost. Read-only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');
const { buildTripContext } = require('../functions/lib/agentTripContext.js');
const { validateTripOps } = require('../functions/lib/agentTripOps.js');
const { OP_CAPABILITY } = require('../functions/lib/agentTypes.js');
const { validateWalletOps, WALLET_OPS } = require('../functions/lib/agentWalletOps.js');
const CAPS = new Set((arg2('--caps') ?? 'trip.v1,trip.v2,wallet.v1').split(','));
function arg2(n) { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; }
const { generate } = require('../functions/lib/agentModel.js');
const { TRIP_SYSTEM_PROMPT, AGENT_RESPONSE_SCHEMA, polishReply } = require('../functions/lib/agentPrompt.js');
const { adultCategory, allowedCategories } = require('../functions/lib/adultVenues.js');

const PRICES = { // USD per 1M tokens (input, output) — check current Gemini pricing before trusting totals
  'gemini-2.5-flash': [0.30, 2.50],
  'gemini-2.5-flash-lite': [0.10, 0.40],
};
const REQUESTS = [
  'Make day 2 less rushed', 'Find a great dinner near our hotel on the first night', 'Add a night in the last city',
  'Move the museum to the morning', 'We land at 4pm on day 1, fix that day', 'Add a rooftop bar on day 3',
  'Swap the aquarium for something outdoors', 'Is day 3 too packed?', 'What should we not miss here?',
  'Put a coffee stop before the first sight each day', 'Remove anything touristy on day 4', 'Start the trip two days later',
  'Add a day trip to the coast', 'We want a slow morning on the last day', 'Order day 1 so we walk less',
  'Add lunch on every day that has none', 'Swap the order of the two cities', 'Set dinner at 20:00 on day 2',
  'Add a famous viewpoint for sunset', 'Which day is best for the market?', 'Drop the last city',
  'Make it kid friendly', 'Add a cooking class', 'We hate museums', 'Plan nothing after 6pm on day 2',
  // Phase 2 (the owner's Mission Beach conversation, 2026-10-16)
  'My friend says I have to check out Pennant in Mission Beach, add it', 'Is there anything near the Taco Stand on day 2?',
  'What should I do differently about this trip?', 'Fix day 2 so we are not crossing town',
  // trip.v2
  'Rename the trip to Mission Beach weekend', 'Add sunscreen and a beach towel to the packing list',
  'That bar is the wrong Pennant, use the one in Mission Beach', 'Swap day 2 and day 3',
  // wallet.v1 (a synthetic unlinked hotel booking, b1, is in the context)
  'I booked Pennant for 7pm on the first day, confirmation ABC123', 'My hotel booking should be on this trip', 'Our dinner reservation on day 2 moved to 8pm, add it if it is not there',
  // Local-friend questions (owner, 2026-10-30): fuller answers
  'Tell me a bit of the history of this area', 'How do I say thank you to a local here?', 'Any little-known facts about Mission Beach?', 'Is tipping expected at restaurants here?', 'What is there to do here on a rainy day?',
  // Opt-in adult places (owner, 2026-10-30): a party request must not get them; an explicit ask may
  'We want one wild party night, add it', 'It is a bachelor party, add a strip club one night',
];
const KNOWLEDGE = new Set(['Tell me a bit of the history of this area', 'How do I say thank you to a local here?', 'Any little-known facts about Mission Beach?', 'Is tipping expected at restaurants here?', 'What is there to do here on a rainy day?']);
const WALLET = new Set(['I booked Pennant for 7pm on the first day, confirmation ABC123', 'My hotel booking should be on this trip', 'Our dinner reservation on day 2 moved to 8pm, add it if it is not there']);
const V2 = new Set(['Rename the trip to Mission Beach weekend', 'Add sunscreen and a beach towel to the packing list', 'That bar is the wrong Pennant, use the one in Mission Beach', 'Swap day 2 and day 3']);

// Questions expect an answer and no changes; every other request should come back with changes.
const QUESTIONS = new Set(['Is day 3 too packed?', 'What should we not miss here?', 'Which day is best for the market?', 'Is there anything near the Taco Stand on day 2?', ...KNOWLEDGE]);
const LABEL = /\b[dsc]\d+\b/;

const env = Object.fromEntries(fs.readFileSync('functions/.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const apiKey = env.GEMINI_API_KEY;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/supernova/service-account.json'), 'utf8'))) });
const db = admin.firestore();

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const models = (arg('--models') ?? 'gemini-2.5-flash').split(',');

async function loadTrip() {
  let doc;
  if (arg('--trip')) doc = await db.doc(`trips/${arg('--trip')}`).get();
  else {
    const q = await db.collection('trips').where('isEditorial', '==', true).limit(40).get();
    doc = q.docs.find((d) => (d.get('additionalDestinations') ?? []).length > 0) ?? q.docs[0];
  }
  const t = doc.data();
  const days = await doc.ref.collection('days').get();
  const ctxDays = await Promise.all(days.docs.map(async (d) => ({
    id: d.id, dayNumber: d.get('dayNumber'), city: d.get('destinationIndex') ?? 0,
    stops: (await d.ref.collection('activities').get()).docs.map((a) => ({ id: a.id, title: a.get('title'), type: a.get('type'), startTime: a.get('startTime') ?? null, placed: a.get('lat') != null, order: a.get('order') ?? 0, lat: a.get('lat') ?? null, lng: a.get('lng') ?? null })),
  })));
  const cities = [t.destination, ...(t.additionalDestinations ?? [])].map((c) => ({ name: c.name, nights: c.nights ?? null }));
  // One synthetic unlinked hotel booking so wallet requests have something to link (never written anywhere).
  const hotel = { kind: 'hotel', name: 'Catamaran Resort Hotel', date: '2026-11-02', time: null, shared: false, label: 'b1', linked: false, hasStop: false, hasCode: true, ref: { kind: 'reservation', id: 'EVAL_R1' } };
  const built = buildTripContext({ title: t.title, startDay: '2026-11-02', today: new Date().toISOString().slice(0, 10), cities, days: ctxDays, bookings: [hotel], topPlaces: [] });
  const cityOfDay = (dayId) => { const d = ctxDays.find((x) => x.id === dayId); return d ? (cities[d.city]?.name ?? cities[0]?.name ?? null) : null; };
  return { ...built, cityOfDay };
}

const { text, labels, cityOfDay } = await loadTrip();
console.log(`context: ${text.length} chars`);
for (const model of models) {
  let valid = 0, inT = 0, outT = 0, lat = 0, failed = 0, opsTotal = 0, droppedTotal = 0, acted = 0, leaks = 0, adds = 0, addsWithQuery = 0, apologies = 0, v2ok = 0, walletOk = 0, knowChars = 0, adultUnasked = 0;
  const changeRequests = REQUESTS.filter((r) => !QUESTIONS.has(r)).length;
  for (const r of REQUESTS) {
    try {
      const res = await generate({ system: TRIP_SYSTEM_PROMPT, turns: [{ role: 'user', text: `${text}\n\nREQUEST: ${r}` }], schema: AGENT_RESPONSE_SCHEMA, apiKey, model });
      const raw = Array.isArray(res.json.operations) ? res.json.operations : [];
      const isW = (o) => o && WALLET_OPS.has(String(o.op));
      const tp = validateTripOps(raw.filter((o) => !isW(o)), labels, cityOfDay);
      const wp = validateWalletOps(raw.filter(isW), labels, { startDay: '2026-11-02', endDay: '2026-11-06' });
      const v0 = { ops: [...tp.ops, ...wp.ops], dropped: tp.dropped + wp.dropped };
      if (WALLET.has(r) && v0.ops.some((o) => OP_CAPABILITY[o.kind] === 'wallet.v1')) walletOk += 1;
      // Same capability filter as the function: an op the app didn't declare counts as dropped.
      const kept = v0.ops.filter((o) => CAPS.has(OP_CAPABILITY[o.kind]));
      const v = { ops: kept, dropped: v0.dropped + (v0.ops.length - kept.length) };
      if (V2.has(r) && kept.some((o) => OP_CAPABILITY[o.kind] === 'trip.v2')) v2ok += 1;
      // Every new place must come with the model's own search name (not just the title+city default).
      for (const raw of res.json.operations ?? []) if (raw.op === 'addStop' && raw.type !== 'free' && raw.type !== 'transport') { adds += 1; if (typeof raw.query === 'string' && raw.query.trim().length >= 2) addsWithQuery += 1; }
      for (const raw of res.json.operations ?? []) if (raw.op === 'addStop' || raw.op === 'editStop') { const c = adultCategory({ title: raw.title, searchQuery: raw.query, type: raw.type }); if (c && !allowedCategories(r).has(c)) { adultUnasked += 1; console.log('  UNASKED ADULT:', r, '→', raw.title); } }
      res.json.reply = polishReply(String(res.json.reply ?? ''));
      if (KNOWLEDGE.has(r)) knowChars += res.json.reply.length;
      if (/apolog|sorry/i.test(res.json.reply)) { apologies += 1; if (process.argv.includes('--verbose')) console.log('  apology:', r, '→', res.json.reply); }
      if (v.dropped === 0) valid += 1;
      if (v.dropped > 0 && process.argv.includes('--verbose')) console.log('  DROPPED in', r, '→', JSON.stringify(res.json.operations));
      if (!QUESTIONS.has(r) && v.ops.length > 0) acted += 1;
      if (LABEL.test(res.json.reply)) { leaks += 1; if (process.argv.includes('--verbose')) console.log('  label in reply:', r, '→', res.json.reply); }
      if (process.argv.includes('--verbose')) console.log(`  ${r} → ${res.json.reply} [${v.ops.map((o) => o.kind).join(', ')}]`);
      opsTotal += v.ops.length; droppedTotal += v.dropped;
      inT += res.inputTokens; outT += res.outputTokens; lat += res.latencyMs;
    } catch (e) { failed += 1; console.error(model, r, String(e).slice(0, 120)); }
  }
  const ok = REQUESTS.length - failed;
  const [pi, po] = PRICES[model] ?? [0, 0];
  const cost = ok ? ((inT / ok) * pi + (outT / ok) * po) / 1e6 : 0;
  console.log(`${model}: answered ${ok}/${REQUESTS.length}, fully valid ${valid}/${ok}, changes proposed for ${acted}/${changeRequests} change requests, labels leaked in ${leaks} replies, apologies ${apologies}, new places with a query ${addsWithQuery}/${adds}, trip.v2 used for ${v2ok}/${V2.size}, wallet used for ${walletOk}/${WALLET.size}, knowledge answers avg ${Math.round(knowChars / KNOWLEDGE.size)} chars, unasked adult suggestions ${adultUnasked} (removed server-side), ops ${opsTotal} (dropped ${droppedTotal}), avg in ${Math.round(inT / ok)} out ${Math.round(outT / ok)} tok, avg ${Math.round(lat / ok)} ms, ~$${cost.toFixed(5)}/message`);
}
process.exit(0);
