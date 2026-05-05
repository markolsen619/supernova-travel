import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';

const ALGOLIA_APP_ID = process.env.ALGOLIA_APP_ID ?? '';
const ALGOLIA_ADMIN_KEY = process.env.ALGOLIA_ADMIN_KEY ?? '';

async function algoliaRequest(
  method: string,
  indexName: string,
  objectId: string,
  body?: object
): Promise<void> {
  if (!ALGOLIA_APP_ID || !ALGOLIA_ADMIN_KEY) return;
  const url = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/${indexName}/${objectId}`;
  await fetch(url, {
    method,
    headers: {
      'X-Algolia-Application-Id': ALGOLIA_APP_ID,
      'X-Algolia-API-Key': ALGOLIA_ADMIN_KEY,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Sync trips to Algolia
export const syncTripToAlgolia = onDocumentWritten('trips/{tripId}', async (event) => {
  const tripId = event.params.tripId;
  const after = event.data?.after;

  if (!after?.exists) {
    // Document deleted
    await algoliaRequest('DELETE', 'trips', tripId);
    return;
  }

  const data = after.data()!;
  if (data.visibility !== 'public') {
    // Remove non-public trips from search index
    await algoliaRequest('DELETE', 'trips', tripId);
    return;
  }

  await algoliaRequest('PUT', 'trips', tripId, {
    objectID: tripId,
    title: data.title,
    destination: data.destination?.name ?? '',
    authorUid: data.authorUid,
    status: data.status,
    coverImageUrl: data.coverImageUrl ?? null,
  });
});

// Sync users to Algolia
export const syncUserToAlgolia = onDocumentWritten('users/{uid}', async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;

  if (!after?.exists) {
    await algoliaRequest('DELETE', 'users', uid);
    return;
  }

  const data = after.data()!;
  await algoliaRequest('PUT', 'users', uid, {
    objectID: uid,
    displayName: data.displayName ?? '',
    username: data.username ?? '',
    avatarUrl: data.avatarUrl ?? null,
    followersCount: data.followersCount ?? 0,
  });
});

// Suppress unused import warning — admin is initialised in index.ts
void (admin.app);
