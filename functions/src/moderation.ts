/**
 * Pure decisions behind report handling (functions/src/moderationEvents.ts).
 * Free of firebase-admin imports so the root jest suite can test it.
 */

/**
 * Distinct reporters before content is hidden for everyone, pending review.
 * Reports are one per person per target (firestore.rules), so this is 3
 * different people, not one person reporting 3 times.
 */
export const AUTO_HIDE_THRESHOLD = 3;

export interface ReportDoc {
  reporterUid?: unknown;
  targetType?: unknown;
  targetId?: unknown;
  targetParentId?: unknown;
  targetOwnerUid?: unknown;
  targetKey?: unknown;
  reason?: unknown;
}

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

/**
 * The document auto-hide flags, or null when the target type isn't
 * auto-hidden. Messages and accounts are reviewed by a person instead: hiding
 * a message only for everyone else in a thread is meaningless, and taking an
 * account down on three reports would hand anyone with two friends a way to
 * silence someone.
 */
export function autoHidePath(report: ReportDoc): string | null {
  if (!nonEmpty(report.targetId)) return null;
  switch (report.targetType) {
    case 'post':
      return `posts/${report.targetId}`;
    case 'trip':
      return `trips/${report.targetId}`;
    case 'comment':
      return nonEmpty(report.targetParentId) ? `posts/${report.targetParentId}/comments/${report.targetId}` : null;
    default:
      return null;
  }
}

export function shouldAutoHide(reportCount: number): boolean {
  return reportCount >= AUTO_HIDE_THRESHOLD;
}

/** MODERATOR_UIDS in functions/.env: comma-separated, whitespace tolerated. */
export function parseModeratorUids(raw: string | undefined): string[] {
  return Array.from(
    new Set(
      (raw ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  );
}

const REASON_LABELS: Record<string, string> = {
  spam: 'Spam or scam',
  harassment: 'Harassment or bullying',
  hate: 'Hate speech or symbols',
  sexual: 'Nudity or sexual content',
  violence: 'Violence or threats',
  impersonation: 'Impersonation',
  other: 'Something else',
};

/** Push copy for moderators. No reporter identity and no content excerpt. */
export function moderatorPush(report: ReportDoc, reportCount: number): { title: string; body: string } {
  const type = typeof report.targetType === 'string' ? report.targetType : 'content';
  const reason = typeof report.reason === 'string' ? REASON_LABELS[report.reason] ?? report.reason : 'Report';
  const hidden = autoHidePath(report) && shouldAutoHide(reportCount) ? ' · auto-hidden' : '';
  return {
    title: `New report: ${type}`,
    body: `${reason} · ${reportCount} ${reportCount === 1 ? 'report' : 'reports'}${hidden}`,
  };
}
