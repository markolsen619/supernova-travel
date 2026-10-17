/**
 * Client mirror of functions/src/aiConsent.ts — keep AI_CONSENT_VERSION in
 * step with it. See that file for why consent exists.
 */
export const AI_CONSENT_VERSION = 3;



export type AiPurpose = 'trip' | 'import' | 'agent';

/** Mirror of functions/src/aiConsent.ts AI_CONSENT_MIN: older features keep accepting the consent older apps wrote. */
export const AI_CONSENT_MIN: Record<AiPurpose, number> = { trip: 1, import: 1, agent: 3 };

export function hasAiConsent(version: number | null | undefined, purpose: AiPurpose = 'trip'): boolean {
  return typeof version === 'number' && version >= AI_CONSENT_MIN[purpose];
}
