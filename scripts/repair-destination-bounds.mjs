#!/usr/bin/env node
/**
 * One-off (2026-10-09): trips whose destination box was a namesake elsewhere
 * (Mission Beach → Mission, TX; Dollywood → Hollywood, FL; …). For each listed
 * trip: the box becomes the city its destination point is in (Mapbox Geocoding
 * v6 reverse — what resolveCityBounds does now), and every stop that was placed
 * inside the wrong box loses its placement so the app places it again. A stop
 * renamed after the wrong venue gets its title back from its search query.
 * Titles otherwise, notes, times and order are untouched.
 *
 *   node scripts/repair-destination-bounds.mjs --dry-run
 *   node scripts/repair-destination-bounds.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(join(homedir(), '.config/supernova/service-account.json'), 'utf8'))) });
const db = admin.firestore();
const TOKEN = readFileSync(join(root, '.env.local'), 'utf8').match(/^EXPO_PUBLIC_MAPBOX_TOKEN=(.*)$/m)?.[1]?.trim();
const dryRun = process.argv.includes('--dry-run');
const TRIPS = ['Kwqh2WmQgPDcaFIikrgK', 'RoiF6GmLUQ2c0NaOLsus', 'Uh9ufoDUqUKXL8TIj7SE', 'aaq5y9McrtfhYLs9eMni', 'lXfy5z9p7wNIjU19Hg7o'];

const holds = (b, p, m = 0.02) => p.lng >= b.sw[0] - m && p.lng <= b.ne[0] + m && p.lat >= b.sw[1] - m && p.lat <= b.ne[1] + m;
async function cityBox(lat, lng) {
  const r = await fetch(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=place&access_token=${TOKEN}`);
  const f = (await r.json()).features?.[0];
  const bb = f?.properties?.bbox;
  if (bb?.length >= 4) { const box = { sw: [bb[0], bb[1]], ne: [bb[2], bb[3]] }; if (holds(box, { lat, lng })) return { box, name: f.properties.name }; }
  return { box: { sw: [lng - 0.2, lat - 0.2], ne: [lng + 0.2, lat + 0.2] }, name: '±0.2° box' };
}

for (const id of TRIPS) {
  const ref = db.doc(`trips/${id}`);
  const t = (await ref.get()).data();
  if (!t) { console.log(id, 'gone'); continue; }
  const dests = [t.destination, ...(t.additionalDestinations ?? [])];
  const badBoxes = [];
  const fixed = [];
  for (const d of dests) {
    if (d?.bounds && d.lat != null && !holds(d.bounds, { lat: d.lat, lng: d.lng })) {
      const { box, name } = await cityBox(d.lat, d.lng);
      badBoxes.push(d.bounds);
      console.log(`${id} "${(t.title ?? '').slice(0, 45)}" — ${d.name}: box → ${name}`);
      fixed.push({ ...d, bounds: box });
    } else fixed.push(d);
  }
  const batch = db.batch();
  batch.update(ref, { destination: fixed[0], additionalDestinations: fixed.slice(1) });
  let reset = 0;
  for (const day of (await ref.collection('days').get()).docs) {
    for (const a of (await day.ref.collection('activities').get()).docs) {
      const v = a.data();
      if (v.lat == null || !badBoxes.some((b) => holds(b, { lat: v.lat, lng: v.lng }, 0))) continue;
      const renamed = v.placeName && v.title?.includes(v.placeName) && v.searchQuery;
      const title = renamed ? v.searchQuery.split(',')[0].trim() : v.title;
      console.log(`   reset: "${v.title}"${renamed ? ` → "${title}"` : ''} (was ${v.address})`);
      batch.update(a.ref, { lat: null, lng: null, address: null, placeId: null, placeName: null, groundingFailedAt: null, ...(renamed ? { title } : {}) });
      reset++;
    }
  }
  console.log(`   ${reset} stop(s) to place again`);
  if (!dryRun) await batch.commit();
}
console.log(dryRun ? 'Dry run — nothing written.' : 'Done.');
process.exit(0);
