/**
 * Where stops go on a day (docs/superpowers/specs/2026-10-16-nova-phase2-design.md §3). Pure.
 * Nova chooses what to add; this decides where, so a day never zig-zags across town.
 */
import { haversineMeters } from '@/utils/tripRoutes';

export type PlaceStop = { id: string; lat: number | null; lng: number | null; type: string; title: string; startTime: string | null; fixed?: boolean };

const placed = (p: PlaceStop): p is PlaceStop & { lat: number; lng: number } => p.lat != null && p.lng != null;
const km = (a: PlaceStop, b: PlaceStop) => (placed(a) && placed(b) ? haversineMeters(a, b) / 1000 : 0);
const LUNCH = /\blunch\b/i;
const DINNER = /\b(dinner|supper|drinks|nightcap|bar)\b/i;
const mealRank = (p: PlaceStop) => (DINNER.test(p.title) ? 2 : LUNCH.test(p.title) ? 1 : 0);
const isHotel = (p: PlaceStop) => p.type === 'hotel';
const mins = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);

export function routeKm(stops: PlaceStop[]): number {
  const p = stops.filter(placed);
  let total = 0;
  for (let i = 1; i < p.length; i++) total += km(p[i - 1], p[i]);
  return total;
}

/** Nearest placed neighbours of a gap, so an unplaced stop in between doesn't hide the real detour. */
function neighbours(stops: PlaceStop[], index: number): [PlaceStop | null, PlaceStop | null] {
  let before: PlaceStop | null = null;
  for (let i = index - 1; i >= 0; i--) if (placed(stops[i])) { before = stops[i]; break; }
  let after: PlaceStop | null = null;
  for (let i = index; i < stops.length; i++) if (placed(stops[i])) { after = stops[i]; break; }
  return [before, after];
}

export function insertionCostKm(stops: PlaceStop[], add: PlaceStop, index: number): number {
  if (!placed(add)) return 0;
  const [a, b] = neighbours(stops, index);
  if (a && b) return km(a, add) + km(add, b) - km(a, b);
  if (a) return km(a, add);
  if (b) return km(add, b);
  return 0;
}

/** Indices (0..n) where `add` may go: after an opening hotel, before a closing one, meals in order, times in order. */
function allowed(stops: PlaceStop[], add: PlaceStop): number[] {
  const n = stops.length;
  let lo = 0;
  let hi = n;
  if (n && isHotel(stops[0]) && !isHotel(add)) lo = 1;
  if (n > 1 && isHotel(stops[n - 1]) && !isHotel(add)) hi = n - 1;
  const t = mins(add.startTime);
  const rank = mealRank(add);
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) {
    const before = stops.slice(0, i);
    const after = stops.slice(i);
    if (t != null && before.some((x) => mins(x.startTime) != null && mins(x.startTime)! > t)) continue;
    if (t != null && after.some((x) => mins(x.startTime) != null && mins(x.startTime)! < t)) continue;
    if (rank === 2 && after.some((x) => !isHotel(x) && mealRank(x) < 2)) continue; // dinner after sights and lunch
    if (rank === 1 && before.some((x) => mealRank(x) === 2)) continue; // lunch before dinner
    if (rank === 0 && before.some((x) => mealRank(x) === 2) && after.length && !after.every(isHotel)) continue;
    out.push(i);
  }
  return out.length ? out : [hi];
}

export function bestInsertion(stops: PlaceStop[], add: PlaceStop): number {
  const options = allowed(stops, add);
  if (!placed(add)) return options[options.length - 1];
  // From the end, so a tie (equal detour, e.g. one located stop) keeps the later slot (review 2026-10-17).
  let best = options[options.length - 1];
  let bestCost = Infinity;
  for (let k = options.length - 1; k >= 0; k--) {
    const c = insertionCostKm(stops, add, options[k]);
    if (c < bestCost - 1e-9) { bestCost = c; best = options[k]; }
  }
  return best;
}

/** A stop that keeps its slot: hotels at the ends, timed stops, booked stops, unplaced stops. */
function pinned(stops: PlaceStop[], i: number): boolean {
  const p = stops[i];
  if (p.fixed || p.startTime || !placed(p)) return true;
  return isHotel(p) && (i === 0 || i === stops.length - 1);
}

function orderCost(order: PlaceStop[]): number {
  let penalty = 0;
  let seenDinner = false;
  for (const p of order) {
    const r = mealRank(p);
    if (r === 2) seenDinner = true;
    else if (seenDinner && !isHotel(p)) penalty += 1000;
  }
  return routeKm(order) + penalty;
}

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest]));
}

export function optimizeDay(stops: PlaceStop[]): PlaceStop[] {
  const slots = stops.map((_, i) => !pinned(stops, i));
  const movable = stops.filter((_, i) => slots[i]);
  if (movable.length < 2) return [...stops];
  const fill = (order: PlaceStop[]) => {
    let k = 0;
    return stops.map((p, i) => (slots[i] ? order[k++] : p));
  };
  if (movable.length <= 8) {
    let best = [...stops];
    let bestCost = orderCost(best);
    for (const perm of permutations(movable)) {
      const cand = fill(perm);
      const c = orderCost(cand);
      if (c < bestCost - 1e-9) { best = cand; bestCost = c; }
    }
    return best;
  }
  // Nearest neighbour from the first movable stop, then 2-opt on the movable sequence.
  const rest = [...movable];
  const seq = [rest.shift()!];
  while (rest.length) {
    const last = seq[seq.length - 1];
    let j = 0;
    rest.forEach((p, i) => { if (km(last, p) < km(last, rest[j])) j = i; });
    seq.push(rest.splice(j, 1)[0]);
  }
  let improved = true;
  let current = fill(seq);
  while (improved) {
    improved = false;
    for (let i = 0; i < seq.length - 1; i++) {
      for (let k = i + 1; k < seq.length; k++) {
        const cand = [...seq.slice(0, i), ...seq.slice(i, k + 1).reverse(), ...seq.slice(k + 1)];
        const filled = fill(cand);
        if (orderCost(filled) < orderCost(current) - 1e-9) { seq.splice(0, seq.length, ...cand); current = filled; improved = true; }
      }
    }
  }
  return orderCost(current) <= orderCost(stops) ? current : [...stops];
}
