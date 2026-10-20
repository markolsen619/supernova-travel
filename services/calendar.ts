// services/calendar.ts
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/services/firebase';

export type CalTypes = { flights: boolean; stays: boolean; dining: boolean; transit: boolean; tripDays: boolean };
export const DEFAULT_CAL_TYPES: CalTypes = { flights: true, stays: true, dining: true, transit: true, tripDays: true };

export const createCalendarFeed = async () => (await httpsCallable<void, { token: string }>(functions, 'createCalendarFeed')()).data.token;
export const rotateCalendarFeed = async () => (await httpsCallable<void, { token: string }>(functions, 'rotateCalendarFeed')()).data.token;
export const disableCalendarFeed = async () => { await httpsCallable(functions, 'disableCalendarFeed')(); };
export const setCalendarTypes = async (types: Partial<CalTypes>) =>
  (await httpsCallable<{ types: Partial<CalTypes> }, { types: CalTypes }>(functions, 'setCalendarTypes')({ types })).data.types;
