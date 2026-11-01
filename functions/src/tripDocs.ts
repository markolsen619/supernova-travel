import { resolveTravelStyles } from './promptRules';
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

const STOP_TYPES = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] as const;
const REST = /^(free|free time|relax|relaxing|rest|leisure|downtime|break|chill)$/i;

/**
 * A stop type the shipped apps know. They look a stop's icon up by its type and crash on any other value: the AI
 * once wrote a travel style ("relax") as the type and every app crashed opening that trip (2026-10-31). Rest-like
 * words become free time; anything else an activity.
 */
export function storedActivityType(raw: unknown): (typeof STOP_TYPES)[number] {
  const t = typeof raw === 'string' ? raw.trim() : '';
  if ((STOP_TYPES as readonly string[]).includes(t)) return t as (typeof STOP_TYPES)[number];
  return REST.test(t) ? 'free' : 'activity';
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
    // The place the traveler picked, when the app sent it — never re-guessed
    // from the name, which for "Washington" meant the state, not DC.
    destination: {
      name: data.destination,
      placeId: typeof data.placeId === 'string' && data.placeId ? data.placeId : null,
      lat: typeof data.lat === 'number' && Number.isFinite(data.lat) ? data.lat : null,
      lng: typeof data.lng === 'number' && Number.isFinite(data.lng) ? data.lng : null,
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
    // The styles it was planned for: trip cards label them (2026-10-17). Older apps ignore the field.
    travelStyles: resolveTravelStyles(data),
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
      type: storedActivityType(act.type),
      title: act.title ?? '',
      placeId: null,
      address: act.address ?? null,
      lat: null,
      lng: null,
      // No preset clock times (2026-10-09): the day's order is the plan; a time comes from you or from a
      // matching wallet booking (utils/stopTime.ts). Older prompts still return them, so they're dropped here.
      startTime: null,
      endTime: null,
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
