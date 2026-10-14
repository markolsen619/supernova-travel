/**
 * The agent's surfaces (docs/superpowers/specs/2026-10-14-trip-agent-design.md, "Built to grow").
 * Phase 1 has one: 'trip'. A new surface adds its context builder and validator and an entry here.
 * Pure: no firebase-admin.
 */
import { AGENT_SURFACES, OP_CAPABILITY, type AgentOp, type AgentSurface } from './agentTypes';

export function isAgentSurface(v: unknown): v is AgentSurface {
  return typeof v === 'string' && (AGENT_SURFACES as readonly string[]).includes(v);
}

export function threadId(surface: AgentSurface, subjectId: string): string {
  return `${surface}_${subjectId}`;
}

/** Only operations the calling app declared it can apply — shipped apps survive every later expansion. */
export function filterByCapabilities(ops: AgentOp[], capabilities: unknown): AgentOp[] {
  if (!Array.isArray(capabilities)) return [];
  const caps = new Set(capabilities.filter((c): c is string => typeof c === 'string'));
  return ops.filter((o) => caps.has(OP_CAPABILITY[o.kind]));
}
