#!/usr/bin/env node
// Seeds the editorial destination catalog. Idempotent: re-run to fill gaps.
//   node scripts/seed-destinations.mjs --dry-run          # plan only, no writes, no paid calls
//   node scripts/seed-destinations.mjs --only lisbon      # one destination
//   node scripts/seed-destinations.mjs --limit 2          # first N destinations
//   node scripts/seed-destinations.mjs                    # everything, then aggregate
// Needs: ~/.config/supernova/service-account.json, functions/.env (GEMINI_API_KEY),
// .env.local (EXPO_PUBLIC_MAPBOX_TOKEN, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY). Prints no secrets.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const lib = (m) => require(join(root, 'functions', 'lib', m));

const args = process.argv.slice(2);
const DRY = args.includes('--dry-run');
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const limit = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;

function envFile(path) {
  const out = {};
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const keyPath = join(homedir(), '.config/supernova/service-account.json');
if (!existsSync(keyPath)) throw new Error(`Missing ${keyPath}`);
const fnEnv = envFile(join(root, 'functions/.env'));
const appEnv = envFile(join(root, '.env.local'));
const GEMINI = fnEnv.GEMINI_API_KEY;
const MAPBOX = appEnv.EXPO_PUBLIC_MAPBOX_TOKEN;
const GOOGLE = appEnv.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
for (const [n, v] of Object.entries({ GEMINI, MAPBOX, GOOGLE })) if (!v) throw new Error(`Missing ${n}`);

admin.initializeApp({ credential: admin.credential.cert(JSON.parse(readFileSync(keyPath, 'utf8'))) });
const db = admin.firestore();
// Loaded after initializeApp so no module can touch Firebase before it's configured.
const { buildPrompt } = lib('generateTrip.js');
const { parseGeneratedTrip, tripDocuments } = lib('tripDocs.js');
const { validateCatalog } = lib('catalog.js');
const S = lib('seedSupport.js');
const { runAggregation } = lib('discoveryFunctions.js');
const catalog = JSON.parse(readFileSync(join(root, 'data/destinations.json'), 'utf8'));
const problems = validateCatalog(catalog);
if (problems.length) throw new Error(`Catalog invalid:\n${problems.join('\n')}`);

const EDITORIAL_EMAIL = 'editorial@galaxielabs.space';
const report = { ok: [], skipped: [], failed: [] };

async function editorialUid() {
  try {
    return (await admin.auth().getUserByEmail(EDITORIAL_EMAIL)).uid;
  } catch {
    if (DRY) return 'DRY-RUN-UID';
    const user = await admin.auth().createUser({ email: EDITORIAL_EMAIL, emailVerified: true, displayName: 'Supernova', disabled: false });
    const now = admin.firestore.FieldValue.serverTimestamp();
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid, fullName: 'Supernova', displayName: 'Supernova', username: 'supernova', avatarUrl: null,
      bio: 'Trips planned by the Supernova team.', location: '', followersCount: 0, followingCount: 0, tripsCount: 0,
      isEditorial: true, hasSeenOnboarding: true, createdAt: now,
    });
    await db.doc('usernames/supernova').set({ uid: user.uid });
    return user.uid;
  }
}

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${new URL(url).host}`);
  return res.json();
}

async function googleSearch(query, center, mask) {
  return S.parseGooglePlace(await getJson('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': GOOGLE, 'X-Goog-FieldMask': mask },
    body: JSON.stringify(S.googleTextSearchBody(query, center)),
  }));
}

async function groundStop(query, box, center) {
  const hit = S.parsePlaceFeature(await getJson(S.mapboxPoiUrl(query, MAPBOX, box, center)));
  if (hit) return { lat: hit.lat, lng: hit.lng, placeId: null, placeName: hit.name };
  const g = await googleSearch(query, center, S.GOOGLE_GROUNDING_MASK);
  return g ? { lat: g.lat, lng: g.lng, placeId: g.placeId, placeName: g.name } : null;
}

async function seedDestination(entry, uid, gemini) {
  const ref = db.doc(`destinations/${entry.slug}`);
  const existing = (await ref.get()).data() ?? {};

  // 1. Centre and box, once.
  let { center, bbox } = existing;
  if (!center || !bbox) {
    const place = S.parsePlaceFeature(await getJson(S.mapboxPlaceUrl(entry.query, MAPBOX, entry.countryCode)));
    if (!place) throw new Error('Mapbox could not place it');
    center = { lat: place.lat, lng: place.lng };
    bbox = S.padBox([place.lng, place.lat], place.bbox);
  }

  // 2. Cover, once.
  let coverImageUrl = existing.coverImageUrl ?? null;
  let placeId = existing.placeId ?? null;
  if (!coverImageUrl && !DRY) {
    const g = await googleSearch(entry.query, [center.lng, center.lat], S.GOOGLE_COVER_MASK);
    if (g?.photoName) coverImageUrl = S.coverPhotoUrl(g.photoName, GOOGLE);
    placeId = g?.placeId ?? placeId;
  }

  const doc = {
    slug: entry.slug, name: entry.name, countryCode: entry.countryCode, countryName: entry.countryName,
    continentChip: entry.continentChip, vibes: entry.vibes, popularity: entry.popularity,
    center, bbox, coverImageUrl, placeId, order: entry.popularity,
  };
  if (DRY) {
    console.log(`  would write destinations/${entry.slug}`, { center, coverImageUrl: !!coverImageUrl });
  } else {
    await ref.set(doc, { merge: true });
  }

  // 3. Editorial itineraries — only as many as are missing (re-run safe).
  const have = DRY ? 0 : (await db.collection('trips')
    .where('isEditorial', '==', true).where('destinationKeys', 'array-contains', entry.slug).get()).size;
  const want = entry.styles.slice(have);
  for (const [i, style] of want.entries()) {
    const durationDays = [3, 5, 4][(have + i) % 3];
    const request = {
      destination: entry.name, countryCode: entry.countryCode, additionalDestinations: [],
      startDate: null, endDate: null, durationDays, travelStyle: style, travelStyles: [style],
      pace: 'moderate', mustSee: [], preferences: '', visibility: 'public',
    };
    if (DRY) { console.log(`  would generate a ${durationDays}-day ${style} itinerary`); continue; }
    const text = (await gemini.generateContent(buildPrompt(request))).response.text();
    const generated = parseGeneratedTrip(text);
    if (!generated) { console.log(`  skipped a ${style} itinerary: unusable Gemini response`); continue; }

    const now = admin.firestore.FieldValue.serverTimestamp();
    const docs = tripDocuments(uid, request, generated, now, {
      isEditorial: true,
      destinationKeys: [entry.slug],
      coverImageUrl,
      destination: { name: entry.name, placeId, lat: center.lat, lng: center.lng, countryCode: entry.countryCode, bounds: bbox },
    });
    // Ground before writing, so no half-grounded trip is ever public.
    for (const { activities } of docs.days) {
      for (const act of activities) {
        if (!act.searchQuery) continue;
        const hit = await groundStop(act.searchQuery, bbox, [center.lng, center.lat]).catch(() => null);
        if (hit) Object.assign(act, hit);
        else act.groundingFailedAt = now;
      }
    }
    const tripRef = db.collection('trips').doc();
    await tripRef.set(docs.trip);
    const batch = db.batch();
    for (const { day, activities } of docs.days) {
      const dayRef = tripRef.collection('days').doc();
      batch.set(dayRef, day);
      activities.forEach((a) => batch.set(dayRef.collection('activities').doc(), a));
    }
    await batch.commit();
    console.log(`  wrote "${generated.title}" (${tripRef.id})`);
  }
}

const uid = await editorialUid();
const gemini = new GoogleGenerativeAI(GEMINI).getGenerativeModel({ model: 'gemini-2.5-flash' });
const targets = catalog.filter((e) => !only || e.slug === only).slice(0, limit);
console.log(`${DRY ? '[dry run] ' : ''}Seeding ${targets.length} destination(s) as ${uid}`);
for (const entry of targets) {
  console.log(`• ${entry.name}`);
  try {
    await seedDestination(entry, uid, gemini);
    report.ok.push(entry.slug);
  } catch (err) {
    console.log(`  FAILED: ${err.message}`);
    report.failed.push(entry.slug);
  }
}
if (!DRY && report.ok.length) {
  const r = await runAggregation();
  console.log(`Aggregated: ${r.trips} trips, ${r.points} heat points`);
}
console.log(`Done — ok: ${report.ok.length}, failed: ${report.failed.length}${report.failed.length ? ` (${report.failed.join(', ')})` : ''}`);
process.exit(report.failed.length ? 1 : 0);
