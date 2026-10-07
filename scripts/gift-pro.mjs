#!/usr/bin/env node
/**
 * Gift Supernova Pro to someone by username — no card, no renewal.
 *
 *   node scripts/gift-pro.mjs kellbell424              # 365 days
 *   node scripts/gift-pro.mjs kellbell424 --days 30
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
const daysArg = args.indexOf('--days');
const days = daysArg >= 0 ? Number(args[daysArg + 1]) : 365;
if (!username || !Number.isInteger(days) || days < 1 || days > 3650) {
  console.error('Usage: node scripts/gift-pro.mjs <username> [--days N] [--dry-run]');
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

const found = await db.collection('users').where('username', '==', username.toLowerCase()).limit(1).get();
if (found.empty) throw new Error(`No user with username "${username}"`);
const userRef = found.docs[0].ref;
const uid = userRef.id;
const user = found.docs[0].data();
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
if (dryRun) {
  console.log(`Dry run: would gift Pro until ${new Date(endMs).toDateString()}.`);
  process.exit(0);
}

await rc(`/entitlements/${PRO_ENTITLEMENT_ID}/promotional`, { method: 'POST', body: JSON.stringify({ end_time_ms: endMs }) });
const readAtMs = Date.now();
const after = (await rc('')).subscriber;
const tier = tierFromSubscriber(after, readAtMs);
await userRef.update({
  tier,
  tierEventTimestampMs: readAtMs,
  tierEventId: `gift:${readAtMs}`,
  tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
});
console.log(`Gifted Pro until ${new Date(endMs).toDateString()} — tier is now ${tier}.`);
