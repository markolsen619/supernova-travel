import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

/** A 5-minute link to this boarding pass's Apple Wallet file (functions/src/appleWalletFunctions.ts). */
export async function getAppleWalletLink(passId: string): Promise<string> {
  const res = await httpsCallable<{ passId: string }, { url: string }>(functions, 'appleWalletLink')({ passId });
  return res.data.url;
}
