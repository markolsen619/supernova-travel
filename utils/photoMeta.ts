/**
 * When and where a picked photo was taken, from the picker's EXIF (expo-image-picker `exif: true`).
 * iOS nests `{Exif}` / `{GPS}`; Android is flat with rational strings. Times are as printed — never converted
 * (spec 2026-10-25-past-trips-from-photos). Coordinates stay on the phone: they only group and name stops.
 */
export interface PhotoMeta { day: string | null; minutes: number | null; lat: number | null; lng: number | null }

const NONE: PhotoMeta = { day: null, minutes: null, lat: null, lng: null };

function rationalOrNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string' || !v.trim()) return null;
  const parts = v.split(',').map((p) => {
    const [n, d] = p.trim().split('/').map(Number);
    return d ? n / d : n;
  });
  if (parts.some((p) => !Number.isFinite(p))) return null;
  const [deg = 0, min = 0, sec = 0] = parts;
  return parts.length === 1 ? deg : deg + min / 60 + sec / 3600;
}

function signed(value: number | null, ref: unknown, negative: string): number | null {
  if (value === null) return null;
  return typeof ref === 'string' && ref.toUpperCase() === negative ? -Math.abs(value) : value;
}

function printedTime(v: unknown): { day: string; minutes: number } | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as unknown as number[];
  if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return { day: `${m[1]}-${m[2]}-${m[3]}`, minutes: h * 60 + mi };
}

export function photoMeta(exif: Record<string, unknown> | null | undefined): PhotoMeta {
  if (!exif || typeof exif !== 'object') return { ...NONE };
  const ex = (exif['{Exif}'] as Record<string, unknown> | undefined) ?? exif;
  const gps = exif['{GPS}'] as Record<string, unknown> | undefined;
  const t = printedTime(ex.DateTimeOriginal) ?? printedTime(exif.DateTimeOriginal) ?? printedTime(exif.DateTime)
    ?? printedTime((exif['{TIFF}'] as Record<string, unknown> | undefined)?.DateTime);
  const lat = gps ? signed(rationalOrNumber(gps.Latitude), gps.LatitudeRef, 'S') : signed(rationalOrNumber(exif.GPSLatitude), exif.GPSLatitudeRef, 'S');
  const lng = gps ? signed(rationalOrNumber(gps.Longitude), gps.LongitudeRef, 'W') : signed(rationalOrNumber(exif.GPSLongitude), exif.GPSLongitudeRef, 'W');
  const located = lat !== null && lng !== null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
  return { day: t?.day ?? null, minutes: t?.minutes ?? null, lat: located ? lat : null, lng: located ? lng : null };
}
