import { useCallback, useState } from 'react';
import { collection, doc, getDocs, limit, orderBy, query, Timestamp, updateDoc, writeBatch } from 'firebase/firestore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { auth, db } from '@/services/firebase';
import { askAgent, fetchAgentQuota } from '@/services/agent';
import { useCreateTrip } from '@/hooks/useCreateTrip';
import { draftFromRows, previewRoute, routeRowsFromTrip, useTripRoute } from '@/hooks/useTripRoute';
import { resolveCityByName } from '@/services/places/mapboxSearch';
import { applyRouteOps, orderAfter, planApply, undoSteps, type ApplyStep } from '@/utils/agentApply';
import { dropsWarning, endDateFor } from '@/utils/tripRoute';
import { parseCalendarDate } from '@/utils/calendarDate';
import type { Destination, TripWithDays } from '@/types';
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
    try {
      const requestId = doc(collection(db, 'trips')).id;
      const res = await askAgent({ surface: 'trip', subjectId: tripId, message: text.trim(), requestId });
      qc.setQueryData(['agentQuota', uid], res.quota);
      await qc.invalidateQueries({ queryKey: key });
      return 'ok';
    } catch (e: unknown) {
      const details = (e as { details?: { reason?: string; fairUse?: boolean } }).details;
      if (details?.reason === 'monthly' && !details.fairUse) { setError((e as Error).message); return 'limit'; }
      setError((e as Error).message || "Nova couldn't answer right now. Try again.");
      return 'error';
    } finally {
      setPending(null); setSending(false);
    }
  }, [uid, tripId, sending, qc]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSteps = useCallback(async (steps: ApplyStep[]): Promise<Record<number, string>> => {
    const added: Record<number, string> = {};
    for (const [i, s] of steps.entries()) {
      switch (s.do) {
        case 'delete': await trips.deleteActivity(trip!.id, s.dayId, s.activity.id, s.activity.fromBooking); break;
        case 'move': {
          const target = trip!.days.find((d) => d.id === s.toDayId)?.activities ?? [];
          const id = await trips.moveActivityToDay(trip!.id, s.fromDayId, s.toDayId, s.activity, s.afterStopId ? orderAfter(target, s.afterStopId) : undefined);
          if (id) added[i] = id;
          break;
        }
        case 'reorder': await trips.reorderActivities(trip!.id, s.dayId, s.after); break;
        case 'update': await trips.updateActivity(trip!.id, s.dayId, s.activityId, s.patch); break;
        case 'add': added[i] = await trips.addActivity(trip!.id, s.dayId, { ...s.activity, createdAt: Timestamp.now() }, s.order); break;
        case 'dates': {
          const total = [trip!.destination, ...trip!.additionalDestinations].reduce((n, c) => n + (c.nights ?? 0), 0);
          await trips.updateTrip(trip!.id, { startDate: parseCalendarDate(s.newStart), endDate: total ? parseCalendarDate(endDateFor(s.newStart, total)) : undefined });
          break;
        }
      }
    }
    return added;
  }, [trip, trips]);

  const apply = useCallback(async (messageId: string, ops: AgentOp[], confirmDrops: (text: string) => Promise<boolean>) => {
    if (!trip || !uid) return { applied: 0, skipped: ops.length, undo: null };
    const plan = planApply(trip, ops);
    let skipped = plan.skipped.length;

    // Route first is confirmed (it may delete days with stops); then stop steps on the saved trip.
    if (plan.routeOps.length) {
      const near = trip.destination.lat != null && trip.destination.lng != null ? { lat: trip.destination.lat, lng: trip.destination.lng } : null;
      const places = new Map<string, Destination | null>();
      for (const op of plan.routeOps) if (op.kind === 'trip.addCity') places.set(op.name, await resolveCityByName(op.name, near));
      const routed = applyRouteOps(routeRowsFromTrip(trip), plan.routeOps, (name) => places.get(name) ?? null);
      skipped += routed.skipped.length;
      const draft = draftFromRows(routed.rows);
      const preview = previewRoute(trip, draft);
      const names = [trip.destination, ...trip.additionalDestinations].map((c) => c.name);
      if (preview.dropsWithStops.length && !(await confirmDrops(dropsWarning(preview.dropsWithStops, names)))) {
        return { applied: 0, skipped: ops.length, undo: null };
      }
      await saveRoute(trip, draft);
    }

    const added = await runSteps(plan.steps);
    const applied = ops.length - skipped;
    await updateDoc(doc(db, threadPath(uid, trip.id), messageId), { status: skipped ? 'partial' : 'applied' });
    await qc.invalidateQueries({ queryKey: key });

    const undo = plan.routeOps.length ? null : async () => {
      await runSteps(undoSteps(plan.steps, added));
      await updateDoc(doc(db, threadPath(uid, trip.id), messageId), { status: 'dismissed' });
      await qc.invalidateQueries({ queryKey: key });
    };
    return { applied, skipped, undo };
  }, [trip, uid, saveRoute, runSteps, qc]); // eslint-disable-line react-hooks/exhaustive-deps

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
  return { messages, loading: thread.isLoading, sending, error, quota: (quota.data as AgentQuotaView | undefined) ?? null, send, apply, dismiss, clear };
}
