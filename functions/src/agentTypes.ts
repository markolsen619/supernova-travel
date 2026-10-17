/**
 * Ask Nova — the agent's operation and response types (docs/superpowers/specs/2026-10-14-trip-agent-design.md).
 * Mirrored by types/agent.ts in the app (separate TS projects — keep in step). Pure.
 */
export type AgentSurface = 'trip';
export const AGENT_SURFACES: readonly AgentSurface[] = ['trip'];
export const ACTIVITY_TYPES = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** Reservation types Nova may add. `transit` is stored as `activity` + transitMode (never a new enum). */
export const WALLET_RES_TYPES = ['hotel', 'restaurant', 'activity', 'rental_car', 'transit'] as const;
export type WalletResType = (typeof WALLET_RES_TYPES)[number];

export type AgentOp =
  | { kind: 'trip.addStop'; dayId: string; title: string; type: ActivityType; afterStopId: string | null; time: string | null; query: string | null }
  | { kind: 'trip.removeStop'; dayId: string; stopId: string }
  | { kind: 'trip.moveStop'; dayId: string; stopId: string; toDayId: string; afterStopId: string | null }
  | { kind: 'trip.reorderDay'; dayId: string; stopIds: string[] }
  | { kind: 'trip.updateStop'; dayId: string; stopId: string; time?: string | null; notes?: string }
  | { kind: 'trip.setNights'; city: number; nights: number }
  | { kind: 'trip.addCity'; name: string; nights: number; afterCity: number | null }
  | { kind: 'trip.removeCity'; city: number; mode: 'delete' | 'move' }
  | { kind: 'trip.moveCity'; city: number; by: -1 | 1 }
  | { kind: 'trip.shiftDates'; newStart: string }
  | { kind: 'trip.editStop'; dayId: string; stopId: string; title?: string; type?: ActivityType; time?: string | null; endTime?: string | null; durationMinutes?: number | null; notes?: string; query?: string }
  | { kind: 'trip.optimizeDay'; dayId: string }
  | { kind: 'trip.swapDays'; dayId: string; withDayId: string }
  | { kind: 'trip.updateTrip'; title?: string; description?: string; visibility?: 'public' | 'followers' | 'private' }
  | { kind: 'trip.addPacking'; label: string; category: string }
  | { kind: 'trip.checkPacking'; itemId: string; checked: boolean }
  | { kind: 'trip.removePacking'; itemId: string }
  | { kind: 'wallet.addReservation'; type: WalletResType; transitMode?: 'train' | 'bus' | 'ferry'; title: string; date: string; time: string | null; endDate: string | null; confirmationCode: string | null }
  | { kind: 'wallet.linkBooking'; bookingKind: 'boarding_pass' | 'reservation'; bookingId: string }
  | { kind: 'wallet.unlinkBooking'; bookingKind: 'boarding_pass' | 'reservation'; bookingId: string }
  | { kind: 'wallet.updateBooking'; bookingKind: 'reservation'; bookingId: string; title?: string; date?: string; time?: string | null; confirmationCode?: string };

/** Which capability an app must declare to be sent each operation. */
export const OP_CAPABILITY: Record<AgentOp['kind'], string> = {
  'trip.addStop': 'trip.v1', 'trip.removeStop': 'trip.v1', 'trip.moveStop': 'trip.v1',
  'trip.reorderDay': 'trip.v1', 'trip.updateStop': 'trip.v1', 'trip.setNights': 'trip.v1',
  'trip.addCity': 'trip.v1', 'trip.removeCity': 'trip.v1', 'trip.moveCity': 'trip.v1',
  'trip.shiftDates': 'trip.v1',
  // Phase 2 (2026-10-16): apps from 1.0.7 declare trip.v2.
  'trip.editStop': 'trip.v2', 'trip.optimizeDay': 'trip.v2', 'trip.swapDays': 'trip.v2', 'trip.updateTrip': 'trip.v2',
  'trip.addPacking': 'trip.v2', 'trip.checkPacking': 'trip.v2', 'trip.removePacking': 'trip.v2',
  'wallet.addReservation': 'wallet.v1', 'wallet.linkBooking': 'wallet.v1', 'wallet.unlinkBooking': 'wallet.v1', 'wallet.updateBooking': 'wallet.v1',
};

export type AgentStatus = 'proposed' | 'applied' | 'partial' | 'dismissed';
export interface AgentQuotaView { used: number; limit: number; fairUse: boolean; resetsAt: string }
export interface AgentResponse { messageId: string; reply: string; operations: AgentOp[]; dropped: number; quota: AgentQuotaView }
