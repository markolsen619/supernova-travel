#!/usr/bin/env node
// scripts/make-onboarding-placeholders.mjs
//
// WHY THIS EXISTS
// ----------------
// Onboarding slides 1, 2 and 4 used to render LIVE Firestore content — a
// trip cover photo and a grid of real user avatars. This project currently
// has zero public trips and three users, so those slides fell back to a
// bare 40px star icon. The fix is bundled placeholder art that never
// depends on live data.
//
// Metro resolves `require('@/assets/...')` at BUNDLE TIME. A missing file
// is a BUILD ERROR, not a runtime null — you cannot try/catch it or check
// for it at runtime. So the files referenced by onboarding.tsx must always
// exist on disk, which means committing generated placeholders now, at the
// exact paths real travel photography will occupy later. When the owner
// supplies real photos, they drop them in at these same paths/filenames —
// no code change required, since the image is just bytes on disk.
//
// ImageMagick is not installed on this machine and `sips` cannot create
// images from scratch, only transform existing ones. So this script builds
// valid PNG files by hand using only Node's built-in `zlib` module (no npm
// dependencies): it deflates raw scanlines and assembles the IHDR/IDAT/IEND
// chunks itself, computing each chunk's CRC32 with a hand-rolled table.
//
// Run: node scripts/make-onboarding-placeholders.mjs
// Idempotent — re-running overwrites the same files with the same content.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'assets', 'onboarding');

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit truecolor RGB, no palette, no alpha, no
// interlacing). Just enough of the PNG spec to emit a valid, correctly
// checksummed file that any decoder (including `sips`) will read.
// ---------------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Standard CRC-32 (ISO 3309 / ITU-T V.42) table, used by every PNG chunk's
// trailing CRC field. Polynomial 0xEDB88320, reflected, as required by the
// PNG spec (section 5).
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBuf, data, crc]);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {(x: number, y: number) => [number, number, number]} pixelFn
 *   Returns [r, g, b] (0-255) for a given pixel.
 */
function encodePng(width, height, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  // Raw scanlines: each row prefixed with a filter-type byte (0 = None),
  // followed by width * 3 bytes of RGB.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filter type: None
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      const off = rowStart + 1 + x * 3;
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
    }
  }

  const idatData = deflateSync(raw, { level: 9 });

  return Buffer.concat([
    PNG_SIGNATURE,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', idatData),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Color helpers
// ---------------------------------------------------------------------------

// Brand tokens — mirrors constants/colors.ts `gradient.purplePink`.
const BRAND = {
  purple: hexToRgb('#7F77DD'),
  purpleLight: hexToRgb('#A6A0E8'),
  pink: hexToRgb('#D4537E'),
  pinkLight: hexToRgb('#E28FA9'),
};

function hexToRgb(hex) {
  const v = hex.replace('#', '');
  return [
    parseInt(v.slice(0, 2), 16),
    parseInt(v.slice(2, 4), 16),
    parseInt(v.slice(4, 6), 16),
  ];
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

function clamp01(t) {
  return Math.max(0, Math.min(1, t));
}

/**
 * Linear gradient between colorA and colorB along a given angle, evaluated
 * at pixel (x, y) within a width x height canvas.
 */
function diagonalGradientColor(x, y, width, height, angleDeg, colorA, colorB) {
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const corners = [
    [0, 0],
    [width, 0],
    [0, height],
    [width, height],
  ];
  const projections = corners.map(([cx, cy]) => cx * dx + cy * dy);
  const minP = Math.min(...projections);
  const maxP = Math.max(...projections);
  const p = x * dx + y * dy;
  const t = clamp01((p - minP) / (maxP - minP));
  return lerpColor(colorA, colorB, t);
}

/**
 * Subtle radial lightening centered at (fx, fy) (normalized 0-1), used to
 * differentiate the second hero image from the first without changing its
 * base gradient angle.
 */
function applyRadialFalloff(color, x, y, width, height, fx, fy, radius, strength) {
  const nx = x / width - fx;
  const ny = y / height - fy;
  // Correct for aspect ratio so the falloff reads as roughly circular.
  const aspect = width / height;
  const dist = Math.sqrt(nx * nx * aspect * aspect + ny * ny);
  const falloff = clamp01(1 - dist / radius);
  const eased = falloff * falloff * strength; // ease-in — soft center, fast edge decay
  return lerpColor(color, [255, 255, 255], eased);
}

// ---------------------------------------------------------------------------
// Image generators
// ---------------------------------------------------------------------------

const HERO_WIDTH = 1284;
const HERO_HEIGHT = 1600;
const AVATAR_SIZE = 192;

function makeExploreHero() {
  // Top-left purple -> bottom-right pink, no radial falloff — the "base"
  // treatment.
  return encodePng(HERO_WIDTH, HERO_HEIGHT, (x, y) =>
    diagonalGradientColor(x, y, HERO_WIDTH, HERO_HEIGHT, 135, BRAND.purple, BRAND.pink).map(Math.round)
  );
}

function makeAiPlanHero() {
  // Different angle (bottom-left purple -> top-right pink) plus a soft
  // radial highlight in the upper third, so this hero reads as distinct
  // from the explore hero rather than an identical re-skin.
  return encodePng(HERO_WIDTH, HERO_HEIGHT, (x, y) => {
    const base = diagonalGradientColor(x, y, HERO_WIDTH, HERO_HEIGHT, 60, BRAND.purple, BRAND.pink);
    const lit = applyRadialFalloff(base, x, y, HERO_WIDTH, HERO_HEIGHT, 0.7, 0.28, 0.6, 0.35);
    return lit.map(Math.round);
  });
}

// Four flat-ish avatar discs in brand-adjacent shades, each a gentle
// gradient at a different angle/color pair so the grid doesn't look like
// four copies of the same tile. No faces, no initials — just color.
const AVATAR_SPECS = [
  { name: 'community-1.png', angle: 20, colorA: BRAND.purple, colorB: BRAND.purpleLight },
  { name: 'community-2.png', angle: 200, colorA: BRAND.pink, colorB: BRAND.pinkLight },
  { name: 'community-3.png', angle: 110, colorA: BRAND.purple, colorB: BRAND.pink },
  { name: 'community-4.png', angle: 290, colorA: BRAND.pinkLight, colorB: BRAND.purpleLight },
];

function makeAvatar(spec) {
  return encodePng(AVATAR_SIZE, AVATAR_SIZE, (x, y) =>
    diagonalGradientColor(x, y, AVATAR_SIZE, AVATAR_SIZE, spec.angle, spec.colorA, spec.colorB).map(
      Math.round
    )
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const outputs = [
    { name: 'explore.png', buffer: makeExploreHero() },
    { name: 'ai-plan.png', buffer: makeAiPlanHero() },
    ...AVATAR_SPECS.map((spec) => ({ name: spec.name, buffer: makeAvatar(spec) })),
  ];

  for (const { name, buffer } of outputs) {
    const filePath = path.join(OUTPUT_DIR, name);
    writeFileSync(filePath, buffer);
    console.log(`wrote ${path.relative(process.cwd(), filePath)} (${buffer.length} bytes)`);
  }

  console.log(`\nDone — ${outputs.length} placeholder images written to ${path.relative(process.cwd(), OUTPUT_DIR)}/`);
}

main();
