import type { GenerateTripRequest, GeneratedTrip } from './types';
import { resolveTripVisibility } from './promptRules';

/**
 * The documents an AI trip becomes — shared by generateTrip and the
 * editorial seed script (scripts/seed-destinations.mjs) so a seeded trip is
 * indistinguishable from one a traveler generated. Pure: timestamps come in
 * as `now`, nothing touches Firestore here.
 */
export function parseGeneratedTrip(text: string): GeneratedTrip | null {
  const jsonStr = text.replace(/^```json\s*/m, '').replace(/\s*```$/m, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return null;
  }
  const g = parsed as Partial<GeneratedTrip>;
  if (!g || typeof g.title !== 'string' || !Array.isArray(g.days)) return null;
  return g as GeneratedTrip;
}

export function tripDocuments(
  uid: string,
  data: GenerateTripRequest,
  generated: GeneratedTrip,
  now: unknown,
  extra: Record<string, unknown> = {},
) {
  const trip = {
    authorUid: uid,
    title: generated.title,
    description: generated.description ?? '',
    ...(data.additionalDestinations.length > 0 && typeof generated.region === 'string' && generated.region.trim()
      ? { regionName: generated.region.trim().slice(0, 60) }
      : {}),
    coverImageUrl: null,
    destination: {
      name: data.destination,
      placeId: null,
      lat: null,
      lng: null,
      countryCode: data.countryCode || null,
      bounds: null,
    },
    additionalDestinations: data.additionalDestinations ?? [],
    startDate: null as unknown,
    endDate: null as unknown,
    visibility: resolveTripVisibility(data.visibility),
    collaborators: [],
    budgetAmount: null,
    budgetCurrency: null,
    isAiGenerated: true,
    status: 'planning' as const,
    tags: [],
    likesCount: 0,
    savesCount: 0,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };

  const days = generated.days.map((day) => ({
    day: {
      dayNumber: day.dayNumber,
      destinationIndex: typeof day.destinationIndex === 'number' ? day.destinationIndex : null,
      date: null,
      title: day.title ?? '',
      notes: day.notes ?? '',
      createdAt: now,
    },
    activities: (day.activities ?? []).map((act, idx) => ({
      // Every optional field defaults to null: Firestore rejects undefined,
      // and a stop Gemini left partial used to fail the whole write.
      type: act.type ?? 'activity',
      title: act.title ?? '',
      placeId: null,
      address: act.address ?? null,
      lat: null,
      lng: null,
      startTime: act.startTime ?? null,
      endTime: act.endTime ?? null,
      durationMinutes: null,
      notes: [act.rationale, act.notes].filter(Boolean).join(' — '),
      bookingRef: null,
      cost: act.cost ?? null,
      currency: act.currency ?? null,
      mediaUrls: [],
      order: idx * 1000,
      createdAt: now,
      searchQuery: act.searchQuery ?? null,
      visited: false,
      visitedAt: null,
      groundingFailedAt: null,
    })),
  }));

  return { trip, days };
}
