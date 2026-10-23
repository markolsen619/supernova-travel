// __tests__/functions/applePass.test.ts
import { passJson, PASS_TYPE_ID, TEAM_ID } from '../../functions/src/applePass';

const full = {
  id: 'p1', airline: 'British Airways', flightNumber: 'BA117', origin: 'LHR', originCity: 'London', destination: 'JFK', destinationCity: 'New York',
  departureTime: '2026-11-01T09:20:00+00:00', arrivalTime: '2026-11-01T12:30:00-05:00', seat: '14A', gate: 'B3', terminal: '5', boardingGroup: '2',
  barcode: 'M1OLSEN/MARK EABC123 LHRJFKBA 0117', barcodeFormat: 'pdf417',
};
const fields = (j: Record<string, any>, area: string) => (j.boardingPass[area] ?? []) as { key: string; label?: string; value: string; ignoresTimeZone?: boolean }[];
const keys = (j: Record<string, any>, area: string) => fields(j, area).map((f) => f.key);

describe('passJson', () => {
  it('identifies the pass so adding it again replaces it', () => {
    const j = passJson(full);
    expect(j.passTypeIdentifier).toBe(PASS_TYPE_ID);
    expect(j.teamIdentifier).toBe(TEAM_ID);
    expect(j.serialNumber).toBe('bp-p1');
    expect(j.formatVersion).toBe(1);
  });
  it('is an air boarding pass with route, times, seat and gate', () => {
    const j = passJson(full);
    expect(j.boardingPass).toMatchObject({ transitType: 'PKTransitTypeAir' });
    expect(fields(j, 'primaryFields')).toEqual([
      { key: 'origin', label: 'London', value: 'LHR' },
      { key: 'destination', label: 'New York', value: 'JFK' },
    ]);
    expect(keys(j, 'headerFields')).toEqual(['gate']);
    expect(keys(j, 'secondaryFields')).toEqual(['departs', 'seat', 'group']);
    expect(keys(j, 'auxiliaryFields')).toEqual(['flight', 'terminal', 'date']);
    expect(j.relevantDate).toBe('2026-11-01T09:20:00+00:00');
  });
  it('lets Wallet show times in the phone\'s time zone (times are stored in UTC, not the airport offset)', () => {
    const j = passJson({ ...full, departureTime: '2026-11-01T22:30:00.000Z' });
    const departs = fields(j, 'secondaryFields').find((f) => f.key === 'departs')!;
    expect(departs.value).toBe('2026-11-01T22:30:00.000Z');
    expect('ignoresTimeZone' in departs).toBe(false);
    expect(JSON.stringify(j)).not.toContain('ignoresTimeZone');
  });
  it('uses the real barcode format', () => {
    expect(passJson(full).barcodes).toEqual([{ format: 'PKBarcodeFormatPDF417', message: full.barcode, messageEncoding: 'iso-8859-1' }]);
    expect((passJson({ ...full, barcodeFormat: 'aztec' }).barcodes as any)[0].format).toBe('PKBarcodeFormatAztec');
    expect((passJson({ ...full, barcodeFormat: 'code128' }).barcodes as any)[0].format).toBe('PKBarcodeFormatCode128');
    expect((passJson({ ...full, barcodeFormat: 'weird' }).barcodes as any)[0].format).toBe('PKBarcodeFormatQR');
    expect((passJson({ ...full, barcodeFormat: undefined }).barcodes as any)[0].format).toBe('PKBarcodeFormatQR');
  });
  it('has no barcode block when there is no barcode', () => {
    expect('barcodes' in passJson({ ...full, barcode: undefined })).toBe(false);
  });
  it('leaves out optional fields that are missing instead of showing blanks', () => {
    const j = passJson({ id: 'p2', flightNumber: 'BA1', origin: 'LHR', destination: 'JFK', departureTime: '2026-11-01T09:20:00Z' });
    expect(fields(j, 'headerFields')).toEqual([{ key: 'gate', label: 'GATE', value: '—' }]);
    expect(keys(j, 'secondaryFields')).toEqual(['departs']);
    expect(keys(j, 'auxiliaryFields')).toEqual(['flight', 'date']);
    expect(JSON.stringify(j)).not.toMatch(/undefined|null/);
  });
  it('never carries personal or booking fields', () => {
    const j = passJson({ ...full, ...({ notes: 'secret note', confirmationCode: 'XYZ789', ownerUid: 'u1', email: 'a@b.c' } as object) });
    expect(JSON.stringify(j)).not.toMatch(/secret note|XYZ789|u1|a@b\.c/);
  });
  it('uses the boarding-pass colours', () => {
    const j = passJson(full);
    expect(j.backgroundColor).toBe('rgb(26,16,53)');
    expect(j.foregroundColor).toBe('rgb(255,255,255)');
    expect(j.labelColor).toBe('rgb(196,181,253)');
  });
});
