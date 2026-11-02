/**
 * Day-of assistant (spec 2026-11-01): today's flight on the lock screen. iPhone — a Live Activity (expo-live-activity)
 * started within 6 h of departure, updated when the pass changes or the app comes back, ended at arrival /
 * cancellation; its push token goes to users/{uid}/liveActivities/{passId} for server updates once an APNs key exists.
 * Android — a quiet ongoing "Flight today" notification. Pro only; never throws (builds without the module do nothing).
 *
 * Final review (2026-11-01): what to do is decided by `activityPlan` from the latest passes at sync time (a stale
 * render snapshot missed travel day), syncs run one at a time (two at once started two activities), nothing runs
 * until the passes and the tier are known (a cold start's empty list ended the activity), and passes are refetched
 * when the app comes back.
 */
import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { deleteDoc, doc, setDoc } from 'firebase/firestore';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBoardingPasses } from '@/hooks/useBoardingPasses';
import { isPaidTier } from '@/utils/proFeatures';
import { activityPlan, androidFlightNotice, flightToday, liveActivityContent, liveActivityReady, sameNotice, serialQueue } from '@/utils/dayOf';
import type { BoardingPass } from '@/types';

const STORE_KEY = 'liveActivities:v1'; // { [passId]: activityId }
/** Android: the ongoing notification's id and its own quiet channel (no sound, no heads-up banner). */
export const FLIGHT_NOTICE_ID = 'flight-today';
const FLIGHT_CHANNEL = 'flight-today';

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

function activityState(p: BoardingPass, nowMs: number) {
  const c = liveActivityContent(p, nowMs);
  return { title: c.title, subtitle: c.subtitle, progressBar: { date: c.endsAtMs }, imageName: 'star', dynamicIslandImageName: 'star' };
}

async function syncIos(uid: string, passes: BoardingPass[], pro: boolean) {
  if (!la) return;
  const map = await readMap();
  const now = Date.now();
  // Not Pro (any more): end whatever is running and start nothing.
  const plan = pro ? activityPlan(map, passes, now) : { stop: Object.entries(map).map(([passId, activityId]) => ({ passId, activityId })), update: null, start: null };
  for (const { passId, activityId } of plan.stop) {
    try { la.stopActivity(activityId, { title: 'Flight ended' }); } catch { /* already gone */ }
    delete map[passId];
    // The token is no use once the activity ends (the privacy policy says we delete it after the flight).
    deleteDoc(doc(db, 'users', uid, 'liveActivities', passId)).catch(() => {});
  }
  if (plan.update) {
    try { la.updateActivity(plan.update.activityId, activityState(plan.update.pass, now)); } catch { /* ignore */ }
  }
  if (plan.start) {
    try {
      const id = la.startActivity(activityState(plan.start, now), {
        backgroundColor: '#0B0A12', titleColor: '#F5F3F9', subtitleColor: '#B9B2CC', progressViewTint: '#7F77DD',
        progressViewLabelColor: '#F5F3F9', deepLinkUrl: `/(wallet)/boarding-pass/${plan.start.id}`, timerType: 'digital',
      });
      if (id) map[plan.start.id] = id;
    } catch { /* Live Activities off in Settings, or unsupported */ }
  }
  await writeMap(map);
}

let channelReady = false;
let lastNotice: { title: string; body: string } | null = null;

async function syncAndroid(passes: BoardingPass[], pro: boolean) {
  try {
    const now = Date.now();
    const pass = pro ? flightToday(passes, new Date(now)) : null;
    const notice = androidFlightNotice(pass, now);
    if (!notice) {
      await Notifications.dismissNotificationAsync(FLIGHT_NOTICE_ID);
      lastNotice = null;
      return;
    }
    if (sameNotice(lastNotice, notice)) return; // re-posting buzzed on every app open
    if (!channelReady) {
      await Notifications.setNotificationChannelAsync(FLIGHT_CHANNEL, {
        name: 'Flight today', importance: Notifications.AndroidImportance.LOW, sound: null, vibrationPattern: null, enableVibrate: false,
      });
      channelReady = true;
    }
    await Notifications.scheduleNotificationAsync({
      identifier: FLIGHT_NOTICE_ID,
      content: { title: notice.title, body: notice.body, sticky: true, autoDismiss: false, data: { type: 'flight_status', passId: pass!.id } },
      trigger: { channelId: FLIGHT_CHANNEL },
    });
    lastNotice = notice;
  } catch { /* notifications off */ }
}

export function useFlightLiveActivity(): void {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const tier = useAuthStore((s) => s.tier);
  const serverTier = useAuthStore((s) => s.serverTier);
  const queryClient = useQueryClient();
  const { boardingPasses, isLoading } = useBoardingPasses();
  const pro = isPaidTier(tier);
  const ready = !!uid && liveActivityReady({ passesLoading: isLoading, serverTier });

  // The latest inputs, read when a sync runs — never a snapshot from an earlier render.
  const latest = useRef({ passes: boardingPasses, pro, uid });
  latest.current = { passes: boardingPasses, pro, uid };
  const queue = useRef(serialQueue()).current;

  useEffect(() => {
    if (!ready) return;
    const sync = () => queue(async () => {
      const { passes, pro: isPro, uid: u } = latest.current;
      if (!u) return;
      if (Platform.OS === 'ios') await syncIos(u, passes, isPro);
      else if (Platform.OS === 'android') await syncAndroid(passes, isPro);
    });
    sync();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      // Gate, delay and status may have changed while away: refetch; the new passes re-run this effect.
      queryClient.invalidateQueries({ queryKey: ['boardingPasses', uid] });
      sync();
    });
    return () => sub.remove();
  }, [ready, boardingPasses, pro, uid, queue, queryClient]);

  // The activity's push token, for server updates once an APNs key is configured (liveActivityPush).
  useEffect(() => {
    if (!la || !uid) return;
    let sub: { remove(): void } | void;
    try {
      sub = la.addActivityTokenListener(({ activityID, activityPushToken }) => {
        // Through the queue, so the start that created this activity has saved its id first.
        queue(async () => {
          const map = await readMap();
          const passId = Object.keys(map).find((p) => map[p] === activityID);
          if (passId && activityPushToken) await setDoc(doc(db, 'users', uid, 'liveActivities', passId), { token: activityPushToken, updatedAtMs: Date.now() }).catch(() => {});
        });
      });
    } catch { sub = undefined; }
    return () => { try { sub?.remove(); } catch { /* ignore */ } };
  }, [uid, queue]);
}
