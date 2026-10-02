import * as admin from 'firebase-admin';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { budgetMigration } from './budgetPrivacy';

const db = admin.firestore();

/**
 * Keeps a trip's budget off the trip document, where every viewer could read
 * it. Moves what an older app wrote into trips/{id}/private/budget and deletes
 * the fields; a trip without them is left alone, so this write can't loop.
 */
export const moveTripBudgetPrivate = onDocumentWritten('trips/{tripId}', async (event) => {
  const after = event.data?.after;
  if (!after?.exists) return;
  const { strip, budget } = budgetMigration(after.data());
  if (!strip) return;
  const batch = db.batch();
  if (budget) {
    batch.set(after.ref.collection('private').doc('budget'), {
      ...budget,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }
  batch.update(after.ref, {
    budgetAmount: admin.firestore.FieldValue.delete(),
    budgetCurrency: admin.firestore.FieldValue.delete(),
  });
  await batch.commit();
});
