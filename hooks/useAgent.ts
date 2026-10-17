import { useCallback, useRef, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/services/firebase';
import { addPackingItem, deletePackingItem, setPackingChecked } from '@/services/packing';
import { useUserStore } from '@/stores/useUserStore';
import { askAgent, fetchAgentQuota } from '@/services/agent';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { draftFromRows, previewRoute, routeRowsFromTrip, useTripRoute } from '@/hooks/useTripRoute';
import { resolveCityByName } from '@/services/places/mapboxSearch';
import { applyRouteOps, planApply, undoSteps, type ApplyStep } from '@/utils/agentApply';
import { requestIdFor } from '@/utils/agentCard';
import type { NovaGround } from '@/utils/agentGround';
import { fetchTripWithDays } from '@/hooks/useTrip';
import { dropsWarning } from '@/utils/tripRoute';
import { parseCalendarDate } from '@/utils/calendarDate';
import type { Destination, PackingItem, TripWithDays } from '@/types';
import type { AgentMessage, AgentOp, AgentQuotaView } from '@/types/agent';

const threadPath = (uid: string, tripId: string) => `users/${uid}/agentThreads/trip_${tripId}/messages`;

export function useAgent({ trip, enabled }: { surface: 'trip'; trip: TripWithDays | null; enabled: boolean }) {
  const uid = auth.currentUser?.uid ?? null;
  const tripId = trip?.id ?? null;
  const qc = useQueryClient();
  const trips = useCreateTrip();
  const { saveRoute } = useTripRoute();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<AgentMessage | null>(null);
  // The last send that failed: retrying the same message reuses its id (utils/agentCard requestIdFor).
  const lastFailed = useRef<{ text: string; requestId: string } | null>(null);

  const key = ['agentThread', uid, tripId];
  const thread = useQuery({
    queryKey: key,
    enabled: enabled && !!uid && !!tripId,
    queryFn: async (): Promise<AgentMessage[]> => {
      const snap = await getDocs(query(collection(db, threadPath(uid!, tripId!)), orderBy('createdAt', 'desc'), limit(30)));
      return snap.docs.reverse().map((d) => ({
        id: d.id, role: d.get('role'), text: d.get('text') ?? '', operations: d.get('operations') ?? [],
        status: d.get('status') ?? null, createdAt: (d.get('createdAt') as Timestamp | undefined)?.toMillis() ?? 0,
      }));
    },
  });
  const quota = useQuery({ queryKey: ['agentQuota', uid], enabled: enabled && !!uid, queryFn: fetchAgentQuota, staleTime: 60_000 });

  const send = useCallback(async (text: string): Promise<'ok' | 'limit' | 'error'> => {
    if (!uid || !tripId || !text.trim() || sending) return 'error';
    setSending(true); setError(null);
    setPending({ id: 'pending', role: 'user', text: text.trim(), operations: [], status: null, createdAt: Date.now() });
    const requestId = requestIdFor(text, lastFailed.current, () => doc(collection(db, 'trips')).id);
    try {
      const res = await askAgent({ surface: 'trip', subjectId: tripId, message: text.trim(), requestId });
      lastFailed.current = null;
      qc.setQueryData(['agentQuota', uid], res.quota);
      await qc.invalidateQueries({ queryKey: key });
      return 'ok';
    } catch (e: unknown) {
      const details = (e as { details?: { reason?: string; fairUse?: boolean } }).details;
      // The server may have answered and saved before the connection dropped: show what's saved.
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ['agentQuota', uid] });
      if (details?.reason === 'monthly' && !details.fairUse) { setError((e as Error).message); return 'limit'; }
      lastFailed.current = { text: text.trim(), requestId };
      setError((e as Error).message || "Nova couldn't answer right now. Try again.");
      return 'error';
    } finally {
      setPending(null); setSending(false);
    }
  }, [uid, tripId, sending, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSteps = useCallback(async (id: string, steps: ApplyStep[]): Promise<Record<number, string>> => {
    const added: Record<number, string> = {};
    for (const [i, s] of steps.entries()) {
      switch (s.do) {
        case 'delete': await trips.deleteActivity(id, s.dayId, s.activity.id, s.activity.fromBooking); break;
        case 'move': {
          const newId = await trips.moveActivityToDay(id, s.fromDayId, s.toDayId, s.activity, s.order);
          if (newId) added[i] = newId;
          break;
        }
        case 'reorder': await trips.reorderActivities(id, s.dayId, s.after); break;
        case 'update': await trips.updateActivity(id, s.dayId, s.activityId, s.patch); break;
        case 'add': added[i] = await trips.addActivity(id, s.dayId, { ...s.activity, createdAt: Timestamp.now() }, s.order); break;
        case 'trip': await trips.updateTrip(id, s.patch); break;
        case 'packAdd': added[i] = await addPackingItem(id, { label: s.label, category: s.category, addedByUid: uid! }); break;
        case 'packCheck': await setPackingChecked(id, s.itemId, s.checked); break;
        case 'packRemove': await deletePackingItem(id, s.itemId); break;
        case 'dates':
          // The end moves by as many days as the start (utils/agentApply planApply), so the trip keeps its length.
          await trips.updateTrip(id, { startDate: parseCalendarDate(s.newStart), ...(s.newEnd ? { endDate: parseCalendarDate(s.newEnd) } : {}) });
          break;
      }
    }
    if (steps.some((s) => s.do.startsWith('pack'))) await qc.invalidateQueries({ queryKey: ['packingItems', id] });
    return added;
  }, [trips, uid, qc]);

  /** The trip as it is now — never the cached copy (a collaborator may have changed it). */
  const freshTrip = useCallback(
    () => (tripId ? qc.fetchQuery({ queryKey: ['trip', tripId], queryFn: () => fetchTripWithDays(tripId), staleTime: 0 }) : Promise.resolve(null)),
    [qc, tripId],
  );

  // messageId null = a local proposal from the trip check: nothing in the thread to mark (spec §2).
  const apply = useCallback(async (messageId: string | null, ops: AgentOp[], confirmDrops: (text: string) => Promise<boolean>, grounded: Record<number, NovaGround> = {}) => {
    if (!tripId || !uid) return { applied: 0, skipped: ops.length, undo: null };
    const setStatus = (status: 'applied' | 'partial' | 'dismissed') => (messageId ? updateDoc(doc(db, threadPath(uid, tripId), messageId), { status }) : Promise.resolve());
    let current = await freshTrip();
    if (!current) return { applied: 0, skipped: ops.length, undo: null };

    // What planning needs beyond the trip: its packing list, and whether this account may make a trip Public.
    const packing = await getDocs(collection(db, 'trips', current.id, 'packingItems'))
      .then((snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }) as PackingItem)).catch(() => [] as PackingItem[]);
    const ctx = { packing, accountPrivate: useUserStore.getState().profile?.settings?.privacy === 'private' };
    const first = planApply(current, ops, grounded, ctx);
    let routeSkipped = 0;
    try {
      // Route first, confirmed (it may delete days with stops); then the stop changes are planned
      // again on the saved trip, so none lands on a day the route removed.
      if (first.routeOps.length) {
        const trip0 = current;
        const near = trip0.destination.lat != null && trip0.destination.lng != null ? { lat: trip0.destination.lat, lng: trip0.destination.lng } : null;
        const places = new Map<string, Destination | null>();
        for (const op of first.routeOps) if (op.kind === 'trip.addCity') places.set(op.name, await resolveCityByName(op.name, near));
        const routed = applyRouteOps(routeRowsFromTrip(trip0), first.routeOps, (name) => places.get(name) ?? null);
        routeSkipped = routed.skipped.length;
        const draft = draftFromRows(routed.rows);
        const preview = previewRoute(trip0, draft);
        const names = [trip0.destination, ...trip0.additionalDestinations].map((c) => c.name);
        if (preview.dropsWithStops.length && !(await confirmDrops(dropsWarning(preview.dropsWithStops, names)))) {
          return { applied: 0, skipped: ops.length, undo: null };
        }
        await saveRoute(trip0, draft);
        current = (await freshTrip()) ?? trip0;
      }
      // Re-plan the stop changes on the saved route; their grounding follows them to their new indices.
      const rest: AgentOp[] = [];
      const restGround: Record<number, NovaGround> = {};
      ops.forEach((o, i) => { if (!first.routeOps.includes(o)) { if (grounded[i]) restGround[rest.length] = grounded[i]; rest.push(o); } });
      const plan = first.routeOps.length ? planApply(current, rest, restGround, ctx) : first;
      const skipped = routeSkipped + plan.skipped.length;
      const added = await runSteps(current.id, plan.steps);
      await setStatus(skipped ? 'partial' : 'applied');
      await qc.invalidateQueries({ queryKey: key });

      const id = current.id;
      const undo = first.routeOps.length ? null : async () => {
        await runSteps(id, undoSteps(plan.steps, added));
        await setStatus('dismissed');
        await qc.invalidateQueries({ queryKey: key });
      };
      return { applied: ops.length - skipped, skipped, undo, placedNote: Object.values(plan.placedNote)[0] ?? null };
    } catch (e) {
      // Some writes may have gone through: say so on the card, show the trip as it is, and let the sheet tell the person.
      await setStatus('partial').catch(() => {});
      await qc.invalidateQueries({ queryKey: ['trip', tripId] });
      await qc.invalidateQueries({ queryKey: key });
      throw e;
    }
  }, [tripId, uid, freshTrip, saveRoute, runSteps, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A free local fix from the trip check (no AI call, no message used). */
  const applyLocal = useCallback((ops: AgentOp[], confirmDrops: (text: string) => Promise<boolean>) => apply(null, ops, confirmDrops), [apply]);

  const dismiss = useCallback(async (messageId: string) => {
    if (!uid || !tripId) return;
    await updateDoc(doc(db, threadPath(uid, tripId), messageId), { status: 'dismissed' });
    await qc.invalidateQueries({ queryKey: key });
  }, [uid, tripId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const clear = useCallback(async () => {
    if (!uid || !tripId) return;
    const snap = await getDocs(query(collection(db, threadPath(uid, tripId)), limit(500)));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    await qc.invalidateQueries({ queryKey: key });
  }, [uid, tripId, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const messages = [...(thread.data ?? []), ...(pending ? [pending] : [])];
  return { messages, loading: thread.isLoading, sending, error, quota: (quota.data as AgentQuotaView | undefined) ?? null, send, apply, applyLocal, dismiss, clear };
}
