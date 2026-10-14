import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';
import type { AgentQuotaView, AgentResponse } from '@/types/agent';

/** What this build can apply (spec "Built to grow"): the server never sends an operation outside it. */
export const AGENT_CAPABILITIES = ['trip.v1'];

export async function askAgent(a: { surface: 'trip'; subjectId: string; message: string; requestId: string }): Promise<AgentResponse> {
  const call = httpsCallable<object, AgentResponse>(functions, 'agent', { timeout: 60_000 });
  const res = await call({ ...a, capabilities: AGENT_CAPABILITIES });
  return res.data;
}

export async function fetchAgentQuota(): Promise<AgentQuotaView> {
  const res = await httpsCallable<object, AgentQuotaView>(functions, 'getAgentQuota')({});
  return res.data;
}
