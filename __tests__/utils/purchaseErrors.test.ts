import {
  isUserCancellation,
  purchaseErrorMessage,
  restoreErrorMessage,
  PURCHASE_ERROR_CODES,
} from '@/utils/purchaseErrors';

describe('isUserCancellation', () => {
  it('detects a cancellation by error code', () => {
    expect(isUserCancellation({ code: PURCHASE_ERROR_CODES.PURCHASE_CANCELLED })).toBe(true);
  });

  it('accepts a numeric code, since the native bridge may not stringify it', () => {
    expect(isUserCancellation({ code: 1 })).toBe(true);
  });

  it('still honours the deprecated userCancelled flag', () => {
    expect(isUserCancellation({ userCancelled: true })).toBe(true);
  });

  it('is false for a genuine failure', () => {
    expect(isUserCancellation({ code: PURCHASE_ERROR_CODES.STORE_PROBLEM })).toBe(false);
  });

  it('is false for non-error values', () => {
    expect(isUserCancellation(null)).toBe(false);
    expect(isUserCancellation(undefined)).toBe(false);
    expect(isUserCancellation('boom')).toBe(false);
  });
});

describe('purchaseErrorMessage', () => {
  it('returns null for a cancellation so no error banner is shown', () => {
    expect(purchaseErrorMessage({ code: PURCHASE_ERROR_CODES.PURCHASE_CANCELLED })).toBeNull();
  });

  it('gives offline copy for both network codes', () => {
    const offline = "You're offline. Reconnect and try again.";
    expect(purchaseErrorMessage({ code: PURCHASE_ERROR_CODES.NETWORK })).toBe(offline);
    expect(purchaseErrorMessage({ code: PURCHASE_ERROR_CODES.OFFLINE_CONNECTION })).toBe(offline);
  });

  it('points an already-owning user at restore', () => {
    expect(purchaseErrorMessage({ code: PURCHASE_ERROR_CODES.PRODUCT_ALREADY_PURCHASED })).toMatch(
      /restore purchases/,
    );
  });

  it('explains a pending payment without calling it a failure', () => {
    expect(purchaseErrorMessage({ code: PURCHASE_ERROR_CODES.PAYMENT_PENDING })).toMatch(/pending/);
  });

  it('falls back to generic copy for an unrecognised code', () => {
    expect(purchaseErrorMessage({ code: '9999' })).toBe("That didn't go through. Try again.");
  });

  it('never leaks a raw SDK message', () => {
    const msg = purchaseErrorMessage({ code: '2', message: 'RCPurchasesErrorDomain code 2' });
    expect(msg).not.toMatch(/RCPurchases/);
  });

  it('follows the copy voice: no "please", no exclamation marks', () => {
    const all = Object.values(PURCHASE_ERROR_CODES).map((code) => purchaseErrorMessage({ code }));
    all.filter(Boolean).forEach((m) => {
      expect(m).not.toMatch(/please/i);
      expect(m).not.toMatch(/!/);
    });
  });
});

describe('restoreErrorMessage', () => {
  it('returns null for a cancellation', () => {
    expect(restoreErrorMessage({ code: PURCHASE_ERROR_CODES.PURCHASE_CANCELLED })).toBeNull();
  });

  it('uses restore-specific copy for a generic failure', () => {
    expect(restoreErrorMessage({ code: PURCHASE_ERROR_CODES.STORE_PROBLEM })).toMatch(/restore/i);
  });

  it('still reports offline as offline', () => {
    expect(restoreErrorMessage({ code: PURCHASE_ERROR_CODES.NETWORK })).toMatch(/offline/i);
  });
});
