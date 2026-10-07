#!/usr/bin/env node
/**
 * Gift Supernova Pro to someone by username — no card, no renewal.
 *
 *   node scripts/gift-pro.mjs kellbell424              # 365 days
 *   node scripts/gift-pro.mjs kellbell424 --days 30
 *   node scripts/gift-pro.mjs kellbell424 --lifetime
 *   node scripts/gift-pro.mjs uid:Dsmjg2lLz…           # exact account (usernames can collide with leftover profiles)
 *   node scripts/gift-pro.mjs kellbell424 --dry-run    # look up only
 *
 * Grants a RevenueCat *promotional* entitlement (the allowed way to comp an
 * account; a home-made in-app code would break App Store 3.1.1), then sets
 * users/{uid}.tier from RevenueCat's answer the same way reconcileTier does,
 * so it shows at once. When it ends, the app's tier check notices the
 * mismatch and reconcileTier moves them back to free.
 *
 * Needs: ~/.config/supernova/service-account.json, REVENUECAT_SECRET_API_KEY
 * in functions/.env, and `cd functions && npm run build` (uses lib/tierEvents.js).
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const admin = require('firebase-admin');
const { PRO_ENTITLEMENT_ID, tierFromSubscriber } = require(join(root, 'functions', 'lib', 'tierEvents.js'));

const args = process.argv.slice(2);
const username = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const lifetime = args.includes('--lifetime');
const daysArg = args.indexOf('--days');
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 365;
if (!username || !Number.isInteger(days) || days < 1 || days > 3650) {
  console.error('Usage: node scripts/gift-pro.mjs <username|uid:UID> [--days N | --lifetime] [--dry-run]');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(join(root, 'functions', '.env'), 'utf8').split('\n')
    .filter((l) => l.includes('=') && !l.startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
const RC_KEY = env.REVENUECAT_SECRET_API_KEY;
if (!RC_KEY) throw new Error('REVENUECAT_SECRET_API_KEY missing from functions/.env');

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(readFileSync(join(homedir(), '.config/supernova/service-account.json'), 'utf8'))),
});
const db = admin.firestore();

// A username can belong to a leftover profile with no login behind it; prefer one that can sign in.
async function resolve(who) {
  if (who.startsWith('uid:')) {
    const snap = await db.doc(`users/${who.slice(4)}`).get();
    if (!snap.exists) throw new Error(`No profile ${who}`);
    return snap;
  }
  const matches = (await db.collection('users').where('username', '==', who.toLowerCase()).get()).docs;
  const live = [];
  for (const m of matches) if (await admin.auth().getUser(m.id).catch(() => null)) live.push(m);
  if (live.length !== 1) throw new Error(`"${who}" matches ${live.length} accounts that can sign in — use uid:…`);
  return live[0];
}
const doc = await resolve(username);
const userRef = doc.ref;
const uid = userRef.id;
const user = doc.data();
console.log(`${user.fullName ?? user.displayName ?? '(no name)'} @${user.username} — tier now: ${user.tier ?? 'free'}`);

const rc = (path, init = {}) => fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}${path}`, {
  ...init,
  headers: { Authorization: `Bearer ${RC_KEY}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
}).then(async (r) => {
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`RevenueCat ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
});

const before = (await rc('')).subscriber;
const existing = before?.entitlements?.[PRO_ENTITLEMENT_ID];
if (existing) console.log(`Already has Pro until ${existing.expires_date ?? 'forever'} (${existing.product_identifier}).`);

const endMs = Date.now() + days * 24 * 60 * 60 * 1000;
const until = lifetime ? 'forever' : new Date(endMs).toDateString();
if (dryRun) {
  console.log(`Dry run: would gift Pro until ${until}.`);
  process.exit(0);
}

await rc(`/entitlements/${PRO_ENTITLEMENT_ID}/promotional`, {
  method: 'POST',
  body: JSON.stringify(lifetime ? { duration: 'lifetime' } : { end_time_ms: endMs }),
});
const readAtMs = Date.now();
const after = (await rc('')).subscriber;
const tier = tierFromSubscriber(after, readAtMs);
await userRef.update({
  tier,
  tierEventTimestampMs: readAtMs,
  tierEventId: `gift:${readAtMs}`,
  tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
console.log(`Gifted Pro until ${until} — tier is now ${tier}.`);
