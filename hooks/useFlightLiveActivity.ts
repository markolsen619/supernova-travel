/**
 * Day-of assistant (spec 2026-11-01): today's flight on the lock screen. iPhone — a Live Activity (expo-live-activity)
 * started within 6 h of departure, updated when the pass changes or the app comes back, ended at arrival /
 * cancellation; its push token goes to users/{uid}/liveActivities/{passId} for server updates once an APNs key exists.
 * Android — an ongoing "Flight today" notification. Pro only; never throws (builds without the module do nothing).
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { isPaidTier } from '@/utils/proFeatures';
import { flightToday, liveActivityContent, shouldStartActivity } from '@/utils/dayOf';
import type { BoardingPass } from '@/types';

const STORE_KEY = 'liveActivities:v1'; // { [passId]: activityId }
type LA = typeof import('expo-live-activity');
let la: LA | null = null;
// eslint-disable-next-line @typescript-eslint/no-require-imports -- optional native module (absent in older dev builds)
try { la = Platform.OS === 'ios' ? (require('expo-live-activity') as LA) : null; } catch { la = null; }

async function readMap(): Promise<Record<string, string>> {
  try { return JSON.parse((await AsyncStorage.getItem(STORE_KEY)) ?? '{}'); } catch { return {}; }
}
async function writeMap(m: Record<string, string>) {
  try { await AsyncStorage.setItem(STORE_KEY, JSON.stringify(m)); } catch { /* per-device convenience */ }
}

async function syncIos(pass: BoardingPass | null) {
  if (!la) return;
  const map = await readMap();
  const now = Date.now();
  // End activities for passes that are over or no longer today's.
  for (const [passId, activityId] of Object.entries(map)) {
    if (pass && passId === pass.id && !liveActivityContent(pass, now).ended) continue;
    try { la.stopActivity(activityId, { title: 'Flight ended' }); } catch { /* already gone */ }
    delete map[passId];
  }
  if (pass) {
    const c = liveActivityContent(pass, now);
    const state = { title: c.title, subtitle: c.subtitle, progressBar: { date: c.endsAtMs }, imageName: 'star', dynamicIslandImageName: 'star' };
    if (map[pass.id]) {
      try { la.updateActivity(map[pass.id], state); } catch { /* ignore */ }
    } else if (shouldStartActivity(pass, now, new Set(Object.keys(map)), true)) {
      try {
        const id = la.startActivity(state, {
          backgroundColor: '#0B0A12', titleColor: '#F5F3F9', subtitleColor: '#B9B2CC', progressViewTint: '#7F77DD',
          progressViewLabelColor: '#F5F3F9', deepLinkUrl: `/(wallet)/boarding-pass/${pass.id}`, timerType: 'digital',
        });
        if (id) map[pass.id] = id;
      } catch { /* Live Activities off in Settings, or unsupported */ }
    }
  }
  await writeMap(map);
}

async function syncAndroid(pass: BoardingPass | null) {
  const id = 'flight-today';
  try {
    if (!pass) { await Notifications.dismissNotificationAsync(id); return; }
    const now = Date.now();
    const c = liveActivityContent(pass, now);
    if (c.ended || Date.parse(pass.departureTime) - now > 6 * 3_600_000) { await Notifications.dismissNotificationAsync(id); return; }
    await Notifications.scheduleNotificationAsync({
      identifier: id,
      content: { title: `Flight today · ${c.title}`, body: c.subtitle, sticky: true, autoDismiss: false, data: { type: 'flight_status', passId: pass.id } },
      trigger: null,
    });
  } catch { /* notifications off */ }
}

export function useFlightLiveActivity(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const tier = useAuthStore((s) => s.tier);
  const { boardingPasses } = useBoardingPasses();
  const pro = isPaidTier(tier);
  const latest = useRef<BoardingPass | null>(null);
  latest.current = pro ? flightToday(boardingPasses, new Date()) : null;
  const key = latest.current ? JSON.stringify([latest.current.id, latest.current.gate, latest.current.seat, latest.current.status, latest.current.delayMinutes, latest.current.departureTime]) : '';

  useEffect(() => {
    const run = () => (Platform.OS === 'ios' ? syncIos(latest.current) : syncAndroid(latest.current));
    run();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(); });
    return () => sub.remove();
  }, [key, pro]);

  // The activity's push token, for server updates once an APNs key is configured (liveActivityPush).
  useEffect(() => {
    if (!la || !uid) return;
    let sub: { remove(): void } | void;
    try {
      sub = la.addActivityTokenListener(async ({ activityID, activityPushToken }) => {
        const map = await readMap();
        const passId = Object.keys(map).find((p) => map[p] === activityID);
        if (passId && activityPushToken) setDoc(doc(db, 'users', uid, 'liveActivities', passId), { token: activityPushToken, updatedAtMs: Date.now() }).catch(() => {});
      });
    } catch { sub = undefined; }
    return () => { try { sub?.remove(); } catch { /* ignore */ } };
  }, [uid]);
}
