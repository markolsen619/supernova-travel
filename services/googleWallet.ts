import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

/** A signed "Save to Google Wallet" JWT for one of your boarding passes (functions/src/googleWalletFunctions.ts). */
export async function getGoogleWalletJwt(passId: string): Promise<string> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  const fn = httpsCallable<{ passId: string; timeZone: string | null }, { jwt: string }>(functions, 'googleWalletJwt');
  return (await fn({ passId, timeZone })).data.jwt;
}
