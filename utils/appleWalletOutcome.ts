/**
 * What the Add to Apple Wallet button does after react-native-wallet-manager's addPassFromUrl rejects (review,
 * 2026-10-22): a cancel is not an error, and only a sheet that couldn't run at all falls back to the browser —
 * otherwise a cancel showed the same sheet a second time.
 */
export type WalletAddOutcome = 'quiet' | 'already' | 'error' | 'browser';

export function walletAddOutcome(code: string | undefined): WalletAddOutcome {
  switch (code) {
    case 'USER_CANCELLED': return 'quiet';
    case 'PASS_ALREADY_EXISTS': return 'already';
    case 'NETWORK_ERROR':
    case 'HTTP_ERROR': return 'error';
    default: return 'browser';
  }
}
