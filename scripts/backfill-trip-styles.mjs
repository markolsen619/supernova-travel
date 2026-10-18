// scripts/backfill-trip-styles.mjs
// Usage: node scripts/backfill-trip-styles.mjs [--dry-run]
// Gives every editorial (seeded) trip its `travelStyles`, so trip cards can label it (2026-10-17).
// The seed generated one trip per entry of data/destinations.json `styles`, in order, so a destination's
// editorial trips sorted by createdAt map onto that list. A title that names a different style wins over
// the order (and is reported). Only trips with no travelStyles yet are written. Safe to re-run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const admin = require('../functions/node_modules/firebase-admin');

const DRY = process.argv.includes('--dry-run');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/supernova/service-account.json'), 'utf8'))) });
const db = admin.firestore();
const catalog = JSON.parse(fs.readFileSync('data/destinations.json', 'utf8'));

// Words in a title that name a style outright.
const TITLE_WORDS = {
  luxury: /\bluxur/i, family: /\bfamil|\bkids?\b/i, cultural: /\bcultur|histor|heritage|\bart(s|istic)?\b/i,
  adventure: /\badventur(?!e\b.*famil)/i, foodie: /\bfood|culinar|gourmet|\btaste/i, romantic: /\bromanc|romantic|\blove\b/i,
  budget: /\bbudget|\bthrift/i, party: /\bnightlife|\bparty/i, relax: /\brelax|\bserenit|\bslow\b|\bunwind/i,
};
const fromTitle = (title) => Object.keys(TITLE_WORDS).filter((s) => TITLE_WORDS[s].test(title));

let planned = 0, skipped = 0, disagreements = 0;
for (const entry of catalog) {
  const snap = await db.collection('trips').where('isEditorial', '==', true).where('destinationKeys', 'array-contains', entry.slug).get();
  const trips = snap.docs.sort((a, b) => (a.get('createdAt')?.toMillis?.() ?? 0) - (b.get('createdAt')?.toMillis?.() ?? 0));
  for (const [i, t] of trips.entries()) {
    if (Array.isArray(t.get('travelStyles')) && t.get('travelStyles').length) { skipped += 1; continue; }
    const byOrder = entry.styles?.[i] ?? null;
    const named = fromTitle(t.get('title') ?? '');
    // A title word wins over the order when the order disagrees with everything the title names:
    // an unambiguous word (family, luxury, budget) first, else the only style named. (A skipped seed
    // generation shifts the order by one: "Cape Town Family Adventure" came out as luxury.)
    const clear = named.find((n) => ['family', 'luxury', 'budget'].includes(n));
    const disagrees = byOrder && named.length > 0 && !named.includes(byOrder);
    const style = disagrees && clear ? clear : disagrees && named.length === 1 ? named[0] : byOrder ?? named[0] ?? null;
    if (!style) { console.log(`  ? ${entry.slug}: "${t.get('title')}" — no style found, left alone`); continue; }
    if (byOrder && style !== byOrder) { disagreements += 1; console.log(`  ~ ${entry.slug}: "${t.get('title')}" order=${byOrder} title=${style} → ${style}`); }
    else console.log(`  ${entry.slug}: "${t.get('title')}" → ${style}`);
    planned += 1;
    if (!DRY) await t.ref.update({ travelStyles: [style] });
  }
}
console.log(`${DRY ? 'Would set' : 'Set'} ${planned} trips (${disagreements} decided by title), ${skipped} already had styles.`);
process.exit(0);
