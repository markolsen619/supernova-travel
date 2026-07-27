import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// Decorative motion (Ken Burns drift, avatar-grid drift) checks this and
// skips straight to the resting frame when true — motion here is additive,
// never load-bearing for comprehension. See the onboarding redesign spec's
// Motion System / Accessibility decision.
export function useReduceMotion(): boolean {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      setReduceMotion
    );
    return () => subscription.remove();
  }, []);

  return reduceMotion;
}
