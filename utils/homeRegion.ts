/** The phone's home region from its locale (spec 2026-11-12): 'en-US' → 'US'; no region → null. */
export function homeRegion(locale: string | null | undefined): string | null {
  const part = (locale ?? '').split(/[-_]/)[1];
  return part && /^[A-Za-z]{2}$/.test(part) ? part.toUpperCase() : null;
}
