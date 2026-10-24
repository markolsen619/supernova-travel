/** What a react-native-wallet-manager addPassToGoogleWallet rejection means for the person (Android). */
export function googleWalletOutcome(code: string | undefined): 'cancelled' | 'error' {
  return code === 'RESULT_CANCELED' || code === 'ADD_PASS_IN_PROGRESS' ? 'cancelled' : 'error';
}
