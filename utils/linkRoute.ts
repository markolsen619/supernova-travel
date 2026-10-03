/**
 * The screen a link that launched the app is about, or null to leave the
 * launch alone. Only shared trips today: `https://supernova-a2125.web.app/trip/{id}`
 * (universal link) and `supernova://trip/{id}` (the web page's button).
 */
const TRIP_ID = /^[A-Za-z0-9]{1,64}$/;

export function resolveLinkRoute(url: string | null | undefined): string | null {
  if (!url) return null;
  let path: string;
  if (url.startsWith('supernova://')) {
    path = '/' + url.slice('supernova://'.length);
  } else {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return null;
    }
    if (u.protocol !== 'https:' || u.host !== 'supernova-a2125.web.app') return null;
    path = u.pathname;
  }
  const [, first, id, ...rest] = path.split(/[?#]/)[0].split('/');
  if (first !== 'trip' || !id || !TRIP_ID.test(id) || rest.some(Boolean)) return null;
  return `/trip/${id}`;
}
