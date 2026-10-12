/** Friends on a trip, client rules (docs/superpowers/specs/2026-10-12-friends-on-trips-design.md). */
export function isCurrentEntry(e: { day?: string | null }, now: Date): boolean {
  return !!e.day && e.day === now.toISOString().slice(0, 10);
}

const SPREAD_PX = 26;
/** Several friends in one city sit on a small ring around it (sorted by uid, so stable); one stays put. */
export function spreadCluster<T extends { uid: string; lat: number; lng: number }>(entries: T[], zoom: number): T[] {
  const groups = new Map<string, T[]>();
  for (const e of [...entries].sort((x, y) => x.uid.localeCompare(y.uid))) {
    const k = `${e.lat.toFixed(3)},${e.lng.toFixed(3)}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }
  const out: T[] = [];
  for (const g of groups.values()) {
    if (g.length === 1) { out.push(g[0]); continue; }
    // Degrees per pixel at this zoom (Web Mercator, 512 px tiles).
    const degPerPx = 360 / (512 * 2 ** zoom);
    const r = SPREAD_PX * degPerPx;
    g.forEach((e, i) => {
      const a = (2 * Math.PI * i) / g.length;
      out.push({ ...e, lat: e.lat + r * Math.sin(a), lng: e.lng + (r * Math.cos(a)) / Math.cos((e.lat * Math.PI) / 180) });
    });
  }
  return out;
}
