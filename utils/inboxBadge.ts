/** Home's Inbox button (spec 2026-10-29): one count for unread messages and notifications, "9+" above 9. */
export function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

export function inboxTab(unreadMessages: number): 'messages' | 'activity' {
  return unreadMessages > 0 ? 'messages' : 'activity';
}
