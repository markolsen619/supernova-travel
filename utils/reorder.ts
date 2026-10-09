/** Move one item a place up (-1) or down (1); a no-op at the ends. Used by the stop reorder screen's arrows. */
export function moveItem<T>(items: T[], i: number, by: -1 | 1): T[] {
  const j = i + by;
  if (i < 0 || i >= items.length || j < 0 || j >= items.length) return items;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}
