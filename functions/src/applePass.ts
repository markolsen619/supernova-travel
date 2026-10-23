// functions/src/applePass.ts
/**
 * pass.json for a Supernova boarding pass in Apple Wallet (spec 2026-10-22 §2). Pure; signing and zipping happen
 * in appleWalletFunctions.ts. Only whitelisted flight fields — never the owner, notes or booking references.
 */
export const PASS_TYPE_ID = 'pass.com.supernovatravel.app';
export const TEAM_ID = 'R47484PAGA';

export type PassInput = {
  id: string; airline?: string; flightNumber?: string; origin?: string; originCity?: string; destination?: string;
  destinationCity?: string; departureTime?: string; arrivalTime?: string; seat?: string; gate?: string; terminal?: string;
  boardingGroup?: string; barcode?: string; barcodeFormat?: string;
};

const FORMATS: Record<string, string> = {
  aztec: 'PKBarcodeFormatAztec', qr: 'PKBarcodeFormatQR', pdf417: 'PKBarcodeFormatPDF417', code128: 'PKBarcodeFormatCode128',
};

type Field = Record<string, unknown> & { key: string; value: string };
const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const valid = (iso?: string) => !!iso && !Number.isNaN(Date.parse(iso));

export function passJson(p: PassInput): Record<string, unknown> {
  const flight = text(p.flightNumber) ?? text(p.airline) ?? 'Flight';
  const dep = valid(p.departureTime) ? p.departureTime! : null;
  const time = (key: string, label: string, iso: string): Field =>
    ({ key, label, value: iso, timeStyle: 'PKDateStyleShort' });

  const secondary: Field[] = [];
  if (dep) secondary.push(time('departs', 'DEPARTS', dep));
  if (text(p.seat)) secondary.push({ key: 'seat', label: 'SEAT', value: text(p.seat)! });
  if (text(p.boardingGroup)) secondary.push({ key: 'group', label: 'GROUP', value: text(p.boardingGroup)! });

  const auxiliary: Field[] = [{ key: 'flight', label: 'FLIGHT', value: flight }];
  if (text(p.terminal)) auxiliary.push({ key: 'terminal', label: 'TERMINAL', value: text(p.terminal)! });
  if (dep) auxiliary.push({ key: 'date', label: 'DATE', value: dep, dateStyle: 'PKDateStyleMedium' });

  const back: Field[] = [];
  if (text(p.airline)) back.push({ key: 'airline', label: 'Airline', value: text(p.airline)! });
  if (valid(p.arrivalTime)) back.push({ key: 'arrives', label: 'Arrives', value: p.arrivalTime!, dateStyle: 'PKDateStyleMedium', timeStyle: 'PKDateStyleShort' });
  back.push({ key: 'source', label: 'Supernova', value: 'Added from Supernova' });

  const json: Record<string, unknown> = {
    formatVersion: 1,
    passTypeIdentifier: PASS_TYPE_ID,
    teamIdentifier: TEAM_ID,
    serialNumber: `bp-${p.id}`,
    organizationName: 'Supernova',
    description: `Boarding pass ${flight}`,
    logoText: text(p.airline) ?? 'Supernova',
    backgroundColor: 'rgb(26,16,53)',
    foregroundColor: 'rgb(255,255,255)',
    labelColor: 'rgb(196,181,253)',
    boardingPass: {
      transitType: 'PKTransitTypeAir',
      headerFields: [{ key: 'gate', label: 'GATE', value: text(p.gate) ?? '—' }],
      primaryFields: [
        { key: 'origin', label: text(p.originCity) ?? 'FROM', value: text(p.origin) ?? '—' },
        { key: 'destination', label: text(p.destinationCity) ?? 'TO', value: text(p.destination) ?? '—' },
      ],
      secondaryFields: secondary,
      auxiliaryFields: auxiliary,
      backFields: back,
    },
  };
  if (dep) json.relevantDate = dep;
  if (text(p.barcode)) {
    json.barcodes = [{ format: FORMATS[p.barcodeFormat ?? ''] ?? 'PKBarcodeFormatQR', message: text(p.barcode)!, messageEncoding: 'iso-8859-1' }];
  }
  return json;
}
