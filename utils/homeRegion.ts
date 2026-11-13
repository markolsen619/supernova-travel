/**
 * The phone's home region from its locale (spec 2026-11-12): 'en-US' → 'US', 'zh-Hans-CN' → 'CN' (a 4-letter script
 * subtag is skipped; final review I3). No two-letter region (e.g. 'en', 'es-419') → null.
 */
export function homeRegion(locale: string | null | undefined): string | null {
  const parts = (locale ?? '').split(/[-_]/).slice(1);
  for (const p of parts) {
    if (/^[A-Za-z]{4}$/.test(p)) continue;
    return /^[A-Za-z]{2}$/.test(p) ? p.toUpperCase() : null;
  }
  return null;
}
