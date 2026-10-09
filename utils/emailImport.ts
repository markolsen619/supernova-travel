export const IMPORT_DOMAIN = 'supernovatravel.xyz';
export type EmailImportStatus = 'imported' | 'not_booking' | 'unreadable' | 'needs_pro' | 'needs_consent' | 'daily_limit' | 'gmail_confirmation';
export interface EmailImportEntry {
  id: string; receivedAt: Date | null; subject: string; status: EmailImportStatus;
  items: { kind: 'boarding_pass' | 'reservation' | 'loyalty'; id: string; title: string }[]; tripTitle?: string;
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
  // An older statement than the balance on file changes nothing.
  if (e.items.length === 0) return 'Already up to date';
  const bookings = e.items.filter((i) => i.kind !== 'loyalty');
  const balances = e.items.length - bookings.length;
  let what: string;
  if (bookings.length === 0) what = balances === 1 ? `Updated ${e.items[0].title}` : `Updated ${balances} balances`;
  else if (balances === 0) what = bookings.length === 1 ? `Added ${bookings[0].title}` : `Added ${bookings.length} bookings`;
  else what = `Added ${bookings.length} booking${bookings.length === 1 ? '' : 's'} · ${balances} balance${balances === 1 ? '' : 's'} updated`;
  return e.tripTitle ? `${what} · ${e.tripTitle}` : what;
}

export function gmailCodeFresh(at: Date | null, now: Date): boolean {
  return !!at && now.getTime() - at.getTime() < 24 * 60 * 60 * 1000;
}

export const GMAIL_FILTER = 'subject:(confirmation OR itinerary OR booking OR reservation OR e-ticket OR "boarding pass")';

/** Gmail's second filter: rewards-program statements (functions/src/loyaltyImport.ts). */
export const LOYALTY_FILTER = 'subject:(statement OR "points balance" OR "miles balance" OR "account summary" OR "your miles" OR "your points")';

/** Under a loyalty program's balance when a forwarded statement set it. */
export function loyaltySourceLine(p: { source?: string; balanceAsOf?: string }): string | null {
  if (p.source !== 'email' || !p.balanceAsOf) return null;
  const [y, m, d] = p.balanceAsOf.split('-').map(Number);
  return `Updated from email · ${new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
}

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
