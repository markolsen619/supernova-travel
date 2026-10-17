import { useEffect, useState } from 'react';
import { groundNovaPlace, type NovaGround } from '@/utils/agentGround';
import { destinationAt } from '@/utils/groundingContext';
import type { TripWithDays } from '@/types';
import type { AgentMessage } from '@/types/agent';

const cache = new Map<string, Record<number, NovaGround>>();

/** Grounds each new place in a proposal once (spec §3); results live for the session. */
export function useAgentGrounding(message: AgentMessage, trip: TripWithDays) {
  const [grounded, setGrounded] = useState<Record<number, NovaGround>>(() => cache.get(message.id) ?? {});
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (message.status && message.status !== 'proposed') return;
    if (cache.has(message.id)) { setGrounded(cache.get(message.id)!); return; }
    const jobs = message.operations.map((op, i) => ({ op, i })).filter(({ op }) => (op.kind === 'trip.addStop' || op.kind === 'trip.editStop') && op.query);
    if (!jobs.length) return;
    let alive = true;
    setPending(true);
    (async () => {
      const out: Record<number, NovaGround> = {};
      for (const { op, i } of jobs) {
        if ((op.kind !== 'trip.addStop' && op.kind !== 'trip.editStop') || !op.query) continue;
        const day = trip.days.find((d) => d.id === op.dayId);
        out[i] = await groundNovaPlace(op.query, destinationAt(trip, day?.destinationIndex ?? 0)).catch(() => ({ status: 'notFound' as const }));
      }
      cache.set(message.id, out);
      if (alive) { setGrounded(out); setPending(false); }
    })();
    return () => { alive = false; };
  }, [message.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { grounded, pending };
}
