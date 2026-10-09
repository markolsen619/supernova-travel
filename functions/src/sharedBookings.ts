/**
 * Bookings shared with a trip's members. The wallet documents stay owner-only
 * (rules can't hide one field, and a boarding pass barcode must never leave its
 * owner); a trigger keeps a copy of each shared booking at
 * `trips/{tripId}/bookings/{kind}_{id}` holding only the fields below. Pure —
 * no firebase-admin — so it is unit-tested.
 */
export type BookingKind = 'boarding_pass' | 'reservation';

/**
 * What members may see. A whitelist, so a field added to bookings later stays
 * private until it is added here. Left out on purpose: barcode/barcodeFormat
 * and a pass's confirmationCode (the airline record locator manages the
 * booking), a reservation's notes and attachments, and wallet bookkeeping.
 */
const SHARED_FIELDS: Record<BookingKind, readonly string[]> = {
  boarding_pass: [
    'airline', 'flightNumber', 'origin', 'originCity', 'destination', 'destinationCity',
    'departureTime', 'arrivalTime', 'seat', 'boardingGroup', 'gate', 'terminal', 'status',
    'localDate', 'placeCity', 'placeCountryCode', 'originCountryCode', 'createdAt',
  ],
  reservation: [
    'type', 'title', 'confirmationCode', 'checkIn', 'checkOut', 'time', 'address',
    'transitMode', 'operator', 'fromPlace', 'toPlace', 'departureLocalTime', 'arrivalLocalTime', 'seat',
    'originCity', 'originCountryCode', 'placeCity', 'placeCountryCode', 'createdAt',
  ],
};

export function mirrorId(kind: BookingKind, id: string): string {
  return `${kind}_${id}`;
}

/** The trip this booking is shared with, or null. Sharing is on unless switched off. */
export function sharedTripId(data: Record<string, any> | undefined): string | null {
  if (!data || data.sharedWithTrip === false) return null;
  return typeof data.tripId === 'string' && data.tripId ? data.tripId : null;
}

/**
 * Where a write should leave this booking's copy. Nothing if its owner field
 * changed: rules forbid that, and a copy must never show a booking under the
 * name of someone who didn't make it.
 */
export function shareTarget(before: Record<string, any> | undefined, after: Record<string, any> | undefined): string | null {
  if (before && after && before.ownerUid !== after.ownerUid) return null;
  return sharedTripId(after);
}

export function sharedCopy(kind: BookingKind, id: string, data: Record<string, any>, ownerName: string): Record<string, unknown> {
  const copy: Record<string, unknown> = { kind, id, ownerUid: data.ownerUid, ownerName, tripId: data.tripId };
  for (const field of SHARED_FIELDS[kind]) {
    if (data[field] !== undefined && data[field] !== null) copy[field] = data[field];
  }
  return copy;
}

export function tripMembers(trip: Record<string, any> | undefined): Set<string> {
  if (!trip) return new Set();
  return new Set([trip.authorUid, ...((trip.collaborators ?? []) as string[])].filter((u): u is string => !!u));
}

/**
 * Which copies a trip should hold: shared bookings whose owner is still a
 * member. Everything else under the trip goes — a member who left, a booking
 * switched off or moved, a deleted trip (no members).
 */
export function mirrorPlan(
  bookings: { id: string; ownerUid: string; shared: boolean }[],
  existing: string[],
  members: Set<string>,
): { write: string[]; remove: string[] } {
  const write = bookings.filter((b) => b.shared && members.has(b.ownerUid)).map((b) => b.id);
  const keep = new Set(write);
  return { write, remove: existing.filter((id) => !keep.has(id)) };
}
