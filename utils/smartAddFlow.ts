/**
 * Change day and Undo after a smart add, as steps with their failure rules (final review 2026-11-10: failures were
 * swallowed, leaving the same place on two days, or the wish list saying "On this trip" for a stop that was gone).
 * Pure over the three writes, so the rules are testable.
 */
export type SmartFlowDeps = {
  deleteStop: () => Promise<void>;
  writeStop: () => Promise<string>;
  clearAdded: () => Promise<void>;
};

/** Undo: delete the stop, then clear the mark. A failed delete keeps the mark — the stop is still on the trip. */
export async function undoSmartAdd(deps: Pick<SmartFlowDeps, 'deleteStop' | 'clearAdded'>): Promise<'undone' | 'failed'> {
  try { await deps.deleteStop(); } catch { return 'failed'; }
  await deps.clearAdded().catch(() => {});
  return 'undone';
}

/**
 * Change day: delete, then write on the new day. A failed delete writes nothing (no second copy); a failed write after
 * the delete clears the mark, so the place is back in the wish list rather than claiming a stop that isn't there.
 */
export async function moveSmartAdd(deps: SmartFlowDeps): Promise<{ status: 'moved'; activityId: string } | { status: 'failed' } | { status: 'lost' }> {
  try { await deps.deleteStop(); } catch { return { status: 'failed' }; }
  try {
    return { status: 'moved', activityId: await deps.writeStop() };
  } catch {
    await deps.clearAdded().catch(() => {});
    return { status: 'lost' };
  }
}
