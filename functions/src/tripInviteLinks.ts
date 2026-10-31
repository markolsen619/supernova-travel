/**
 * Trip invite links (spec 2026-10-30-trip-invite-links-design.md). Pure: no firebase-admin, so it is unit-tested;
 * `tripInviteLinkFunctions.ts` does the reads and writes. A link adds at most one person, once, within 30 days,
 * and only while its inviter is still on the trip.
 */
import { escapeHtml } from './tripPreview';

export const INVITE_TTL_MS = 30 * 86_400_000;
export const MAX_OPEN_PER_TRIP = 20;
export const MAX_PER_DAY = 50;
const HOST = 'https://supernova-a2125.web.app';
export const APP_STORE_URL = 'https://apps.apple.com/app/id6810490710';
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 16 × a-z0-9 from random bytes; bytes ≥ 252 are skipped so every character is equally likely. */
export function makeToken(bytes: Uint8Array): string | null {
  let out = '';
  for (const b of bytes) {
    if (b >= 252) continue;
    out += ALPHABET[b % 36];
    if (out.length === 16) return out;
  }
  return null;
}

export const isToken = (s: unknown): s is string => typeof s === 'string' && /^[a-z0-9]{16}$/.test(s);
export const inviteUrl = (token: string) => `${HOST}/join/${token}`;
export const playStoreUrl = (token: string) =>
  `https://play.google.com/store/apps/details?id=com.supernovatravel.app&referrer=${encodeURIComponent(`invite=${token}`)}`;

export function firstName(full: unknown): string {
  const w = typeof full === 'string' ? full.trim().split(/\s+/)[0] : '';
  return w || 'A friend';
}

export const inviteMessage = (inviterFirst: string, tripTitle: string, url: string) =>
  `${inviterFirst} invited you to ${tripTitle} on Supernova. Join the trip: ${url}`;

export type InviteLink = { tripId: string; inviterUid: string; status: 'open' | 'used' | 'cancelled'; expiresAtMs: number };

export function linkDecision(i: {
  link: InviteLink | null; nowMs: number; tripExists: boolean; inviterOnTrip: boolean;
  callerUid: string; callerIsMember: boolean; blocked: boolean;
}): 'join' | 'member' | 'expired' | 'self' | 'blocked' {
  if (i.tripExists && i.callerIsMember) return 'member';
  if (!i.link || !i.tripExists || i.link.status !== 'open' || i.nowMs >= i.link.expiresAtMs || !i.inviterOnTrip) return 'expired';
  if (i.callerUid === i.link.inviterUid) return 'self';
  if (i.blocked) return 'blocked';
  return 'join';
}

export const canCreateLink = (openForTrip: number, createdToday: number) =>
  openForTrip < MAX_OPEN_PER_TRIP && createdToday < MAX_PER_DAY;

export const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function tokenFromJoinPath(path: string): string | null {
  const m = /^\/join\/([a-z0-9]{16})\/?$/.exec(path);
  return m ? m[1] : null;
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
export function formatTripDates(start: Date | null, end: Date | null): string | null {
  if (!start) return null;
  const s = `${MONTHS[start.getUTCMonth()]} ${start.getUTCDate()}`;
  if (!end) return s;
  const e = end.getUTCMonth() === start.getUTCMonth() ? `${end.getUTCDate()}` : `${MONTHS[end.getUTCMonth()]} ${end.getUTCDate()}`;
  return `${s} – ${e}`;
}

const STYLES = `
  :root { --canvas:#FBF9F5; --hairline:#E5DDD2; --text:#1F1C19; --secondary:#6B6157; --muted:#9A8F82; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--canvas); color:var(--text); font:15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width:560px; margin:0 auto; padding:24px 20px 48px; }
  .brand { font-size:13px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:var(--muted); margin:0 0 20px; }
  .cover { width:100%; aspect-ratio:4/3; object-fit:cover; border-radius:20px; display:block; background:#F0EAE0; }
  .eyebrow { margin:20px 0 6px; font-size:11px; font-weight:500; letter-spacing:0.08em; color:var(--muted); }
  h1 { margin:0; font-size:28px; line-height:1.15; font-weight:600; letter-spacing:-0.02em; }
  .lede { color:var(--secondary); margin:8px 0 0; }
  .cta { display:block; margin-top:28px; padding:15px 20px; border-radius:12px; text-align:center; background:var(--text); color:var(--canvas); text-decoration:none; font-weight:600; }
  .store { display:block; margin-top:12px; padding:14px 20px; border-radius:12px; text-align:center; border:0.5px solid var(--hairline); color:var(--text); text-decoration:none; font-weight:600; }
  .note { margin-top:16px; color:var(--muted); font-size:13px; text-align:center; }
`;

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<title>${title}</title>
<style>${STYLES}</style>
</head>
<body><main>
<p class="brand">Supernova</p>
${body}
</main></body>
</html>`;
}

export function renderJoinPage(
  invite: { token: string; inviterFirst: string; tripTitle: string; dates: string | null; coverUrl: string | null } | null,
  opts: { inviterFirst?: string | null },
): string {
  if (!invite) {
    const who = opts.inviterFirst ? escapeHtml(opts.inviterFirst) : 'your friend';
    return page('Invite expired · Supernova', `
<h1>This invite has expired. Ask ${who} for a new one.</h1>
<p class="lede">Supernova plans trips together: one itinerary, a shared packing list and every booking in one place.</p>
<a class="store" href="${APP_STORE_URL}">Download on the App Store</a>
<a class="store" href="https://play.google.com/store/apps/details?id=com.supernovatravel.app">Get it on Google Play</a>`);
  }
  const who = escapeHtml(invite.inviterFirst);
  const title = escapeHtml(invite.tripTitle);
  const cover = invite.coverUrl ? `<img class="cover" src="${escapeHtml(invite.coverUrl)}" alt="">` : '';
  const dates = invite.dates ? `<p class="eyebrow">${escapeHtml(invite.dates)}</p>` : '<p class="eyebrow">TRIP INVITE</p>';
  return page(`${who} invited you to ${title} · Supernova`, `
${cover}
${dates}
<h1>${who} invited you to ${title}</h1>
<p class="lede">Join the trip on Supernova to plan it together.</p>
<a class="cta" href="${escapeHtml(inviteUrl(invite.token))}">Open in Supernova</a>
<a class="store" href="${APP_STORE_URL}">Download on the App Store</a>
<a class="store" href="${escapeHtml(playStoreUrl(invite.token))}">Get it on Google Play</a>
<p class="note">On iPhone? After installing, come back and tap Open in Supernova.</p>`);
}
