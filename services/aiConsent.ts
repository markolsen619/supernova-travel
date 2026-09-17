import { deleteField, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAiConsentStore } from '@/stores/useAiConsentStore';
import { AI_CONSENT_VERSION } from '@/utils/aiConsent';

/**
 * Records permission to send personal data to Gemini. Awaited before the AI
 * call that follows, because the server checks the same field
 * (functions/src/aiConsent.ts) and would refuse a call that raced ahead of it.
 */
export async function grantAiConsent(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    aiConsentVersion: AI_CONSENT_VERSION,
    aiConsentAt: serverTimestamp(),
  });
  useAiConsentStore.getState().setVersion(AI_CONSENT_VERSION);
}

/** Withdraws it (Settings → Privacy). AI features ask again next time. */
export async function withdrawAiConsent(uid: string): Promise<void> {
  await updateDoc(doc(db, 'users', uid), {
    aiConsentVersion: deleteField(),
    aiConsentAt: deleteField(),
  });
  useAiConsentStore.getState().setVersion(null);
}
