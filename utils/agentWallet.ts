/**
 * Wallet documents from Nova's wallet.v1 operations (docs/superpowers/specs/2026-10-16-nova-phase2-design.md §5). Pure.
 * Stored types follow the "never a new enum" rule: transit is `activity` + transitMode, as the importers write it.
 */
import type { Reservation } from '@/types';
import type { AgentOp } from '@/types/agent';

type AddOp = Extract<AgentOp, { kind: 'wallet.addReservation' }>;
type UpdateOp = Extract<AgentOp, { kind: 'wallet.updateBooking' }>;

/** A new reservation. Linked to the trip only for paid accounts (rules: walletCreateLinkAllowed); free → wallet only. */
export function reservationFromOp(op: AddOp, a: { uid: string; tripId: string; paid: boolean; nowIso: string }): Omit<Reservation, 'id'> {
  const transit = op.type === 'transit';
  const doc: Omit<Reservation, 'id'> = {
    ownerUid: a.uid,
    type: transit ? 'activity' : op.type,
    title: op.title,
    confirmationCode: op.confirmationCode ?? '',
    checkIn: op.date,
    createdAt: a.nowIso,
  };
  if (op.endDate) doc.checkOut = op.endDate;
  if (op.time) doc.time = op.time;
  if (transit) {
    doc.transitMode = op.transitMode ?? 'train';
    if (op.time) doc.departureLocalTime = op.time;
  }
  if (a.paid) Object.assign(doc, { tripId: a.tripId, tripLink: 'manual', tripSuggestions: [], tripLinkDismissed: false });
  return doc;
}

/** Fields of a reservation update (boarding passes are never edited by Nova). */
export function bookingPatch(op: UpdateOp): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  if (op.title !== undefined) patch.title = op.title;
  if (op.date !== undefined) patch.checkIn = op.date;
  if (op.time !== undefined) patch.time = op.time;
  if (op.confirmationCode !== undefined) patch.confirmationCode = op.confirmationCode;
  return patch;
}
