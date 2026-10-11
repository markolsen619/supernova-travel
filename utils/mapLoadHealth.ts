/**
 * Whether the trip map has loaded, and what to record when it doesn't.
 *
 * 2026-10-10: on build 32 trip maps on real phones sometimes kept only the coarse
 * low-zoom tiles and never showed satellite imagery, then fixed themselves minutes
 * later — consistent with failed downloads waiting out Mapbox's retry back-off. The
 * map was ignoring Mapbox's own error reports, so nothing said why. Now it records a
 * few of them (`mapDiagnostics`) and offers a Retry that rebuilds the map.
 */

/** A fresh map that hasn't finished loading by now is stuck, not slow. */
export const MAP_STALL_MS = 15_000;
/** Failed downloads on one map before Retry is offered, even after it loaded. */
export const MAP_ERRORS_FOR_RETRY = 3;
/** Diagnostics written per map, at most — one bad tile source fails hundreds of tiles. */
export const MAX_MAP_REPORTS = 5;
const MAX_ERROR_CHARS = 300;

export interface MapLoadError {
  error: string;
  sourceId: string | null;
  tileId: string | null;
}

/** `onMapLoadingError`'s event — the native payload is { error, sourceId?, tileId? }. */
export function parseMapLoadError(event: unknown): MapLoadError | null {
  const e = event as { nativeEvent?: { payload?: Record<string, unknown> }; payload?: Record<string, unknown> } | null | undefined;
  const p = e?.nativeEvent?.payload ?? e?.payload;
  if (!p || typeof p.error !== 'string' || !p.error) return null;
  return {
    error: p.error,
    sourceId: typeof p.sourceId === 'string' ? p.sourceId : null,
    tileId: typeof p.tileId === 'string' ? p.tileId : null,
  };
}

export function shouldShowMapRetry(s: { openedAtMs: number; nowMs: number; loadedAtMs: number | null; errorCount: number }): boolean {
  if (s.errorCount >= MAP_ERRORS_FOR_RETRY) return true;
  if (s.loadedAtMs != null) return false;
  return s.nowMs - s.openedAtMs >= MAP_STALL_MS;
}

/**
 * True the first time a kind of failure (source + message) is seen on this map, up to
 * MAX_MAP_REPORTS kinds. Records it in `sent`.
 */
export function shouldReportMapError(sent: Set<string>, e: MapLoadError): boolean {
  if (sent.size >= MAX_MAP_REPORTS) return false;
  const key = `${e.sourceId ?? '-'}|${e.error.slice(0, 80)}`;
  if (sent.has(key)) return false;
  sent.add(key);
  return true;
}

export interface MapDiagnosticContext {
  uid: string;
  tripId: string;
  basemap: string;
  flying: boolean;
  appVersion: string | null;
  buildNumber: string | null;
  osVersion: string | null;
  deviceModel: string | null;
  msSinceOpen: number;
}

/** The `mapDiagnostics` document (rules accept exactly these keys plus `createdAt`). */
export function mapDiagnosticDoc(e: MapLoadError, ctx: MapDiagnosticContext) {
  return {
    uid: ctx.uid,
    tripId: ctx.tripId,
    basemap: ctx.basemap,
    flying: ctx.flying,
    error: e.error.slice(0, MAX_ERROR_CHARS),
    sourceId: e.sourceId,
    tileId: e.tileId,
    appVersion: ctx.appVersion,
    buildNumber: ctx.buildNumber,
    osVersion: ctx.osVersion,
    deviceModel: ctx.deviceModel,
    msSinceOpen: ctx.msSinceOpen,
  };
}
