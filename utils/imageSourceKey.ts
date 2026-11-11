/**
 * A stable identity for an image source: its address (or bundled asset id), not the object carrying it. Effects keyed
 * on the object restart whenever a parent re-renders with `{ uri }` inline — the AI generating screen re-renders every
 * second for its timer, and its background faded out and back in each time (owner, 2026-11-11).
 */
export function imageSourceKey(source: unknown): string | null {
  if (source == null) return null;
  if (typeof source === 'number') return String(source);
  if (typeof source === 'object' && 'uri' in source && typeof (source as { uri?: unknown }).uri === 'string') return (source as { uri: string }).uri;
  return JSON.stringify(source);
}
