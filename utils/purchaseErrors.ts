/**
 * RevenueCat error code -> user-facing copy.
 *
 * Codes are compared as string literals rather than importing
 * PURCHASES_ERROR_CODE, so this module stays pure and runnable under the
 * project's node-only Jest setup (the SDK package is not in
 * transformIgnorePatterns). The values are RevenueCat's stable wire codes;
 * the names below mirror the enum member they correspond to.
 */
export const PURCHASE_ERROR_CODES = {
  PURCHASE_CANCELLED: '1',
  STORE_PROBLEM: '2',
  PURCHASE_NOT_ALLOWED: '3',
  PURCHASE_INVALID: '4',
  PRODUCT_NOT_AVAILABLE_FOR_PURCHASE: '5',
  PRODUCT_ALREADY_PURCHASED: '6',
  RECEIPT_ALREADY_IN_USE: '7',
  NETWORK: '10',
  OPERATION_ALREADY_IN_PROGRESS: '15',
  INELIGIBLE: '18',
  PAYMENT_PENDING: '20',
  CONFIGURATION: '23',
  OFFLINE_CONNECTION: '35',
} as const;

function codeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code: unknown }).code);
  }
  return null;
}

/**
 * True when the user backed out of the store sheet. Not a failure — the UI
 * must show nothing at all, not an error banner.
 *
 * Checks the `code` rather than the deprecated `userCancelled` boolean, but
 * still falls back to it so a cancellation is never mistaken for a failure.
 */
export function isUserCancellation(error: unknown): boolean {
  if (codeOf(error) === PURCHASE_ERROR_CODES.PURCHASE_CANCELLED) return true;
  return Boolean(
    error &&
      typeof error === 'object' &&
      'userCancelled' in error &&
      (error as { userCancelled?: boolean }).userCancelled,
  );
}

/**
 * Copy for a failed purchase or restore. Returns null when there is nothing
 * to say (user cancelled), so callers can render conditionally.
 *
 * Voice per the design system: say what happened and what to do, sentence
 * case, no "please", no exclamation marks, never a raw SDK string.
 */
export function purchaseErrorMessage(error: unknown): string | null {
  if (isUserCancellation(error)) return null;

  switch (codeOf(error)) {
    case PURCHASE_ERROR_CODES.NETWORK:
    case PURCHASE_ERROR_CODES.OFFLINE_CONNECTION:
      return "You're offline. Reconnect and try again.";
    case PURCHASE_ERROR_CODES.STORE_PROBLEM:
      return "The store didn't respond. Try again in a moment.";
    case PURCHASE_ERROR_CODES.PURCHASE_NOT_ALLOWED:
      return "This device isn't allowed to make purchases. Check your restrictions in Settings.";
    case PURCHASE_ERROR_CODES.PRODUCT_ALREADY_PURCHASED:
    case PURCHASE_ERROR_CODES.RECEIPT_ALREADY_IN_USE:
      return 'You already own this. Tap restore purchases to unlock it here.';
    case PURCHASE_ERROR_CODES.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE:
      return "That plan isn't available in your region right now.";
    case PURCHASE_ERROR_CODES.PAYMENT_PENDING:
      return 'Your payment is pending approval. Pro unlocks as soon as it clears.';
    case PURCHASE_ERROR_CODES.OPERATION_ALREADY_IN_PROGRESS:
      return "There's already a purchase in progress.";
    case PURCHASE_ERROR_CODES.INELIGIBLE:
      return "Your account isn't eligible for this offer.";
    case PURCHASE_ERROR_CODES.CONFIGURATION:
      return 'Purchases are misconfigured for this build. Check the RevenueCat keys and products.';
    case PURCHASE_ERROR_CODES.PURCHASE_INVALID:
      return 'The store rejected that payment method. Try a different one.';
    default:
      return "That didn't go through. Try again.";
  }
}

/** Copy for a failed restore — same codes, restore-specific wording. */
export function restoreErrorMessage(error: unknown): string | null {
  if (isUserCancellation(error)) return null;
  const code = codeOf(error);
  if (code === PURCHASE_ERROR_CODES.NETWORK || code === PURCHASE_ERROR_CODES.OFFLINE_CONNECTION) {
    return "You're offline. Reconnect and try again.";
  }
  return "We couldn't restore your purchases. Try again, or contact support if you were charged.";
}
