/** Home's Inbox button (spec 2026-10-29): one count for unread messages and notifications, "9+" above 9. */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

export function inboxTab(unreadMessages: number): 'messages' | 'activity' {
  return unreadMessages > 0 ? 'messages' : 'activity';
}

/** Home's "Get Pro" pill (owner, 2026-10-30): free accounts only; hidden while the tier isn't known. */
export function showGetPro(tier: string | null | undefined): boolean {
  return tier === 'free';
}
