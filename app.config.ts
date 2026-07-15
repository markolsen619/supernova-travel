import type { ConfigContext, ExpoConfig } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: config.name ?? 'Supernova',
  slug: config.slug ?? 'supernova-travel',
  plugins: [
    ...(config.plugins ?? []).filter(
      (p) => (Array.isArray(p) ? p[0] : p) !== '@rnmapbox/maps',
    ),
    [
      '@rnmapbox/maps',
      { RNMAPBOX_MAPS_DOWNLOAD_TOKEN: process.env.MAPBOX_SECRET_DOWNLOAD_TOKEN ?? '' },
    ],
  ],
});
