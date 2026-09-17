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
 */
export const AI_CONSENT_VERSION = 1;

export function hasAiConsent(userData: { aiConsentVersion?: unknown } | null | undefined): boolean {
  const version = userData?.aiConsentVersion;
  return typeof version === 'number' && version >= AI_CONSENT_VERSION;
}

export const AI_CONSENT_REQUIRED_MESSAGE = 'Allow AI data sharing to use this feature';
