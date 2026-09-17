/**
 * Client mirror of functions/src/aiConsent.ts — keep AI_CONSENT_VERSION in
 * step with it. See that file for why consent exists.
 */
export const AI_CONSENT_VERSION = 1;

export function hasAiConsent(version: number | null | undefined): boolean {
  return typeof version === 'number' && version >= AI_CONSENT_VERSION;
}

export type AiPurpose = 'trip' | 'import';
