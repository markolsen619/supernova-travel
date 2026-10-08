#!/usr/bin/env node
/**
 * One-off: build the trip-shared booking copies (trips/{id}/bookings) for
 * bookings linked before sharing existed. Writes only those derived copies,
 * never a wallet document. Safe to re-run.
 *
 *   node scripts/backfill-shared-bookings.mjs --dry-run
 *   node scripts/backfill-shared-bookings.mjs
 *
 * Needs ~/.config/supernova/service-account.json and `cd functions && npm run build`.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(join(homedir(), '.config/supernova/service-account.json'), 'utf8'))),
});
const { syncTripShares } = require(join(root, 'functions', 'lib', 'sharedBookingFunctions.js'));
const db = admin.firestore();
const dryRun = process.argv.includes('--dry-run');

const tripIds = new Set();
for (const col of ['boarding_passes', 'reservations']) {
  const snap = await db.collection(col).where('tripId', '!=', null).get();
  snap.docs.forEach((d) => tripIds.add(d.data().tripId));
}
console.log(`${tripIds.size} trip(s) with linked bookings`);
for (const tripId of tripIds) {
  const trip = await db.doc(`trips/${tripId}`).get();
  console.log(`  ${tripId} ${trip.exists ? `"${trip.data().title}"` : '(deleted)'}`);
  if (!dryRun) await syncTripShares(tripId, trip.exists ? trip.data() : undefined);
}
if (!dryRun) {
  for (const tripId of tripIds) {
    const n = (await db.collection(`trips/${tripId}/bookings`).get()).size;
    console.log(`  ${tripId}: ${n} shared cop${n === 1 ? 'y' : 'ies'}`);
  }
}
process.exit(0);
