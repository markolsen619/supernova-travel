/**
 * Open in Maps (owner, 2026-11-08): directions to a stop or place. Only its position, name and Google place id go in
 * the link; nothing is sent to us. Google's universal link opens the Google Maps app when it's installed. Pure.
 */
type Target = { name: string; lat: number; lng: number; placeId?: string | null };

export const appleMapsUrl = (t: Target) => `https://maps.apple.com/?daddr=${t.lat},${t.lng}&q=${encodeURIComponent(t.name)}`;

export function googleMapsUrl(t: Target): string {
  const p = new URLSearchParams({ api: '1', destination: `${t.lat},${t.lng}` });
  if (t.placeId) p.set('destination_place_id', t.placeId);
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}
