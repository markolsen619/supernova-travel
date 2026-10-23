// __tests__/functions/walletLink.test.ts
import { signWalletToken, verifyWalletToken, walletTokenFromPath, WALLET_LINK_TTL_MS } from '../../functions/src/walletLink';

const S = 'test-secret-0123456789';
const now = 1_760_000_000_000;

describe('wallet links', () => {
  it('round-trips the pass and owner', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    expect(verifyWalletToken(t, S, now + 1000)).toEqual({ passId: 'p1', uid: 'u1' });
  });
  it('expires after five minutes', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    expect(verifyWalletToken(t, S, now + WALLET_LINK_TTL_MS + 1)).toBeNull();
  });
  it('rejects a changed payload, a changed signature, another secret and junk', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    const [payload, sig] = t.split('.');
    const forged = Buffer.from(`p2.u1.${now + WALLET_LINK_TTL_MS}`).toString('base64url');
    expect(verifyWalletToken(`${forged}.${sig}`, S, now)).toBeNull();
    expect(verifyWalletToken(`${payload}.${sig.slice(0, -2)}xx`, S, now)).toBeNull();
    expect(verifyWalletToken(t, 'other-secret', now)).toBeNull();
    expect(verifyWalletToken('nonsense', S, now)).toBeNull();
    expect(verifyWalletToken('', S, now)).toBeNull();
  });
  it('reads the token from the pass URL path', () => {
    const t = signWalletToken({ passId: 'p1', uid: 'u1' }, S, now);
    expect(walletTokenFromPath(`/wallet/apple/${t}.pkpass`)).toBe(t);
    expect(walletTokenFromPath(`/wallet/apple/${t}`)).toBe(t);
    expect(walletTokenFromPath('/wallet/apple/../x.pkpass')).toBeNull();
    expect(walletTokenFromPath('/cal/abc.ics')).toBeNull();
  });
});
