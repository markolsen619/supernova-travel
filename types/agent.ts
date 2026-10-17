/**
 * Ask Nova — mirror of functions/src/agentTypes.ts (separate TS projects; keep in step).
 * Spec: docs/superpowers/specs/2026-10-14-trip-agent-design.md.
 */
import type { ActivityType } from '@/types';

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
  | { kind: 'trip.removePacking'; itemId: string };

export type AgentStatus = 'proposed' | 'applied' | 'partial' | 'dismissed';
export interface AgentQuotaView { used: number; limit: number; fairUse: boolean; resetsAt: string }
export interface AgentResponse { messageId: string; reply: string; operations: AgentOp[]; dropped: number; quota: AgentQuotaView }
export interface AgentMessage { id: string; role: 'user' | 'assistant'; text: string; operations: AgentOp[]; status: AgentStatus | null; createdAt: number }
