/**
 * Reporting and blocking, as pure decisions. App Store guideline 1.2 requires
 * both for user-generated content; utils/contentFilter.ts is the third layer.
 *
 * Three things hide content from a viewer:
 * - they blocked its author            (users/{me}/blocked/{authorUid})
 * - they reported it                   (users/{me}/hidden/{contentKey})
 * - enough people reported it that the server hid it for everyone
 *   (moderationHidden: true on the post, comment, or trip —
 *   functions/src/onReportCreated.ts)
 */

export type ReportTargetType = 'post' | 'comment' | 'message' | 'trip' | 'user';

export const REPORT_REASONS = [
  { id: 'spam', label: 'Spam or scam' },
  { id: 'harassment', label: 'Harassment or bullying' },
  { id: 'hate', label: 'Hate speech or symbols' },
  { id: 'sexual', label: 'Nudity or sexual content' },
  { id: 'violence', label: 'Violence or threats' },
  { id: 'impersonation', label: 'Pretending to be someone else' },
  { id: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['id'];

export const REPORT_DETAILS_MAX_LENGTH = 500;

export interface ReportTarget {
  type: ReportTargetType;
  id: string;
  /** Whoever wrote or owns it. For a user report, the user themself. */
  ownerUid: string;
  /** The post a comment is on, or the thread a message is in. */
  parentId?: string | null;
}

/**
 * Stable identity for a piece of content, safe as a Firestore document id
 * (no slashes). The parent is included because comment and message ids are
 * only unique within their post or thread.
 */
export function contentKey(target: Pick<ReportTarget, 'type' | 'id' | 'parentId'>): string {
  return [target.type, target.parentId ?? '', target.id].join('__');
}

/**
 * One report per person per target: the id is deterministic, and the rules
 * allow create but not update, so reporting twice can't stack toward the
 * auto-hide threshold.
 */
export function reportDocId(reporterUid: string, target: ReportTarget): string {
  return `${reporterUid}__${contentKey(target)}`;
}

/** You can't report or block yourself. */
export function canModerate(viewerUid: string | null | undefined, ownerUid: string | null | undefined): boolean {
  return !!viewerUid && !!ownerUid && viewerUid !== ownerUid;
}

export interface ReportPayload {
  reporterUid: string;
  targetType: ReportTargetType;
  targetId: string;
  targetParentId: string | null;
  targetOwnerUid: string;
  targetKey: string;
  reason: ReportReason;
  details: string | null;
  status: 'open';
}

/** The reports/{id} document, minus createdAt (the service adds a server timestamp). */
export function buildReport(
  reporterUid: string,
  target: ReportTarget,
  reason: ReportReason,
  details?: string | null,
): ReportPayload {
  const trimmed = details?.trim().slice(0, REPORT_DETAILS_MAX_LENGTH) ?? '';
  return {
    reporterUid,
    targetType: target.type,
    targetId: target.id,
    targetParentId: target.parentId ?? null,
    targetOwnerUid: target.ownerUid,
    targetKey: contentKey(target),
    reason,
    details: trimmed || null,
    status: 'open',
  };
}

export interface ModerationContext {
  blockedUids: ReadonlySet<string>;
  hiddenKeys: ReadonlySet<string>;
}

export interface VisibilitySubject {
  authorUid: string | null | undefined;
  /** contentKey() for the item; omit for things that can't be reported individually. */
  key?: string;
  moderationHidden?: boolean | null;
}

export function isContentVisible(ctx: ModerationContext, subject: VisibilitySubject): boolean {
  if (subject.moderationHidden) return false;
  if (subject.authorUid && ctx.blockedUids.has(subject.authorUid)) return false;
  if (subject.key && ctx.hiddenKeys.has(subject.key)) return false;
  return true;
}

export function filterVisible<T>(
  items: readonly T[],
  ctx: ModerationContext,
  describe: (item: T) => VisibilitySubject,
): T[] {
  return items.filter((item) => isContentVisible(ctx, describe(item)));
}

/**
 * Notification fields naming the person who caused it. Mirrors
 * NOTIFICATION_ACTOR_FIELDS in functions/src/accountDeletion.ts.
 */
const NOTIFICATION_ACTOR_FIELDS = ['likerUid', 'commenterUid', 'inviterUid'] as const;

export function notificationActorUid(notification: Record<string, unknown>): string | null {
  for (const field of NOTIFICATION_ACTOR_FIELDS) {
    const value = notification[field];
    if (typeof value === 'string' && value) return value;
  }
  return null;
}

/**
 * A direct thread with someone you blocked disappears from your inbox. A group
 * thread stays, since other people are in it; their messages are filtered
 * individually instead.
 */
export function isThreadVisible(
  thread: { type?: string; participants?: readonly string[] },
  myUid: string,
  ctx: ModerationContext,
): boolean {
  if (thread.type !== 'direct') return true;
  const other = (thread.participants ?? []).find((uid) => uid !== myUid);
  return !other || !ctx.blockedUids.has(other);
}
