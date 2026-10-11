import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Whether the app is in the foreground — players are paused by iOS in the background and must be told to resume. */
export function useAppActive(): boolean {
  const [active, setActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setActive(s === 'active'));
    return () => sub.remove();
  }, []);
  return active;
}
