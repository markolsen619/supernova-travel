/**
 * What one AviationStack answer means for a boarding pass (spec 2026-10-23 §2). Pure: no firebase-admin.
 * AviationStack prints the airport's local clock behind a "+00:00" label, so only the HH:MM text is kept.
 */
export type LiveFlight = { status: string | null; gate: string | null; terminal: string | null; delayMinutes: number | null; departureLocal: string | null };
export type LiveResult = { kind: 'flight'; flight: LiveFlight } | { kind: 'none' } | { kind: 'limit'; code: string } | { kind: 'error'; code: string };
export type FlightAlert =
  | { kind: 'gate'; gate: string }
  | { kind: 'delay'; minutes: number; departureLocal: string | null }
  | { kind: 'landed' }
  | { kind: 'cancelled' };
export type PassState = { status?: string; gate?: string; terminal?: string; delayAlertedMinutes?: number };

const LIMIT_CODES = new Set(['usage_limit_reached', 'monthly_limit_reached']);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const norm = (v: string | null | undefined) => (v ?? '').trim().toUpperCase();

export function parseLiveFlight(json: unknown): LiveResult {
  const body = (json ?? {}) as { data?: unknown[]; error?: { code?: unknown } };
  if (body.error) {
    const code = str(body.error.code) ?? 'unknown';
    return LIMIT_CODES.has(code) ? { kind: 'limit', code } : { kind: 'error', code };
  }
  const f = (Array.isArray(body.data) ? body.data[0] : null) as Record<string, any> | null;
  if (!f) return { kind: 'none' };
  const dep = (f.departure ?? {}) as Record<string, unknown>;
  const clock = str(dep.estimated)?.match(/T(\d{2}:\d{2})/)?.[1] ?? null;
  const delay = typeof dep.delay === 'number' && Number.isFinite(dep.delay) ? Math.round(dep.delay) : null;
  return { kind: 'flight', flight: { status: str(f.flight_status), gate: str(dep.gate), terminal: str(dep.terminal), delayMinutes: delay, departureLocal: clock } };
}

export function flightChanges(pass: PassState, live: LiveFlight, nowMs: number): { patch: Record<string, unknown>; alerts: FlightAlert[] } {
  const patch: Record<string, unknown> = { liveCheckedAtMs: nowMs };
  const alerts: FlightAlert[] = [];
  if (live.status === 'cancelled') {
    if (pass.status !== 'cancelled') { patch.status = 'cancelled'; alerts.push({ kind: 'cancelled' }); }
    return { patch, alerts };
  }
  if (live.status === 'landed') {
    if (pass.status !== 'completed') { patch.status = 'completed'; alerts.push({ kind: 'landed' }); }
    return { patch, alerts };
  }
  let status = pass.status;
  if (live.status === 'active' && pass.status === 'upcoming') { patch.status = 'boarded'; status = 'boarded'; }
  const onGround = status === 'upcoming';
  if (live.gate && norm(live.gate) !== norm(pass.gate)) {
    patch.gate = live.gate;
    patch.gateSource = 'live';
    if (onGround) alerts.push({ kind: 'gate', gate: live.gate });
  }
  if (live.terminal && norm(live.terminal) !== norm(pass.terminal)) patch.terminal = live.terminal;
  if (live.delayMinutes !== null) {
    patch.delayMinutes = live.delayMinutes;
    if (live.departureLocal) patch.liveDepartureLocal = live.departureLocal;
    if (onGround && live.delayMinutes >= 15 && live.delayMinutes >= (pass.delayAlertedMinutes ?? 0) + 15) {
      patch.delayAlertedMinutes = live.delayMinutes;
      alerts.push({ kind: 'delay', minutes: live.delayMinutes, departureLocal: live.departureLocal });
    }
  }
  return { patch, alerts };
}

export function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function alertNotification(alert: FlightAlert, passId: string, flightNumber: string): { notification: Record<string, unknown>; push: { title: string; body: string } } {
  const base = { passId, flightNumber };
  switch (alert.kind) {
    case 'gate':
      return { notification: { type: 'flight_change', ...base, change: 'gate', gate: alert.gate },
        push: { title: `Gate change · ${flightNumber}`, body: `Now departing from gate ${alert.gate}.` } };
    case 'delay':
      return { notification: { type: 'flight_change', ...base, change: 'delay', delayMinutes: alert.minutes },
        push: { title: `${flightNumber} is delayed`, body: `About ${formatDelay(alert.minutes)} late${alert.departureLocal ? ` — now departing ${alert.departureLocal}` : ''}.` } };
    case 'landed':
      return { notification: { type: 'flight_status', ...base, status: 'completed' }, push: { title: 'Flight update', body: `${flightNumber} has landed.` } };
    case 'cancelled':
      return { notification: { type: 'flight_status', ...base, status: 'cancelled' }, push: { title: 'Flight update', body: `${flightNumber} has been cancelled.` } };
  }
}
