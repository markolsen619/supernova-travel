import type { BoardingPass, Reservation } from '@/types';
import { reservationKind, type TripBooking } from '@/utils/bookingDays';
import { formatCalendarDate } from '@/utils/calendarDate';

/**
 * Trip members' bookings, read from the barcode-free copies at
 * `trips/{tripId}/bookings/{kind}_{id}` (functions/src/sharedBookings.ts).
 * Read-only: they open `/(wallet)/shared-booking`, never the owner's screens.
 */
export function fromSharedDoc(data: Record<string, any>): TripBooking | null {
  if (typeof data.id !== 'string' || !data.id) return null;
  const sharedBy = { uid: String(data.ownerUid ?? ''), name: String(data.ownerName ?? ''), tripId: String(data.tripId ?? '') };
  if (data.kind === 'boarding_pass') return { kind: 'boarding_pass', item: data as BoardingPass, sharedBy };
  if (data.kind === 'reservation') return { kind: 'reservation', item: data as Reservation, sharedBy };
  return null;
}

/** Your bookings plus other members' — never a copy of one of your own. */
export function mergeTripBookings(own: TripBooking[], shared: TripBooking[], myUid: string): TripBooking[] {
  return [...own, ...shared.filter((b) => b.sharedBy && b.sharedBy.uid !== myUid)];
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || 'A traveler';
}

export function bookingRoute(b: TripBooking): string {
  if (b.sharedBy) return `/(wallet)/shared-booking?tripId=${b.sharedBy.tripId}&id=${b.kind}_${b.item.id}`;
  return b.kind === 'boarding_pass' ? `/(wallet)/boarding-pass/${b.item.id}` : `/(wallet)/reservation/${b.item.id}`;
}

const day = (iso?: string) => (iso ? formatCalendarDate(iso, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }) : '');

/** The read-only screen's rows. A shared flight has no barcode or booking reference to show. */
export function sharedDetailRows(b: TripBooking): { label: string; value: string }[] {
  const rows: { label: string; value: string | undefined }[] = [];
  if (b.kind === 'boarding_pass') {
    const p = b.item;
    rows.push(
      { label: 'Flight', value: [p.airline, p.flightNumber].filter(Boolean).join(' ') },
      { label: 'Route', value: p.origin && p.destination ? `${p.origin} → ${p.destination}` : undefined },
      { label: 'Seat', value: p.seat },
      { label: 'Gate', value: p.gate },
    );
  } else {
    const r = b.item;
    rows.push({ label: 'Confirmation code', value: r.confirmationCode });
    if (reservationKind(r) === 'transit') {
      rows.push(
        { label: 'Operator', value: r.operator },
        { label: 'From', value: r.fromPlace },
        { label: 'To', value: r.toPlace },
        { label: 'Departs', value: r.checkIn ? [day(r.checkIn), r.departureLocalTime].filter(Boolean).join(' · ') : undefined },
        { label: 'Arrives', value: r.arrivalLocalTime },
        { label: 'Seat', value: r.seat },
      );
    } else {
      rows.push({ label: 'Check-in', value: day(r.checkIn) }, { label: 'Time', value: r.time }, { label: 'Check-out', value: day(r.checkOut) });
    }
    rows.push({ label: 'Address', value: r.address });
  }
  return rows.filter((r): r is { label: string; value: string } => !!r.value);
}
