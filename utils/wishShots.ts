/**
 * Save places from screenshots (spec 2026-11-11): the app's pure rules — the save's id and document, what a share is,
 * and how a share waits for sign-in. A screenshot save is an ordinary wish-list save keyed by `videoId` (= saveId).
 */
import { tiktokUrlFromShare, type WishPlace, type WishSave } from '@/utils/wishlist';

export const newShotSaveId = (randomId: string) => `s${randomId}`;

export function screenshotSaveDoc(
  uid: string, saveId: string,
  read: { city: string | null; country: string | null; cityLat: number | null; cityLng: number | null; places: WishPlace[] },
  keepIds: string[], extra: WishPlace[], shots: string[],
): Omit<WishSave, 'savedAtMs'> {
  const folder = `wish_shots/${uid}/${saveId}/`;
  if (!shots.length || shots.length > 5 || shots.some((s) => !s.startsWith(folder) || !/^[0-4]\.jpg$/.test(s.slice(folder.length)))) throw new Error('bad shots');
  return {
    platform: 'screenshot', videoId: saveId, postUrl: '', author: '', authorHandle: '', caption: '',
    city: read.city, country: read.country, cityLat: read.cityLat, cityLng: read.cityLng,
    places: [...read.places.filter((p) => keepIds.includes(p.id)), ...extra].slice(0, 10), shots,
  };
}

export type ShareKind = { kind: 'link'; url: string } | { kind: 'shots'; uris: string[] };

/** What a share holds: up to 5 images (they win), else a TikTok link, else nothing. */
export function shareKind(share: { webUrl?: string | null; text?: string | null; files?: { path: string; mimeType: string }[] | null }): ShareKind | null {
  const images = (share.files ?? []).filter((f) => f.mimeType?.startsWith('image/') && !!f.path).map((f) => f.path).slice(0, 5);
  if (images.length) return { kind: 'shots', uris: images };
  const url = tiktokUrlFromShare([share.webUrl, share.text].filter(Boolean).join(' '));
  return url ? { kind: 'link', url } : null;
}

export const encodePendingShare = (p: ShareKind) => JSON.stringify(p);

/** A parked share; a plain string (parked by builds before screenshots) is a link. */
export function parsePendingShare(s: string | null): ShareKind | null {
  if (!s) return null;
  if (!s.startsWith('{')) return { kind: 'link', url: s };
  try {
    const p = JSON.parse(s) as { kind?: unknown; url?: unknown; uris?: unknown };
    if (p.kind === 'link' && typeof p.url === 'string') return { kind: 'link', url: p.url };
    if (p.kind === 'shots' && Array.isArray(p.uris)) {
      const uris = p.uris.filter((u): u is string => typeof u === 'string').slice(0, 5);
      if (uris.length) return { kind: 'shots', uris };
    }
  } catch { /* garbage */ }
  return null;
}
