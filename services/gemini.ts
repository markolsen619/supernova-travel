import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { normalizeAiTripQuota } from '@/utils/aiTripQuota';
import type { MatchResult } from '@/utils/walletLink';
import { GenerateTripRequest, AiTripQuota, ParseTravelConfirmationRequest, ParseTravelConfirmationResult, ImportQuota } from '@/types/ai';

export async function callGenerateTrip(
  request: GenerateTripRequest
): Promise<{ tripId: string }> {
  const fn = httpsCallable<GenerateTripRequest, { tripId: string }>(
    functions,
    'generateTrip',
    { timeout: 180000 }
  );
  const result = await fn(request);
  return result.data;
}

export async function callGetAiTripQuota(): Promise<AiTripQuota> {
  const fn = httpsCallable<undefined, Parameters<typeof normalizeAiTripQuota>[0]>(functions, 'getAiTripQuota');
  const result = await fn();
  return normalizeAiTripQuota(result.data);
}

export async function callParseTravelConfirmation(
  request: ParseTravelConfirmationRequest
): Promise<ParseTravelConfirmationResult> {
  const fn = httpsCallable<ParseTravelConfirmationRequest, ParseTravelConfirmationResult>(
    functions,
    'parseTravelConfirmation',
    { timeout: 60000 }
  );
  const result = await fn(request);
  return result.data;
}

export async function callGetImportQuota(): Promise<ImportQuota> {
  const fn = httpsCallable<undefined, ImportQuota>(functions, 'getImportQuota');
  const result = await fn();
  return result.data;
}

/** Asks the server which trip a just-saved booking belongs to (Pro; free → none). */
export async function callMatchBooking(kind: 'boarding_pass' | 'reservation', id: string): Promise<MatchResult> {
  const fn = httpsCallable<{ kind: string; id: string }, MatchResult>(functions, 'matchBooking');
  return (await fn({ kind, id })).data;
}
