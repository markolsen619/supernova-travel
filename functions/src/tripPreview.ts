/**
 * The web page behind a shared trip link (`/trip/{id}`). Pure: no
 * firebase-admin, so it is unit-tested. `tripPreviewFunction.ts` reads the
 * trip and renders through here.
 *
 * The page must never show what the app's rules would hide, so only a public
 * trip by a public account that isn't moderation-hidden gets its details;
 * everything else gets the generic page.
 */

const APP_STORE_URL = 'https://apps.apple.com/app/id6810490710';
const MAX_STOPS = 5;

export interface PreviewTrip {
  id: string;
  title: string;
  coverImageUrl: string | null;
  placeLabel: string;
  days: number;
  authorName: string;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function previewEligibility(
  trip: { visibility?: unknown; moderationHidden?: unknown } | null | undefined,
  author: { settings?: { privacy?: unknown } } | null | undefined,
): boolean {
  if (!trip || !author) return false;
  return trip.visibility === 'public'
    && trip.moderationHidden !== true
    && author.settings?.privacy !== 'private';
}

/** `/trip/{id}` → id. Firestore auto-ids are alphanumeric; anything else is not a trip. */
export function tripIdFromPath(path: string): string | null {
  const m = /^\/trip\/([A-Za-z0-9]+)\/?$/.exec(path);
  return m ? m[1] : null;
}

export type CoverLookup =
  | { kind: 'places'; url: string }
  | { kind: 'direct'; url: string }
  | { kind: 'none' };

/**
 * How the page gets a trip's cover. A Places photo URL carries our API key,
 * so it is never published: the function asks Google for the photo's own
 * key-less address (`skipHttpRedirect` returns it as JSON) and uses that.
 * Any other https image is used as is, unless it carries a key too.
 */
export function coverLookup(url: string | null | undefined): CoverLookup {
  if (!url) return { kind: 'none' };
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return { kind: 'none' };
  }
  if (u.protocol !== 'https:') return { kind: 'none' };
  if (u.host === 'places.googleapis.com' && /^\/v1\/places\/[^/]+\/photos\/[^/]+\/media$/.test(u.pathname)) {
    u.searchParams.set('skipHttpRedirect', 'true');
    return { kind: 'places', url: u.toString() };
  }
  if (u.searchParams.has('key')) return { kind: 'none' };
  return { kind: 'direct', url };
}

const dayLabel = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

const STYLES = `
  :root { --canvas:#FBF9F5; --surface:#FFFFFF; --hairline:#E5DDD2; --text:#1F1C19; --secondary:#6B6157; --muted:#9A8F82; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--canvas); color:var(--text);
    font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing:antialiased; }
  main { max-width:560px; margin:0 auto; padding:24px 20px 48px; }
  .brand { font-size:13px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); margin:0 0 20px; }
  .cover { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:20px; display:block; background:#F0EAE0; }
  .eyebrow { margin:20px 0 6px; font-size:11px; font-weight:500; letter-spacing:0.08em; color:var(--muted); }
  h1 { margin:0; font-size:28px; line-height:1.15; font-weight:600; letter-spacing:-0.02em; }
  .by { margin:8px 0 0; color:var(--secondary); }
  ol { margin:24px 0 0; padding:0; list-style:none; border-top:0.5px solid var(--hairline); }
  li { padding:12px 0; border-bottom:0.5px solid var(--hairline); }
  .cta { display:block; margin-top:32px; padding:15px 20px; border-radius:12px; text-align:center;
    background:var(--text); color:var(--canvas); text-decoration:none; font-weight:600; }
  .link { display:block; margin-top:12px; padding:12px; text-align:center; color:var(--secondary); text-decoration:none; }
  .lede { color:var(--secondary); margin:8px 0 0; }
`;

function page(head: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>${STYLES}</style>
</head>
<body><main>
<p class="brand">Supernova</p>
${body}
</main></body>
</html>`;
}

/** The trip's page, or with `trip` null the generic page that shows nothing about it. */
export function renderTripPreview(trip: PreviewTrip | null, stops: string[]): string {
  if (!trip) {
    const title = 'Supernova — plan your next trip';
    return page(
      `<title>${title}</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="Itineraries, maps and travel friends in one app.">
<meta property="og:site_name" content="Supernova">`,
      `<h1>Plan your next trip with Supernova</h1>
<p class="lede">This trip opens in the app.</p>
<a class="cta" href="supernova://">Open in Supernova</a>
<a class="link" href="${APP_STORE_URL}">Get the app</a>`,
    );
  }

  const title = escapeHtml(trip.title);
  const description = escapeHtml(`${trip.placeLabel} · ${dayLabel(trip.days)} on Supernova`);
  const eyebrow = escapeHtml(`${trip.placeLabel} · ${dayLabel(trip.days)}`.toUpperCase());
  const cover = trip.coverImageUrl ? escapeHtml(trip.coverImageUrl) : null;
  const stopItems = stops.slice(0, MAX_STOPS).map((s) => `<li>${escapeHtml(s)}</li>`).join('\n');

  return page(
    `<title>${title} · Supernova</title>
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:site_name" content="Supernova">
<meta property="og:type" content="website">
${cover ? `<meta property="og:image" content="${cover}">\n<meta name="twitter:card" content="summary_large_image">` : '<meta name="twitter:card" content="summary">'}`,
    `${cover ? `<img class="cover" src="${cover}" alt="">` : ''}
<p class="eyebrow">${eyebrow}</p>
<h1>${title}</h1>
<p class="by">by ${escapeHtml(trip.authorName)}</p>
${stopItems ? `<ol>\n${stopItems}\n</ol>` : ''}
<a class="cta" href="supernova://trip/${escapeHtml(trip.id)}">Open in Supernova</a>
<a class="link" href="${APP_STORE_URL}">Get the app</a>`,
  );
}
