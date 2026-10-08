export const IMPORT_DOMAIN = 'supernovatravel.xyz';
export type EmailImportStatus = 'imported' | 'not_booking' | 'unreadable' | 'needs_pro' | 'needs_consent' | 'daily_limit' | 'gmail_confirmation';
export interface EmailImportEntry {
  id: string; receivedAt: Date | null; subject: string; status: EmailImportStatus;
  items: { kind: 'boarding_pass' | 'reservation'; id: string; title: string }[]; tripTitle?: string;
}

const LINES: Record<Exclude<EmailImportStatus, 'imported'>, string> = {
  not_booking: 'Not a booking',
  unreadable: "Couldn't read this — try pasting it into Import instead",
  needs_pro: 'Needs Pro',
  needs_consent: 'Allow AI import to use this',
  daily_limit: 'Daily limit reached',
  gmail_confirmation: 'Gmail confirmation',
};

export function statusLine(e: EmailImportEntry): string {
  if (e.status !== 'imported') return LINES[e.status];
  const what = e.items.length === 1 ? `Added ${e.items[0].title}` : `Added ${e.items.length} bookings`;
  return e.tripTitle ? `${what} · ${e.tripTitle}` : what;
}

export function gmailCodeFresh(at: Date | null, now: Date): boolean {
  return !!at && now.getTime() - at.getTime() < 24 * 60 * 60 * 1000;
}

export const GMAIL_FILTER = 'subject:(confirmation OR itinerary OR booking OR reservation OR e-ticket OR "boarding pass")';

export function addressFor(token: string | null | undefined): string | null {
  return token ? `${token}@${IMPORT_DOMAIN}` : null;
}

/** When an email arrived, for the import log. */
export function receivedLabel(at: Date | null, now: Date): string {
  if (!at) return '';
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Gmail's forwarding confirm link, only if it is Google's own (the server checks too). */
export function safeGmailLink(link: unknown): string | null {
  if (typeof link !== 'string') return null;
  try {
    const u = new URL(link);
    const ok = u.protocol === 'https:'
      && (u.hostname === 'mail.google.com' || u.hostname === 'mail-settings.google.com')
      && u.pathname.startsWith('/mail/vf-');
    return ok ? link : null;
  } catch {
    return null;
  }
}
