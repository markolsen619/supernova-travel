/**
 * Signs a boarding pass into a .pkpass file (spec 2026-10-22). No firebase-admin here, so the local check
 * (scripts/check-apple-pass.mjs) can sign with the real certificate without a server.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PKPass } from 'passkit-generator';
import { passJson, type PassInput } from './applePass';

const IMAGE_NAMES = ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png'];
let cached: Record<string, Buffer> | null = null;

export function passImages(dir = path.join(__dirname, '..', 'assets', 'pass')): Record<string, Buffer> {
  if (!cached) cached = Object.fromEntries(IMAGE_NAMES.map((n) => [n, fs.readFileSync(path.join(dir, n))]));
  return cached;
}

export function buildSignedPass(
  pass: PassInput,
  certs: { signerKey: string; signerCert: string; wwdr: string },
  imgs: Record<string, Buffer> = passImages(),
): Buffer {
  const pk = new PKPass({ ...imgs, 'pass.json': Buffer.from(JSON.stringify(passJson(pass))) }, certs);
  return pk.getAsBuffer();
}
