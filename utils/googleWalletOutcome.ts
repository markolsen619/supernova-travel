/** What a react-native-wallet-manager addPassToGoogleWallet rejection means for the person (Android). */
export function googleWalletOutcome(code: string | undefined): 'cancelled' | 'error' {
  return code === 'RESULT_CANCELED' || code === 'ADD_PASS_IN_PROGRESS' ? 'cancelled' : 'error';
}

/**
 * Whether to show "Add to Google Wallet". While the issuer is in demo mode (until Google grants publishing access)
 * only console testers can save, so everyone else would get an error: the button stays hidden for them until
 * appConfig/wallet.googleWalletLive is true. testerUids lists who may try it before that.
 */
export function showGoogleWalletButton(a: { platform: string; canAdd: boolean; live?: boolean; testerUids?: string[]; uid?: string | null }): boolean {
  if (a.platform !== 'android' || !a.canAdd) return false;
  if (a.live === true) return true;
  return !!a.uid && Array.isArray(a.testerUids) && a.testerUids.includes(a.uid);
}
