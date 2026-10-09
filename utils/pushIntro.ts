/**
 * The "Know when it matters" screen (app/notification-intro.tsx) — shown once,
 * to anyone iOS hasn't asked yet. Its "Not now" leaves the system prompt
 * unspent, so services/push.ts can still ask at a moment that explains itself.
 */
import type { PushPermission } from '@/utils/pushPrompt';
export type { PushPermission };

export function shouldShowPushIntro(a: { permission: PushPermission; introShown: boolean }): boolean {
  return a.permission === 'undetermined' && !a.introShown;
}

/** Settings → Notifications: what the row says and does for each permission state. */
export function notificationSettingAction(permission: PushPermission): { label: string; action: 'none' | 'ask' | 'open_settings' } {
  if (permission === 'granted') return { label: 'On', action: 'none' };
  if (permission === 'undetermined') return { label: 'Turn on', action: 'ask' };
  return { label: 'Off · Open Settings', action: 'open_settings' };
}
