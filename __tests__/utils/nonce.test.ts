import { createRawNonce } from '@/utils/nonce';

describe('createRawNonce', () => {
  it('returns a 32-character string by default', () => {
    expect(createRawNonce()).toHaveLength(32);
  });

  it('respects a custom length', () => {
    expect(createRawNonce(16)).toHaveLength(16);
  });

  it('contains only charset characters', () => {
    expect(createRawNonce(256)).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('returns an empty string for length 0', () => {
    expect(createRawNonce(0)).toBe('');
  });

  it('maps an injected deterministic byte source to the exact expected string', () => {
    // 0 -> 'A', 1 -> 'B', 61 -> '9' (last charset char), 62 -> 'A' (wraps),
    // 63 -> 'B', 124 -> 'A' (62*2), 125 -> 'B' (62*2+1), 255 -> 'H' (255 % 62 = 7)
    const bytes = new Uint8Array([0, 1, 61, 62, 63, 124, 125, 255]);
    const nonce = createRawNonce(bytes.length, () => bytes);
    expect(nonce).toBe('AB9ABABH');
  });

  it('produces different output across two real calls (relies on the actual CSPRNG)', () => {
    expect(createRawNonce()).not.toBe(createRawNonce());
  });
});
