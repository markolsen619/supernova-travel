// scripts/check-apple-pass.mjs
// Usage: (cd functions && npm run build) && node scripts/check-apple-pass.mjs [outDir]
// Signs a SAMPLE boarding pass with the real PassKit certificate in ~/.config/supernova and checks the result:
// pass.json + manifest + signature present, and the signature verifies over the manifest. Prints no key material.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { buildSignedPass } = require('../functions/lib/applePassSign.js');

const dir = path.join(os.homedir(), '.config/supernova');
const certs = {
  signerKey: fs.readFileSync(path.join(dir, 'passkit.key'), 'utf8'),
  signerCert: fs.readFileSync(path.join(dir, 'passkit-cert.pem'), 'utf8'),
  wwdr: fs.readFileSync(path.join(dir, 'wwdr-g4.pem'), 'utf8'),
};
const out = process.argv[2] ?? fs.mkdtempSync(path.join(os.tmpdir(), 'pkpass-'));
const file = buildSignedPass({
  id: 'sample', airline: 'Sample Air', flightNumber: 'SA123', origin: 'SFO', originCity: 'San Francisco',
  destination: 'JFK', destinationCity: 'New York', departureTime: '2026-12-01T08:15:00-08:00', seat: '12A', gate: 'B7',
  barcode: 'M1SAMPLE/PASS EABC123 SFOJFKSA 0123', barcodeFormat: 'pdf417',
}, certs);
const pkpass = path.join(out, 'sample.pkpass');
fs.writeFileSync(pkpass, file);
const unz = path.join(out, 'unzipped');
fs.mkdirSync(unz, { recursive: true });
execFileSync('unzip', ['-o', '-q', pkpass, '-d', unz]);
for (const f of ['pass.json', 'manifest.json', 'signature', 'icon.png', 'logo.png']) {
  if (!fs.existsSync(path.join(unz, f))) throw new Error(`missing ${f}`);
}
execFileSync('openssl', ['smime', '-verify', '-binary', '-inform', 'der', '-in', path.join(unz, 'signature'),
  '-content', path.join(unz, 'manifest.json'), '-noverify', '-out', '/dev/null'], { stdio: ['ignore', 'ignore', 'inherit'] });
const pj = JSON.parse(fs.readFileSync(path.join(unz, 'pass.json'), 'utf8'));
console.log(`OK ${(file.length / 1024).toFixed(1)} KB · ${pj.passTypeIdentifier} · ${pj.barcodes?.[0]?.format} · files: ${fs.readdirSync(unz).join(', ')}`);
console.log(`sample written to ${pkpass}`);
