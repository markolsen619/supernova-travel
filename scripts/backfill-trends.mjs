#!/usr/bin/env node
/**
 * One-off: fill trendCounts with the last 14 days of trips (by createdAt), so the globe's trending
 * layer isn't flat on the day it ships, then rebuild the heat. Counts each non-editorial trip once
 * per catalog city on its creation day, and records it in trendSeen so the live trigger never counts
 * it again. SETS those days: run it once — a re-run would overwrite live counts for the same days.
 *
 *   node scripts/backfill-trends.mjs --dry-run
 *   node scripts/backfill-trends.mjs
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
// The editorial account's uid lives in functions/.env (EDITORIAL_UID); read it without printing it.
for (const line of readFileSync(join(root, 'functions', '.env'), 'utf8').split('\n')) {
  const m = line.match(/^EDITORIAL_UID=(.*)$/);
  if (m) process.env.EDITORIAL_UID = m[1].trim();
}
const admin = require('firebase-admin');
admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(join(homedir(), '.config/supernova/service-account.json'), 'utf8'))),
});
const { destinationKeysFor, isEditorialTrip } = require(join(root, 'functions', 'lib', 'discovery.js'));
const { destinationPoints, trendDayKey, TREND_WINDOW_DAYS } = require(join(root, 'functions', 'lib', 'trending.js'));
const { loadCatalog } = require(join(root, 'functions', 'lib', 'discoveryFunctions.js'));
const { runTrendRefresh } = require(join(root, 'functions', 'lib', 'trendingFunctions.js'));
const db = admin.firestore();
const dryRun = process.argv.includes('--dry-run');

const since = new Date(Date.now() - (TREND_WINDOW_DAYS - 1) * 86_400_000);
since.setUTCHours(0, 0, 0, 0);
const catalog = await loadCatalog();
const snap = await db.collection('trips').where('createdAt', '>=', admin.firestore.Timestamp.fromDate(since)).get();

/** slug -> day -> count */
const counts = new Map();
const seen = [];
let counted = 0;
for (const d of snap.docs) {
  const trip = d.data();
  if (isEditorialTrip(trip, process.env.EDITORIAL_UID ?? '')) continue;
  const slugs = destinationKeysFor(destinationPoints(trip), catalog);
  if (slugs.length === 0) continue;
  const day = trendDayKey(trip.createdAt.toDate());
  counted += 1;
  seen.push([d.id, slugs]);
  for (const slug of slugs) {
    const days = counts.get(slug) ?? {};
    days[day] = (days[day] ?? 0) + 1;
    counts.set(slug, days);
  }
}

console.log(`${snap.size} trips since ${trendDayKey(since)}, ${counted} counted, ${counts.size} cities`);
for (const [slug, days] of [...counts].sort()) {
  const total = Object.values(days).reduce((a, b) => a + b, 0);
  console.log(`  ${slug.padEnd(20)} ${total}`);
}
if (dryRun) process.exit(0);

const batch = db.batch();
for (const [slug, days] of counts) batch.set(db.doc(`trendCounts/${slug}`), { days }, { merge: true });
for (const [tripId, slugs] of seen) batch.set(db.doc(`trendSeen/${tripId}`), { counted: slugs });
await batch.commit();
console.log('trendCounts written; rebuilding the heat…');
console.log(await runTrendRefresh());
process.exit(0);
