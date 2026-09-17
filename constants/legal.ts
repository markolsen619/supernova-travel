/**
 * Legal documents linked from the paywall, the welcome screen, and Settings.
 *
 * App Store guideline 3.1.2 requires working links to both wherever an
 * auto-renewing subscription is sold. The same two URLs also go into App Store
 * Connect (Privacy Policy URL; the EULA field stays Apple's standard) and
 * into the RevenueCat hosted paywall's settings — keep all three in step.
 */

/**
 * Supernova's own terms, served from hosting/terms.html. Apple's standard EULA
 * doesn't cover user-generated content, and guideline 1.2 needs terms that say
 * objectionable content and abusive users aren't tolerated. The page
 * incorporates Apple's standard EULA for App Store downloads, so App Store
 * Connect's EULA field can stay on Apple's default.
 */
export const TERMS_OF_USE_URL = 'https://supernova-a2125.web.app/terms';

/** Served by Firebase Hosting from hosting/privacy.html (see firebase.json). */
export const PRIVACY_POLICY_URL = 'https://supernova-a2125.web.app/privacy';
