/** A cover that fails to load asks the server for a fresh photo once per session (services/coverRefresh). Pure. */
export function claimCoverRefresh(asked: Set<string>, kind: 'trip' | 'destination', id: string): boolean {
  if (!id) return false;
  const key = `${kind}:${id}`;
  if (asked.has(key)) return false;
  asked.add(key);
  return true;
}
