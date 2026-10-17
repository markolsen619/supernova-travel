/**
 * Explicit permission to send personal data to Google's Gemini API.
 *
 * App Store guideline 5.1.2(i) requires apps to disclose when personal data
 * goes to a third-party AI and get the user's permission first. The client
 * asks before the first AI trip or booking import (components/ai/AiConsentSheet.tsx);
 * generateTrip and parseTravelConfirmation refuse without it, so no call site
 * can skip the question.
 *
 * Mirrored by utils/aiConsent.ts on the client. Kept free of firebase-admin
 * imports so the root jest suite can test it.
 */

/**
 * Bump when what's shared or who it's shared with changes materially. Every
 * user is then asked again, because what they agreed to is no longer what
 * happens.
 *
 * 2 (2026-10-14): Ask Nova sends the trip, your messages and booking names/dates.
 */
export const AI_CONSENT_VERSION = 3;

export type AiPurpose = 'trip' | 'import' | 'agent';

/**
 * The oldest consent each feature accepts. Never raise one for a feature older apps
 * already use: they write the version they shipped with and can't ask again, so a
 * global bump refused AI trips, import and forwarded emails for every 1.0.5 user
 * (caught in review, 2026-10-15). A feature that shares more starts at the new version.
 */
export const AI_CONSENT_MIN: Record<AiPurpose, number> = { trip: 1, import: 1, agent: 3 };

export function hasAiConsent(userData: { aiConsentVersion?: unknown } | null | undefined, purpose: AiPurpose = 'trip'): boolean {
  const version = userData?.aiConsentVersion;
  return typeof version === 'number' && version >= AI_CONSENT_MIN[purpose];
}

export const AI_CONSENT_REQUIRED_MESSAGE = 'Allow AI data sharing to use this feature';
