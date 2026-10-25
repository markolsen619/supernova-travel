#!/usr/bin/env node
/**
 * Counts every trip's stops into tripStats/{tripId}.stopCount and sets trips/{id}.hasItinerary (≥ 3 stops) — the
 * starting point that onTripActivityWrittenCount keeps up to date (functions/src/tripItineraryFunctions.ts).
 * Writes a trip only when its flag changes. Safe to re-run.
 *
 *   node scripts/backfill-trip-itinerary.mjs --dry-run
 *   node scripts/backfill-trip-itinerary.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
const { ITINERARY_MIN_STOPS } = require(join(root, 'functions', 'lib', 'tripItinerary.js'));
const dryRun = process.argv.includes('--dry-run');

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(join(homedir(), '.config/supernova/service-account.json'), 'utf8'))) });
const db = admin.firestore();

const trips = await db.collection('trips').get();
let flagged = 0, cleared = 0, unchanged = 0;
for (const t of trips.docs) {
  const days = await t.ref.collection('days').get();
  let stops = 0;
  for (const d of days.docs) stops += (await d.ref.collection('activities').count().get()).data().count;
  const has = stops >= ITINERARY_MIN_STOPS;
  const was = t.get('hasItinerary');
  if (was === has) unchanged++; else if (has) flagged++; else cleared++;
  if (!dryRun) {
    await db.doc(`tripStats/${t.id}`).set({ stopCount: stops }, { merge: true });
    if (was !== has) await t.ref.update({ hasItinerary: has });
  }
}
console.log(`${dryRun ? 'Dry run: ' : ''}${trips.size} trips — hasItinerary true: ${flagged}, false: ${cleared}, already right: ${unchanged}`);
process.exit(0);
