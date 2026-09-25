/**
 * Seed the editorial public trips that make Explore and the globe's trending
 * layer look like a product rather than an empty database.
 *
 *   node functions/scripts/seed-public-trips.ts --dry-run
 *   node functions/scripts/seed-public-trips.ts
 *
 * Node 24 strips the types natively and firebase-admin already lives in
 * functions/node_modules, so there is nothing to install.
 *
 * ── Cost ──────────────────────────────────────────────────────────────────
 * Google Places is billed per request at tiered SKUs. This script is written
 * to spend as little as possible:
 *
 *  - Activities use the GROUNDING field mask (id, name, address, location,
 *    address components) — the cheaper Text Search tier. They do NOT request
 *    rating, hours, price level or photos. The place sheet fetches those
 *    lazily when a user actually opens a stop, and services/places/placeCache
 *    then stores the result for every other user, forever.
 *  - Only the 8 destinations request photos, because a trip needs a cover.
 *  - --dry-run makes zero API calls and zero writes. Use it first.
 *  - Document ids are deterministic (`seed-<slug>`), so re-running updates
 *    the same trips instead of duplicating them, and a mistake costs one
 *    re-run rather than a cleanup.
 *
 * ── Authorship ────────────────────────────────────────────────────────────
 * Everything is published from ONE real account you control (AUTHOR_UID).
 * These are editorial itineraries, not invented users: no fabricated
 * profiles, no fake avatars, no astroturfed reviews. Explore shows whoever
 * actually wrote them. Reassigning later is an eight-field update.
 */

import admin from 'firebase-admin';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { SEED_TRIPS, type SeedActivity } from './seedTrips.data.ts';

/** Mark Olsen / @fatwalrus. Change this to move the whole set to another account. */
const AUTHOR_UID = 'Dsmjg2lLzcVJfyRvPkv6bQyjRgS2';

const DRY_RUN = process.argv.includes('--dry-run');
const ONLY = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1] ?? null;

// ── Places ──────────────────────────────────────────────────────────────────

/** Identity and position only — the cheaper Text Search tier. */
const GROUNDING_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.addressComponents',
].join(',');

/** Destinations additionally need a viewport and one photo for the cover. */
const DESTINATION_MASK = [GROUNDING_MASK, 'places.viewport', 'places.photos'].join(',');

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  addressComponents?: { shortText?: string; types?: string[] }[];
  viewport?: { low?: { latitude: number; longitude: number }; high?: { latitude: number; longitude: number } };
  photos?: { name?: string }[];
}

let apiCalls = 0;

function readApiKey(): string {
  const envPath = path.join(process.cwd(), '.env.local');
  const raw = fs.readFileSync(envPath, 'utf8');
  const line = raw.split('\n').find((l) => l.startsWith('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY='));
  if (!line) throw new Error('EXPO_PUBLIC_GOOGLE_MAPS_API_KEY missing from .env.local');
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

async function findPlace(query: string, mask: string, apiKey: string): Promise<RawPlace | null> {
  apiCalls += 1;
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': mask,
    },
    body: JSON.stringify({ textQuery: query, languageCode: 'en', maxResultCount: 1 }),
  });

  if (!res.ok) {
    console.warn(`  ! Places HTTP ${res.status} for "${query}"`);
    return null;
  }
  const json = (await res.json()) as { places?: RawPlace[] };
  return json.places?.[0] ?? null;
}

const countryOf = (p: RawPlace): string | null =>
  p.addressComponents?.find((c) => c.types?.includes('country'))?.shortText ?? null;

const photoUrlOf = (p: RawPlace, apiKey: string): string | null => {
  const name = p.photos?.[0]?.name;
  return name
    ? `https://places.googleapis.com/v1/${name}/media?maxWidthPx=1200&key=${apiKey}`
    : null;
};

// ── Shaping ─────────────────────────────────────────────────────────────────

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const dayDate = (start: Date, index: number) =>
  new Date(start.getTime() + index * 24 * 60 * 60 * 1000);

