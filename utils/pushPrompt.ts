import { Tier } from '@/types';

/**
 * Whether to ask for notification permission at a given moment.
 *
 * Split out of the screens that trigger it so the rule is testable without a
 * renderer, and so the tier condition lives in one place rather than being
 * re-derived at each call site.
 *
 * The prompt used to fire inside hydrateSession(), cold, while the user was
 * still swiping onboarding slides. iOS gives an app exactly one system sheet
 * per install, so spending it before the user has anything to be notified
 * about is spending it at its lowest possible conversion.
 */

export type PushPromptTrigger =
  /** A boarding pass was just saved. Pro/business only — see below. */
  | 'boarding_pass_added'
  /** The user just sent their first message in a thread. */
  | 'dm_sent'
  /** The user just invited someone to a trip, so a reply is expected. */
  | 'trip_invite_sent';

export type PushPermission = 'granted' | 'denied' | 'undetermined';

export interface PushPromptInput {
  trigger: PushPromptTrigger;
  tier: Tier;
  permission: PushPermission;
  /** Whether this uid has already been shown the system sheet once. */
  alreadyAsked: boolean;
}

export function shouldPromptForPush({
  trigger,
  tier,
  permission,
  alreadyAsked,
}: PushPromptInput): boolean {
  // Granted: nothing to ask. Denied: iOS resolves a second request
  // immediately without showing a sheet, so asking again does nothing
  // except spend a good moment. Settings is the only way back from denied.
  if (permission !== 'undetermined') return false;
  if (alreadyAsked) return false;

  // checkFlightStatus sends the flight push only to paid tiers (the status
  // write itself is for everyone, which is why the wallet still updates).
  // Asking a free user to enable gate and delay alerts would promise a
  // notification they cannot receive.
  if (trigger === 'boarding_pass_added' && tier === 'free') return false;

  return true;
}
