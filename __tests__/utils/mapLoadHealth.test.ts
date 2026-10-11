import {
  MAP_STALL_MS,
  MAX_MAP_REPORTS,
  mapDiagnosticDoc,
  parseMapLoadError,
  shouldReportMapError,
  shouldShowMapRetry,
} from '@/utils/mapLoadHealth';

describe('parseMapLoadError', () => {
  it('reads the payload the native map sends', () => {
    expect(parseMapLoadError({ nativeEvent: { payload: { error: 'HTTP 403', sourceId: 'satellite', tileId: 'x:1 y:2 z:12' } } }))
      .toEqual({ error: 'HTTP 403', sourceId: 'satellite', tileId: 'x:1 y:2 z:12' });
    expect(parseMapLoadError({ payload: { error: 'timed out' } })).toEqual({ error: 'timed out', sourceId: null, tileId: null });
  });
  it('ignores anything without an error message', () => {
    expect(parseMapLoadError(undefined)).toBeNull();
    expect(parseMapLoadError({ nativeEvent: { payload: {} } })).toBeNull();
  });
});

describe('shouldShowMapRetry', () => {
  const base = { openedAtMs: 0, loadedAtMs: null as number | null, errorCount: 0 };
  it('waits while a fresh map is still loading', () => {
    expect(shouldShowMapRetry({ ...base, nowMs: MAP_STALL_MS - 1 })).toBe(false);
  });
  it('offers a retry once the map has stalled', () => {
    expect(shouldShowMapRetry({ ...base, nowMs: MAP_STALL_MS })).toBe(true);
  });
  it('offers a retry when downloads keep failing, loaded or not', () => {
    expect(shouldShowMapRetry({ ...base, loadedAtMs: 500, nowMs: 1000, errorCount: 3 })).toBe(true);
    expect(shouldShowMapRetry({ ...base, loadedAtMs: 500, nowMs: 1000, errorCount: 2 })).toBe(false);
  });
  it('stays quiet once the map has loaded', () => {
    expect(shouldShowMapRetry({ ...base, loadedAtMs: 800, nowMs: MAP_STALL_MS * 2 })).toBe(false);
  });
});

describe('shouldReportMapError', () => {
  it('sends each kind of failure once, and only a few per map', () => {
    const sent = new Set<string>();
    const e = { error: 'HTTP 403', sourceId: 'satellite', tileId: 'x:1 y:2 z:12' };
    expect(shouldReportMapError(sent, e)).toBe(true);
    // Same source and message on another tile: already known.
    expect(shouldReportMapError(sent, { ...e, tileId: 'x:2 y:2 z:12' })).toBe(false);
    for (let i = 1; i < MAX_MAP_REPORTS; i++) expect(shouldReportMapError(sent, { ...e, error: `err ${i}` })).toBe(true);
    expect(shouldReportMapError(sent, { ...e, error: 'one too many' })).toBe(false);
  });
});

describe('mapDiagnosticDoc', () => {
  it('keeps what explains the failure and trims long messages', () => {
    const doc = mapDiagnosticDoc(
      { error: 'x'.repeat(900), sourceId: 'composite', tileId: null },
      { uid: 'u1', tripId: 't1', basemap: 'satellite', flying: false, appVersion: '1.0.4', buildNumber: '33', osVersion: '26.1', deviceModel: 'iPhone18,1', msSinceOpen: 4200 },
    );
    expect(doc).toEqual({
      uid: 'u1', tripId: 't1', basemap: 'satellite', flying: false,
      error: 'x'.repeat(300), sourceId: 'composite', tileId: null,
      appVersion: '1.0.4', buildNumber: '33', osVersion: '26.1', deviceModel: 'iPhone18,1', msSinceOpen: 4200,
    });
  });
});
