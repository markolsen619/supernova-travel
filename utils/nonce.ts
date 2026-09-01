import * as Crypto from 'expo-crypto';

const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generates a random string for use as an OAuth/OIDC nonce (e.g. Sign in with
 * Apple, which binds the raw value to the identity token it returns).
 *
 * `randomBytes` is injectable so this can be unit tested: jest-expo's
 * auto-mock stubs every expo-crypto export to a no-op, so a version of this
 * function that called `Crypto.getRandomBytes` directly could never be
 * exercised in a test. Production callers get the real CSPRNG by default;
 * `Math.random()` must never be used here — in V8 it's xorshift128+, whose
 * internal state is recoverable from a handful of outputs, and this nonce is
 * a security primitive binding a specific request to a specific token.
 *
 * Each byte is mapped onto the 62-character charset with `byte % 62`. Since
 * 256 % 62 !== 0, this introduces a slight bias toward the first 8 charset
 * characters (they get one extra representable byte value each out of 256).
 * For a single-use, short-lived anti-replay nonce that bias is not
 * exploitable, but it is real — noted here rather than glossed over.
 */
export function createRawNonce(
  length = 32,
  randomBytes: (byteCount: number) => Uint8Array = Crypto.getRandomBytes,
): string {
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARSET[bytes[i] % CHARSET.length];
  }
  return result;
}
