/** The server's Year in Travel summary (functions/src/yearInTravel.ts — a separate TypeScript project, same shape). */
export interface YearSummary {
  year: number; trips: number; daysAway: number; cities: number; countries: number; km: number;
  longestTrip: { tripId: string; title: string; days: number } | null;
  biggestDay: { tripId: string; title: string; dayNumber: number; stops: number } | null;
  typeCounts: Record<'restaurant' | 'activity' | 'hotel' | 'flight' | 'transport' | 'free', number>;
  topStyle: string | null;
  places: { name: string; lat: number; lng: number }[];
  photos: string[];
  companions: { uid: string; name: string; avatarUrl: string | null }[];
  nextTrip: { tripId: string; title: string; startMs: number } | null;
  computedAtMs: number;
}
