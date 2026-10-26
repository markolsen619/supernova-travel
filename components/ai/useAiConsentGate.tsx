import React, { useCallback, useRef, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { useAuthStore } from '@/stores/useAuthStore';
import { useAiConsentStore } from '@/stores/useAiConsentStore';
import { grantAiConsent } from '@/services/aiConsent';
import { hasAiConsent, type AiPurpose } from '@/utils/aiConsent';
import { AiConsentSheet } from './AiConsentSheet';

/**
 * Wraps an action that sends data to Gemini. With permission already given it
 * runs straight away; otherwise the consent sheet opens first, and the action
 * runs only once the user allows it. "Not now" drops it.
 *
 * Render `consentSheet` once in the screen.
 */
export function useAiConsentGate() {
  const uid = useAuthStore((s) => s.user?.uid ?? '');
  const [purpose, setPurpose] = useState<AiPurpose | null>(null);
  const pending = useRef<(() => void) | null>(null);
  const dismissed = useRef<(() => void) | null>(null);

  /** `onDismiss`: the sheet was closed without allowing (the past-trip flow carries on without Nova). */
  const requireConsent = useCallback((forPurpose: AiPurpose, action: () => void, onDismiss?: () => void) => {
    if (hasAiConsent(useAiConsentStore.getState().version, forPurpose)) {
      action();
      return;
    }
    pending.current = action;
    dismissed.current = onDismiss ?? null;
    setPurpose(forPurpose);
  }, []);

  const handleAllow = useCallback(async () => {
    if (!uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await grantAiConsent(uid);
    const action = pending.current;
    pending.current = null;
    dismissed.current = null;
    setPurpose(null);
    action?.();
  }, [uid]);

  const handleClose = useCallback(() => {
    const onDismiss = dismissed.current;
    pending.current = null;
    dismissed.current = null;
    setPurpose(null);
    onDismiss?.();
  }, []);

  const consentSheet = <AiConsentSheet purpose={purpose} onAllow={handleAllow} onClose={handleClose} />;

  return { requireConsent, consentSheet };
}
