#!/usr/bin/env node
// Converts keyed Google Places photo covers (…/media?maxWidthPx&key=…, billed on EVERY view) on catalog destinations
// and editorial trips to Google's key-less photo address (one billed lookup, then free to view), saving the place id so
// the daily refreshCovers job keeps it fresh. The 2026-11-11 seed wrote keyed covers before the seed was fixed.
//   node scripts/convert-keyed-covers.mjs            # dry run: lists what would change, no paid calls, no writes
//   node scripts/convert-keyed-covers.mjs --apply    # converts them
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const admin = require(join(root, 'functions/node_modules/firebase-admin'));
const C = require(join(root, 'functions/lib/coverRefresh.js'));
const APPLY = process.argv.includes('--apply');

admin.initializeApp({ credential: admin.credential.cert(require(join(homedir(), '.config/supernova/service-account.json'))) });
const db = admin.firestore();

/** `places/{id}/photos/{ref}` from a keyed media URL. */
function photoName(url) {
  try {
    const m = new URL(url).pathname.match(/^\/v1\/(places\/[^/]+\/photos\/[^/]+)\/media$/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

const keyed = (url) => typeof url === 'string' && C.parsePlacesPhotoUrl(url) !== null;

const targets = [];
for (const d of (await db.collection('destinations').get()).docs) if (keyed(d.get('coverImageUrl'))) targets.push(d);
for (const d of (await db.collection('trips').where('isEditorial', '==', true).get()).docs) if (keyed(d.get('coverImageUrl'))) targets.push(d);
console.log(`${targets.length} keyed covers (${APPLY ? 'converting' : 'dry run'})`);

let ok = 0, failed = 0;
for (const d of targets) {
  const url = d.get('coverImageUrl');
  const parsed = C.parsePlacesPhotoUrl(url);
  const name = photoName(url);
  if (!APPLY) { console.log(`  would convert ${d.ref.path}`); continue; }
  try {
    const r = await fetch(C.photoUriRequest(name, parsed.key, parsed.maxWidthPx ?? 1600), { signal: AbortSignal.timeout(8000) });
    const uri = r.ok ? C.photoUriFrom(await r.json()) : null;
    if (!uri) throw new Error(`HTTP ${r.status}`);
    await d.ref.update({ coverImageUrl: uri, coverPlaceId: parsed.placeId, coverRefreshedAtMs: Date.now() });
    ok++;
  } catch (err) {
    failed++;
    console.log(`  failed ${d.ref.path}: ${String(err).slice(0, 80)}`);
  }
}
if (APPLY) console.log(`Done — converted ${ok}, failed ${failed}`);
process.exit(0);
