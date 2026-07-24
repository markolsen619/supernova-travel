import type { Timestamp } from 'firebase/firestore';
import type { DmThread } from '@/types';

/** `${uidA}_${uidB}` sorted alphabetically — mirrors the Cloud Function's
 * own sortedPairId() (functions/src/dmThreads.ts) so a direct thread's ID
 * is deterministic from either side. */
export function sortedPairId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}_${uidB}` : `${uidB}_${uidA}`;
}

/** "Sarah, Alex, Jordan" — comma-joined, truncated with a "+N more" tail
 * beyond `maxNames` so a large group's header/inbox row doesn't overflow. */
export function formatGroupName(names: string[], maxNames = 3): string {
  if (names.length <= maxNames) return names.join(', ');
  const shown = names.slice(0, maxNames).join(', ');
  return `${shown} +${names.length - maxNames} more`;
}

/** A thread counts as unread for `myUid` if its last message came from
 * someone else and arrived after my own read cursor (or I've never read it
 * at all). Used both for the per-row dot in the Messages tab (cursor =
 * dmThreads/{id}/reads/{myUid}.lastReadAt) and the coarse heart-icon badge
 * (cursor = users/{myUid}.lastMessagesSeenAt) — same logic, different
 * granularity of read cursor. */
export function isThreadUnread(
  thread: Pick<DmThread, 'lastMessageAt' | 'lastMessageSenderUid'>,
  myUid: string,
  lastReadAtMillis: number | null,
): boolean {
  if (!thread.lastMessageAt || thread.lastMessageSenderUid === myUid) return false;
  const lastMessageMillis = (thread.lastMessageAt as Timestamp).toMillis();
  return lastReadAtMillis === null || lastMessageMillis > lastReadAtMillis;
}
