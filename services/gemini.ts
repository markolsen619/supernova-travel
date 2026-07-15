import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { GenerateTripRequest, AiTripQuota } from '@/types/ai';

export async function callGenerateTrip(
  request: GenerateTripRequest
): Promise<{ tripId: string }> {
  const fn = httpsCallable<GenerateTripRequest, { tripId: string }>(
    functions,
    'generateTrip'
  );
  const result = await fn(request);
  return result.data;
}

export async function callGetAiTripQuota(): Promise<AiTripQuota> {
  const fn = httpsCallable<undefined, AiTripQuota>(functions, 'getAiTripQuota');
  const result = await fn();
  return result.data;
}
