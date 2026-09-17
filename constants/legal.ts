/**
 * Legal documents linked from the paywall, the welcome screen, and Settings.
 *
 * App Store guideline 3.1.2 requires working links to both wherever an
 * auto-renewing subscription is sold. The same two URLs also go into App Store
 * Connect (Privacy Policy URL, and the EULA field left as Apple's standard) and
 * into the RevenueCat hosted paywall's settings — keep all three in step.
 */

/** Apple's Standard Licensed Application End User License Agreement. */
export const TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

/** Served by Firebase Hosting from hosting/privacy.html (see firebase.json). */
export const PRIVACY_POLICY_URL = 'https://supernova-a2125.web.app/privacy';
