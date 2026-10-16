// __tests__/functions/agentQuota.test.ts
import {
  agentQuotaPolicy, agentHourKey, agentGate,
  AGENT_FREE_MONTHLY, AGENT_PAID_MONTHLY, AGENT_HOURLY_LIMIT,
} from '../../functions/src/quotaUtils';

const now = new Date('2026-10-14T15:20:00Z');

describe('agentQuotaPolicy', () => {
  it('gives free accounts a small monthly allowance that is shown', () => {
    const p = agentQuotaPolicy('free', now);
    expect(p).toMatchObject({ limit: AGENT_FREE_MONTHLY, fairUse: false, quotaKey: 'agent_2026-10-01' });
    expect(p.resetsAt.toISOString()).toBe('2026-11-01T00:00:00.000Z');
  });
  it('gives Pro and business a fair-use ceiling on a separate counter', () => {
    expect(agentQuotaPolicy('pro', now)).toMatchObject({ limit: AGENT_PAID_MONTHLY, fairUse: true, quotaKey: 'agent_pro_2026-10-01' });
    expect(agentQuotaPolicy('business', now).limit).toBe(AGENT_PAID_MONTHLY);
  });
  it('treats unknown or missing tiers as free', () => {
    expect(agentQuotaPolicy(undefined, now).limit).toBe(AGENT_FREE_MONTHLY);
    expect(agentQuotaPolicy('platinum', now).limit).toBe(AGENT_FREE_MONTHLY);
  });
});

describe('agentHourKey', () => {
  it('names the UTC hour', () => {
    expect(agentHourKey(now)).toBe('agent_hour_2026-10-14T15');
  });
});

describe('agentGate', () => {
  const base = { used: 0, limit: 10, hourCount: 0, inflightUntil: null, now: now.getTime() };
  it('lets a normal request through', () => {
    expect(agentGate(base)).toBe('ok');
  });
  it('refuses at the monthly limit', () => {
    expect(agentGate({ ...base, used: 10 })).toBe('monthly');
  });
  it('refuses past the hourly limit', () => {
    expect(agentGate({ ...base, hourCount: AGENT_HOURLY_LIMIT })).toBe('hourly');
  });
  it('refuses while another request is in flight, but not after it has expired', () => {
    expect(agentGate({ ...base, inflightUntil: base.now + 1000 })).toBe('busy');
    expect(agentGate({ ...base, inflightUntil: base.now - 1 })).toBe('ok');
  });
  it('reports the monthly limit before the others', () => {
    expect(agentGate({ ...base, used: 10, hourCount: 99, inflightUntil: base.now + 1000 })).toBe('monthly');
  });
});
