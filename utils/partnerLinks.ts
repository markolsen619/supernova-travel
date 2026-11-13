/**
 * Affiliate tagging for Airalo, Trip.com and 12Go (spec 2026-11-12) as build-setting templates, so signing up needs
 * no code: `{url}` = the target URL-encoded (a network's redirect wrapper, e.g. Travelpayouts' tp.media), `{raw}` =
 * the target as is (append parameters). No template → the plain link (works, earns nothing). Pure.
 */
export type LinkTemplates = { airalo: string | null; tripcom: string | null; twelveGo: string | null };

export function linkTemplatesFromEnv(env: Record<string, string | undefined>): LinkTemplates {
  const v = (k: string) => (env[k] && env[k]!.trim() ? env[k]!.trim() : null);
  return { airalo: v('EXPO_PUBLIC_AIRALO_LINK_TEMPLATE'), tripcom: v('EXPO_PUBLIC_TRIPCOM_LINK_TEMPLATE'), twelveGo: v('EXPO_PUBLIC_12GO_LINK_TEMPLATE') };
}

export function applyTemplate(url: string, template: string | null): string {
  if (!template) return url;
  if (template.includes('{url}')) return template.replace('{url}', encodeURIComponent(url));
  if (template.includes('{raw}')) return template.replace('{raw}', url);
  return url;
}
