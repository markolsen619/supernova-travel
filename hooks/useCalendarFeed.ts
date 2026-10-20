// hooks/useCalendarFeed.ts
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  createCalendarFeed, DEFAULT_CAL_TYPES, disableCalendarFeed, rotateCalendarFeed, setCalendarTypes, type CalTypes,
} from '@/services/calendar';

/** The user's calendar link and type switches (users/{uid}/private/calendar, owner-read). */
export function useCalendarFeed() {
  const uid = useAuthStore((s) => s.user?.uid ?? null);
  const qc = useQueryClient();
  const key = ['calendarFeed', uid];
  const { data, isLoading } = useQuery({
    queryKey: key,
    enabled: !!uid,
    queryFn: async () => {
      const snap = await getDoc(doc(db, 'users', uid!, 'private', 'calendar'));
      return {
        token: (snap.get('token') as string | undefined) ?? null,
        types: { ...DEFAULT_CAL_TYPES, ...((snap.get('types') as Partial<CalTypes>) ?? {}) },
      };
    },
  });
  const set = useCallback((next: { token: string | null; types: CalTypes }) => qc.setQueryData(key, next), [qc, uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const types = data?.types ?? DEFAULT_CAL_TYPES;
  return {
    token: data?.token ?? null,
    types,
    isLoading,
    turnOn: useCallback(async () => set({ token: await createCalendarFeed(), types }), [set, types]),
    rotate: useCallback(async () => set({ token: await rotateCalendarFeed(), types }), [set, types]),
    turnOff: useCallback(async () => { await disableCalendarFeed(); set({ token: null, types: DEFAULT_CAL_TYPES }); }, [set]),
    setType: useCallback(async (k: keyof CalTypes, v: boolean) => {
      set({ token: data?.token ?? null, types: { ...types, [k]: v } }); // optimistic
      set({ token: data?.token ?? null, types: await setCalendarTypes({ [k]: v }) });
    }, [set, types, data?.token]),
  };
}
