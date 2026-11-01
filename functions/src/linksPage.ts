/**
 * The Instagram / TikTok bio link page (supernovatravel.xyz, and /links on the Hosting site; owner, 2026-11-01):
 * the star and a one-line pitch, an optional promo card, the two store badges, and featured Supernova trips that
 * open their share pages (the app, when installed). Pure: no firebase-admin, so it is unit-tested;
 * linksPageFunction.ts reads `appConfig/links` and the photos. The promo and the trips are data, changed without
 * a deploy or an app update.
 */
import { escapeHtml } from './tripPreview';
import { APP_STORE_URL, type PagePlatform } from './tripInviteLinks';

export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.supernovatravel.app';
const TRIP_BASE = 'https://supernova-a2125.web.app/trip/';

export interface LinksPromo { eyebrow: string; title: string; body: string; cta: string }
export interface LinksConfig { promo: LinksPromo | null; trips: { tripId: string; city: string; query: string }[] }
export interface LinksTrip { id: string; city: string; days: number | null; title: string; photoUrl: string | null; credit: string | null }

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export function parseLinksConfig(raw: unknown): LinksConfig {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const p = (r.promo && typeof r.promo === 'object' ? r.promo : null) as Record<string, unknown> | null;
  const promo = p && str(p.title)
    ? { eyebrow: str(p.eyebrow), title: str(p.title), body: str(p.body), cta: str(p.cta) || 'Get the app' }
    : null;
  const trips = (Array.isArray(r.trips) ? r.trips : [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
    .map((t) => ({ tripId: str(t.tripId), city: str(t.city), query: str(t.query) || str(t.city) }))
    .filter((t) => /^[A-Za-z0-9]+$/.test(t.tripId) && !!t.city);
  return { promo, trips };
}

/** This phone's store: Android → Google Play, everything else → the App Store. */
export const storeHref = (platform: PagePlatform) => (platform === 'android' ? PLAY_STORE_URL : APP_STORE_URL);

/** Only https images without an API key in them are ever published. */
const safePhoto = (url: string | null) => {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.searchParams.has('key') && !/AIza/.test(url) ? url : null;
  } catch {
    return null;
  }
};

const STYLES = `
  :root {
    color-scheme: dark;
    --void:#0B0A12; --elevated:#171422; --raised:#1F1B2D; --hairline:#2A2636;
    --text:#F5F3F9; --secondary:#A9A2BA; --muted:#7D768E;
    --purple:#7F77DD; --pink:#D4537E; --blue:#60A5FA;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--void); color:var(--text);
    font:16px/1.45 -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing:antialiased; }
  .page { max-width:460px; margin:0 auto; padding-inline:20px; padding-block:28px 40px; display:flex; flex-direction:column; gap:28px; }
  .sky { position:fixed; inset:0; pointer-events:none; background:
      radial-gradient(60% 40% at 20% 0%, rgba(127,119,221,.22), transparent 70%),
      radial-gradient(50% 35% at 95% 8%, rgba(212,83,126,.14), transparent 70%); }
  header { position:relative; display:flex; flex-direction:column; gap:14px; }
  .brand { display:flex; align-items:center; gap:14px; }
  .mark { width:68px; height:68px; border-radius:18px; background:#000; display:grid; place-items:center;
    box-shadow:0 0 0 1px var(--hairline), 0 10px 40px rgba(127,119,221,.35); }
  .mark img { width:48px; height:48px; }
  h1 { margin:0; font-size:30px; line-height:1.05; letter-spacing:-.02em; font-weight:700; }
  .handle { color:var(--muted); font-size:14px; margin-top:4px; }
  .lede { margin:0; color:var(--secondary); font-size:16px; max-width:36ch; text-wrap:pretty; }
  .promo { position:relative; overflow:hidden; border-radius:22px; padding:22px 20px 20px;
    background:linear-gradient(135deg, #8A80E6 0%, #A15FB8 48%, var(--pink) 100%);
    box-shadow:0 18px 50px -18px rgba(212,83,126,.55); display:flex; flex-direction:column; gap:6px; }
  .promo::after { content:""; position:absolute; right:-40px; top:-40px; width:160px; height:160px; border-radius:50%;
    background:radial-gradient(circle, rgba(255,255,255,.28), transparent 65%); }
  .promo .eyebrow { color:rgba(255,255,255,.82); }
  .promo h2 { margin:2px 0 0; font-size:24px; line-height:1.15; letter-spacing:-.015em; font-weight:700; text-wrap:balance; }
  .promo p { margin:0; color:rgba(255,255,255,.88); font-size:15px; }
  .btn-white { margin-top:14px; display:flex; align-items:center; justify-content:center; min-height:52px; border-radius:999px;
    background:#fff; color:#3A2E7A; font-weight:700; font-size:16px; text-decoration:none; }
  section { display:flex; flex-direction:column; gap:14px; }
  h3 { margin:0; font-size:19px; letter-spacing:-.01em; font-weight:650; }
  .sub { margin:-8px 0 0; color:var(--muted); font-size:14px; }
  .stores { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .free { color:var(--muted); font-size:13px; text-align:center; margin:-2px 0 0; }
  .trips { display:flex; flex-direction:column; gap:10px; }
  .trip { display:flex; align-items:center; gap:14px; padding:10px 12px 10px 10px; border-radius:18px; background:var(--elevated);
    border:1px solid var(--hairline); color:inherit; text-decoration:none; min-height:96px; }
  .trip img { width:76px; height:76px; border-radius:13px; object-fit:cover; flex:none; background:var(--raised); }
  .trip-text { display:flex; flex-direction:column; gap:4px; min-width:0; flex:1; }
  .eyebrow { font-size:11px; font-weight:600; letter-spacing:.09em; color:#B9B2F0; }
  .trip-title { font-size:16px; font-weight:600; line-height:1.25; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
  .chev { width:20px; height:20px; color:var(--muted); flex:none; }
  a:focus-visible { outline:2px solid var(--blue); outline-offset:3px; }
  footer { display:flex; justify-content:center; gap:22px; color:var(--muted); font-size:13px; padding-top:4px; }
  footer a { color:inherit; text-decoration:none; min-height:44px; display:flex; align-items:center; }
  @media (max-width:360px) { .stores { grid-template-columns:1fr; } }
  .stores a { display:flex; align-items:center; justify-content:center; min-height:54px; border-radius:12px; }
  .stores img { width:auto; max-width:100%; display:block; }
  .badge-apple { height:46px; }
  /* Google's badge carries its own transparent margin. */
  .badge-play { height:68px; margin-block:-11px; }
  .credit { font-size:10px; color:var(--muted); }
`;

const STAR = '/links/star.png';

export function renderLinksPage(a: { promo: LinksPromo | null; trips: LinksTrip[]; platform: PagePlatform }): string {
  const promo = a.promo ? `
  <div class="promo">
    ${a.promo.eyebrow ? `<span class="eyebrow">${escapeHtml(a.promo.eyebrow)}</span>` : ''}
    <h2>${escapeHtml(a.promo.title)}</h2>
    ${a.promo.body ? `<p>${escapeHtml(a.promo.body)}</p>` : ''}
    <a class="btn-white" href="${escapeHtml(storeHref(a.platform))}">${escapeHtml(a.promo.cta)}</a>
  </div>` : '';
  const trips = a.trips.map((t) => {
    const photo = safePhoto(t.photoUrl);
    const eyebrow = `${t.city.toUpperCase()}${t.days ? ` · ${t.days} ${t.days === 1 ? 'DAY' : 'DAYS'}` : ''}`;
    return `
      <a class="trip" href="${TRIP_BASE}${escapeHtml(t.id)}">
        ${photo ? `<img src="${escapeHtml(photo)}" alt="" width="76" height="76" loading="lazy">` : '<span class="trip-ph" aria-hidden="true"></span>'}
        <span class="trip-text">
          <span class="eyebrow">${escapeHtml(eyebrow)}</span>
          <span class="trip-title">${escapeHtml(t.title)}</span>
          ${photo && t.credit ? `<span class="credit">Photo: ${escapeHtml(t.credit)}</span>` : ''}
        </span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </a>`;
  }).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Supernova · Plan the trip, keep the trip</title>
<meta name="description" content="Day-by-day itineraries, your bookings and boarding passes, and trips with friends, in one free app.">
<meta property="og:title" content="Supernova">
<meta property="og:description" content="Plan the trip, keep the trip. Free on iPhone and Android.">
<meta property="og:image" content="https://supernova-a2125.web.app/apple-touch-icon.png">
<meta name="theme-color" content="#0B0A12">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" href="/favicon.png">
<style>${STYLES}
  .trip-ph { width:76px; height:76px; border-radius:13px; flex:none; background:linear-gradient(135deg, rgba(127,119,221,.35), rgba(212,83,126,.3)); }
</style>
</head>
<body>
<div class="sky" aria-hidden="true"></div>
<main class="page">
  <header>
    <div class="brand">
      <div class="mark"><img src="${STAR}" alt=""></div>
      <div>
        <h1>Supernova</h1>
        <div class="handle">Travel planner · iPhone &amp; Android</div>
      </div>
    </div>
    <p class="lede">Plan the trip, keep the trip. Day-by-day itineraries, your bookings and boarding passes, and trips with friends, in one free app.</p>
  </header>
${promo}
  <section aria-labelledby="dl">
    <h3 id="dl">Download the free app</h3>
    <div class="stores">
      <a href="${APP_STORE_URL}" aria-label="Download on the App Store"><img class="badge-apple" src="/links/app-store-badge.svg" alt="Download on the App Store"></a>
      <a href="${PLAY_STORE_URL}" aria-label="Get it on Google Play"><img class="badge-play" src="/links/google-play-badge.png" alt="Get it on Google Play"></a>
    </div>
    <p class="free">Free to download. Pro is optional.</p>
  </section>
${trips ? `
  <section aria-labelledby="tr">
    <h3 id="tr">Trips to start from</h3>
    <p class="sub">Itineraries from the Supernova team. Open one and make it yours.</p>
    <div class="trips">${trips}
    </div>
  </section>` : ''}
  <footer><a href="https://supernova-a2125.web.app/terms">Terms</a><a href="https://supernova-a2125.web.app/privacy">Privacy</a><a href="https://supernova-a2125.web.app/support">Support</a></footer>
</main>
</body>
</html>`;
}
