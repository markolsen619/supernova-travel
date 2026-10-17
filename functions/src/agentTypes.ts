/**
 * Ask Nova — the agent's operation and response types (docs/superpowers/specs/2026-10-14-trip-agent-design.md).
 * Mirrored by types/agent.ts in the app (separate TS projects — keep in step). Pure.
 */
export type AgentSurface = 'trip';
export const AGENT_SURFACES: readonly AgentSurface[] = ['trip'];
export const ACTIVITY_TYPES = ['flight', 'hotel', 'restaurant', 'activity', 'transport', 'free'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

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
  | { kind: 'trip.shiftDates'; newStart: string };

/** Which capability an app must declare to be sent each operation. */
export const OP_CAPABILITY: Record<AgentOp['kind'], string> = {
  'trip.addStop': 'trip.v1', 'trip.removeStop': 'trip.v1', 'trip.moveStop': 'trip.v1',
  'trip.reorderDay': 'trip.v1', 'trip.updateStop': 'trip.v1', 'trip.setNights': 'trip.v1',
  'trip.addCity': 'trip.v1', 'trip.removeCity': 'trip.v1', 'trip.moveCity': 'trip.v1',
  'trip.shiftDates': 'trip.v1',
};

export type AgentStatus = 'proposed' | 'applied' | 'partial' | 'dismissed';
export interface AgentQuotaView { used: number; limit: number; fairUse: boolean; resetsAt: string }
export interface AgentResponse { messageId: string; reply: string; operations: AgentOp[]; dropped: number; quota: AgentQuotaView }
