/**
 * Supernova's Home Screen widget (spec docs/superpowers/specs/2026-11-12-packing-holidays-widget-design.md):
 * WidgetKit, reading precomputed entries the app writes to the shared App Group (modules/widget-bridge).
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = (config) => ({
  type: 'widget',
  name: 'SupernovaWidget',
  displayName: 'Supernova',
  bundleIdentifier: '.widget',
  deploymentTarget: '17.0',
  frameworks: ['SwiftUI', 'WidgetKit'],
  entitlements: {
    'com.apple.security.application-groups': config.ios.entitlements['com.apple.security.application-groups'],
  },
});
