import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOwnAndJoinedTrips } from '@/hooks/useTripList';
import { useTrip } from '@/hooks/useTrip';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { useWishlist } from '@/hooks/useWishlist';
import { homeTrips, tripSpan } from '@/utils/homeState';
import { toCalendarDate } from '@/utils/calendarDate';
import { dayDateFor } from '@/utils/tripTours';
import { addDays } from '@/utils/pastTrip';
import { stopTime } from '@/utils/stopTime';
import { flightClock } from '@/utils/airportTime';
import { topSavedCity } from '@/utils/wishlist';
import { widgetFlightPass, type WidgetInput } from '@/utils/widgetTimeline';
import { writeWidget } from '@/services/widgetData';

/**
 * Keeps the Home Screen widget current (spec docs/superpowers/specs/2026-11-12-packing-holidays-widget-design.md):
 * builds its input from data the app already loads — the trip under way or next, its next two days of stops, the next
 * flight, the top wish-list city — and writes the next 48 h whenever that changes or the app comes to the front.
 * Mounted once in the tabs layout. Nothing is fetched for it and nothing leaves the phone.
 */
export function useWidgetSync(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const { data: trips = [] } = useOwnAndJoinedTrips(uid);
  const { boardingPasses } = useBoardingPasses();
  const { saves } = useWishlist();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') setTick((t) => t + 1); });
    return () => sub.remove();
  }, []);

  const today = toCalendarDate(new Date());
  const lead = useMemo(() => { const h = homeTrips(trips, today); return h.today ?? h.next ?? null; }, [trips, today]);
  const { data: leadTrip } = useTrip(lead?.id ?? null);

  const input = useMemo<WidgetInput | null>(() => {
    if (!uid) return null;
    let trip: WidgetInput['trip'] = null;
    if (lead) {
      const { start, end } = tripSpan(lead as never);
      const cities = [lead.destination, ...(lead.additionalDestinations ?? [])];
      const window = [today, addDays(today, 1), addDays(today, 2)];
      const days = (leadTrip?.days ?? [])
        .map((d) => ({ d, date: dayDateFor(start, d.dayNumber) }))
        .filter((x): x is { d: typeof x.d; date: string } => !!x.date && window.includes(x.date))
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(({ d, date }) => ({
          date,
          city: (cities[d.destinationIndex ?? 0] ?? lead.destination).name.split(',')[0],
          weather: null,
          stops: [...d.activities].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map((a) => ({ title: a.title, time: stopTime(a, null).time, visited: !!a.visited })),
        }));
      trip = { id: lead.id, title: lead.title, start, end, coverKey: lead.coverImageUrl ? `cover-${lead.id}` : null, days };
    }
    const p = widgetFlightPass(boardingPasses, Date.now());
    const flight: WidgetInput['flight'] = p ? {
      id: p.id,
      flightNumber: p.flightNumber,
      route: `${p.origin} → ${p.destination}`,
      departMs: Date.parse(p.departureTime) + Math.max(0, p.delayMinutes ?? 0) * 60_000,
      departLocal: flightClock(p.departureTime, p.origin)?.time ?? '',
      gate: p.gate || null,
      status: p.delayMinutes && p.delayMinutes >= 15 ? `Delayed ${p.delayMinutes} min` : null,
    } : null;
    return { trip, flight, wishCity: topSavedCity(saves)?.city ?? null };
    // tick: re-run on returning to the app, so the 48 h window rolls forward.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, lead, leadTrip, boardingPasses, saves, today, tick]);

  const key = useMemo(() => (input ? JSON.stringify(input) : null), [input]);
  // Only key-less photo URLs: a keyed Places URL is billed on every load (CLAUDE.md, Cover refresh).
  const cover = lead?.coverImageUrl && !lead.coverImageUrl.includes('key=') ? lead.coverImageUrl : null;
  useEffect(() => {
    if (input) writeWidget(input, cover);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, cover, tick]);
}
