import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';
import { GenerateTripRequest } from '@/types/ai';

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
