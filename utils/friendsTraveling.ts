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

export const STACK_MAX_ZOOM = 4;
const STACK_PX = 60;
/** `spanDeg`: the members' widest spread in degrees (longitude scaled by latitude), for flying in until they separate. */
export type FriendStack<T> = { key: string; lat: number; lng: number; faces: T[]; extra: number; spanDeg: number };

/**
 * Where a stack tap flies (final review): the zoom at which the members sit ~200 px apart — on screen, and well past
 * the 60 px that stacks them — never past 6, and always a little closer than now. Same spot → 6 (spread there).
 */
export function stackFlyZoom(spanDeg: number, currentZoom: number): number {
  const fit = spanDeg > 0 ? Math.log2((200 * 360) / (512 * spanDeg)) : Infinity;
  return Math.min(6, Math.max(currentZoom + 0.5, fit));
}

/**
 * Friends at world view (spec 2026-11-11): friends within ~60 px merge into one stack (≤ 3 faces + "+N"), so avatars
 * never pile up over Europe; from zoom 4 each friend shows, spread around shared cities (spreadCluster).
 */
export function friendStacks<T extends { uid: string; lat: number; lng: number }>(entries: T[], zoom: number): { stacks: FriendStack<T>[]; singles: T[] } {
  if (zoom >= STACK_MAX_ZOOM) return { stacks: [], singles: spreadCluster(entries, zoom) };
  const degPerPx = 360 / (512 * 2 ** zoom);
  const near = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) =>
    Math.hypot((a.lng - b.lng) * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180), a.lat - b.lat) / degPerPx <= STACK_PX;
  const groups: { lat: number; lng: number; members: T[] }[] = [];
  for (const e of [...entries].sort((x, y) => x.uid.localeCompare(y.uid))) {
    const g = groups.find((x) => near(x, e));
    if (g) {
      g.members.push(e);
      g.lat = g.members.reduce((s, m) => s + m.lat, 0) / g.members.length;
      g.lng = g.members.reduce((s, m) => s + m.lng, 0) / g.members.length;
    } else groups.push({ lat: e.lat, lng: e.lng, members: [e] });
  }
  const stacks: FriendStack<T>[] = [];
  const singles: T[] = [];
  for (const g of groups) {
    if (g.members.length === 1) {
      singles.push(g.members[0]);
      continue;
    }
    const lats = g.members.map((m) => m.lat);
    const lngs = g.members.map((m) => m.lng);
    const spanDeg = Math.max(
      (Math.max(...lngs) - Math.min(...lngs)) * Math.cos((g.lat * Math.PI) / 180),
      Math.max(...lats) - Math.min(...lats),
    );
    stacks.push({ key: g.members.map((m) => m.uid).join('|'), lat: g.lat, lng: g.lng, faces: g.members.slice(0, 3), extra: Math.max(0, g.members.length - 3), spanDeg });
  }
  return { stacks, singles };
}
