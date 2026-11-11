/**
 * Save places from screenshots (spec 2026-11-11): the server's pure rules — the request, the images' paths, and the
 * prompt. TikTok stopped sharing post details on 2026-11-10; screenshots work for any app and can't be switched off.
 */
export function validShotsRequest(data: unknown): { saveId: string; count: number } | null {
  const d = data as { saveId?: unknown; count?: unknown } | null;
  if (!d || typeof d !== 'object') return null;
  if (typeof d.saveId !== 'string' || !/^s[A-Za-z0-9]{20}$/.test(d.saveId)) return null;
  if (typeof d.count !== 'number' || !Number.isInteger(d.count) || d.count < 1 || d.count > 5) return null;
  return { saveId: d.saveId, count: d.count };
}

export const shotPaths = (uid: string, saveId: string, count: number) =>
  Array.from({ length: count }, (_, i) => `wish_shots/${uid}/${saveId}/${i}.jpg`);

export const SHOTS_SYSTEM = [
  'You read screenshots a traveler took of travel posts (captions, on-screen text, signs, menus, location tags, maps)',
  'and list the specific places they show or name: restaurants, bars, cafes, sights, hotels, activities, shops.',
  'Only places shown or named — never guess from the topic or the scenery. For each, its city when shown or clearly',
  'implied. Also the main city and country of the screenshots, or null. At most 10 places. Names exactly as written.',
].join(' ');

export const SHOTS_PROMPT = 'Find the places in these screenshots.';
