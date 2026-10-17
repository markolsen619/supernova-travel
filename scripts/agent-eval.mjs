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
const { generate } = require('../functions/lib/agentModel.js');
const { TRIP_SYSTEM_PROMPT, AGENT_RESPONSE_SCHEMA } = require('../functions/lib/agentPrompt.js');

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
];

// Questions expect an answer and no changes; every other request should come back with changes.
const QUESTIONS = new Set(['Is day 3 too packed?', 'What should we not miss here?', 'Which day is best for the market?']);
const LABEL = /\b[dsc]\d+\b/;

const env = Object.fromEntries(fs.readFileSync('functions/.env', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]));
const apiKey = env.GEMINI_API_KEY;
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/supernova/service-account.json'), 'utf8'))) });
const db = admin.firestore();

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const models = (arg('--models') ?? 'gemini-2.5-flash,gemini-2.5-flash-lite').split(',');

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
  return buildTripContext({ title: t.title, startDay: '2026-11-02', today: new Date().toISOString().slice(0, 10), cities, days: ctxDays, bookings: [], topPlaces: [] });
}

const { text, labels } = await loadTrip();
console.log(`context: ${text.length} chars`);
for (const model of models) {
  let valid = 0, inT = 0, outT = 0, lat = 0, failed = 0, opsTotal = 0, droppedTotal = 0, acted = 0, leaks = 0;
  const changeRequests = REQUESTS.filter((r) => !QUESTIONS.has(r)).length;
  for (const r of REQUESTS) {
    try {
      const res = await generate({ system: TRIP_SYSTEM_PROMPT, turns: [{ role: 'user', text: `${text}\n\nREQUEST: ${r}` }], schema: AGENT_RESPONSE_SCHEMA, apiKey, model });
      const v = validateTripOps(res.json.operations, labels);
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
  console.log(`${model}: answered ${ok}/${REQUESTS.length}, fully valid ${valid}/${ok}, changes proposed for ${acted}/${changeRequests} change requests, labels leaked in ${leaks} replies, ops ${opsTotal} (dropped ${droppedTotal}), avg in ${Math.round(inT / ok)} out ${Math.round(outT / ok)} tok, avg ${Math.round(lat / ok)} ms, ~$${cost.toFixed(5)}/message`);
}
process.exit(0);
