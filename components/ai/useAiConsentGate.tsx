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

  const requireConsent = useCallback((forPurpose: AiPurpose, action: () => void) => {
    if (hasAiConsent(useAiConsentStore.getState().version)) {
      action();
      return;
    }
    pending.current = action;
    setPurpose(forPurpose);
  }, []);

  const handleAllow = useCallback(async () => {
    if (!uid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await grantAiConsent(uid);
    const action = pending.current;
    pending.current = null;
    setPurpose(null);
    action?.();
  }, [uid]);

  const handleClose = useCallback(() => {
    pending.current = null;
    setPurpose(null);
  }, []);

  const consentSheet = <AiConsentSheet purpose={purpose} onAllow={handleAllow} onClose={handleClose} />;

  return { requireConsent, consentSheet };
}