/** Matches what the app writes — see an existing trip's activity document. */
function activityDoc(
  activity: SeedActivity,
  place: RawPlace | null,
  order: number,
  createdAt: admin.firestore.Timestamp,
) {
  return {
    type: activity.type,
    title: activity.title,
    searchQuery: activity.searchQuery,
    notes: activity.notes,
    startTime: activity.startTime,
    endTime: null,
    durationMinutes: null,
    placeId: place?.id ?? null,
    address: place?.formattedAddress ?? null,
    lat: place?.location?.latitude ?? null,
    lng: place?.location?.longitude ?? null,
    groundingFailedAt: place ? null : createdAt,
    bookingRef: null,
    cost: null,
    currency: null,
    mediaUrls: [],
    order,
    visited: false,
    visitedAt: null,
    createdAt,
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const trips = ONLY ? SEED_TRIPS.filter((t) => slug(t.title) === ONLY) : SEED_TRIPS;
  if (trips.length === 0) {
    console.error(`No trip matches --only=${ONLY}`);
    process.exit(1);
  }

  const activityCount = trips.reduce(
    (n, t) => n + t.days.reduce((m, d) => m + d.activities.length, 0),
    0,
  );

  console.log(`${DRY_RUN ? 'DRY RUN — no API calls, no writes' : 'LIVE'}`);
  console.log(`Author : ${AUTHOR_UID}`);
  console.log(`Trips  : ${trips.length}`);
  console.log(`Stops  : ${activityCount}`);
  console.log(`Places : ~${trips.length + activityCount} requests`);
  console.log('');

  if (DRY_RUN) {
    for (const trip of trips) {
      console.log(`  ${slug(trip.title)}  "${trip.title}"  (${trip.destinationQuery})`);
      for (const [i, day] of trip.days.entries()) {
        console.log(`    Day ${i + 1} — ${day.title}`);
        for (const a of day.activities) console.log(`      ${a.type.padEnd(10)} ${a.searchQuery}`);
      }
    }
    console.log('\nRe-run without --dry-run to write.');
    return;
  }

  const apiKey = readApiKey();

  // Admin credentials come from GOOGLE_APPLICATION_CREDENTIALS. Fail here with
  // an explanation rather than deep inside the first write.
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.error(
      'GOOGLE_APPLICATION_CREDENTIALS is not set.\n\n' +
        '  1. Firebase console > Project settings > Service accounts > Generate new private key\n' +
        '  2. Save it OUTSIDE this repo, e.g. ~/supernova-admin.json\n' +
        '  3. GOOGLE_APPLICATION_CREDENTIALS=~/supernova-admin.json node functions/scripts/seed-public-trips.ts\n' +
        '  4. Delete the key file when you are done.\n\n' +
        'The key grants full database and storage access. Never commit it.',
    );
    process.exit(1);
  }

  admin.initializeApp();
  const db = admin.firestore();
  const now = admin.firestore.Timestamp.now();

  for (const trip of trips) {
    const tripId = `seed-${slug(trip.title)}`;
    console.log(`→ ${tripId}`);

    const destPlace = await findPlace(trip.destinationQuery, DESTINATION_MASK, apiKey);
    if (!destPlace?.location) {
      console.warn(`  ! could not ground "${trip.destinationQuery}" — skipping this trip`);
      continue;
    }

    const start = dayDate(new Date(), trip.startsInDays);
    const end = dayDate(start, trip.days.length - 1);

    const batch = db.batch();

    batch.set(db.collection('trips').doc(tripId), {
      authorUid: AUTHOR_UID,
      title: trip.title,
      description: trip.description,
      destination: {
        name: destPlace.displayName?.text ?? trip.destinationQuery,
        placeId: destPlace.id ?? null,
        lat: destPlace.location.latitude,
        lng: destPlace.location.longitude,
        countryCode: countryOf(destPlace),
        bounds: destPlace.viewport?.low && destPlace.viewport?.high
          ? {
              sw: [destPlace.viewport.low.longitude, destPlace.viewport.low.latitude],
              ne: [destPlace.viewport.high.longitude, destPlace.viewport.high.latitude],
            }
          : null,
      },
      additionalDestinations: [],
      collaborators: [],
      coverImageUrl: photoUrlOf(destPlace, apiKey),
      visibility: 'public',
      status: 'planning',
      // Hand-written, not generated. The badge would be a lie.
      isAiGenerated: false,
      tags: trip.tags,
      likesCount: 0,
      savesCount: 0,
      budgetAmount: null,
      budgetCurrency: null,
      startDate: admin.firestore.Timestamp.fromDate(start),
      endDate: admin.firestore.Timestamp.fromDate(end),
      createdAt: now,
      updatedAt: now,
    });

    for (const [dayIndex, day] of trip.days.entries()) {
      const dayRef = db.collection('trips').doc(tripId).collection('days').doc(`day-${dayIndex + 1}`);
      batch.set(dayRef, {
        dayNumber: dayIndex + 1,
        title: day.title,
        notes: day.notes,
        date: admin.firestore.Timestamp.fromDate(dayDate(start, dayIndex)),
        destinationIndex: null,
        createdAt: now,
      });

      for (const [i, activity] of day.activities.entries()) {
        const place = await findPlace(activity.searchQuery, GROUNDING_MASK, apiKey);
        if (!place) console.warn(`    ! ungrounded: ${activity.searchQuery}`);
        batch.set(
          dayRef.collection('activities').doc(`stop-${i + 1}`),
          activityDoc(activity, place, (i + 1) * 1000, now),
        );
      }
      console.log(`  day ${dayIndex + 1} — ${day.activities.length} stops`);
    }

    await batch.commit();
  }

  console.log(`\nDone. ${apiCalls} Places requests made.`);
  console.log('Algolia syncs itself via syncTripToAlgolia on write.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
