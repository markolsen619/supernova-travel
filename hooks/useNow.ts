import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { msUntilNextChange } from '@/utils/greeting';

/**
 * "Now" for Home (final review): refreshed when the app comes back to the foreground, when the tab regains focus,
 * and at the next greeting-band edge or midnight — the tab stays mounted, so a render-time `new Date()` showed
 * yesterday's greeting, day and stops the next morning.
 */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  const refresh = useCallback(() => setNow(new Date()), []);
  useFocusEffect(refresh);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') refresh(); });
    return () => sub.remove();
  }, [refresh]);
  useEffect(() => {
    const t = setTimeout(refresh, msUntilNextChange(now) + 1000);
    return () => clearTimeout(t);
  }, [now, refresh]);
  return now;
}
