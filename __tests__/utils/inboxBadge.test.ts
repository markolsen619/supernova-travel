import { badgeLabel, inboxTab } from '@/utils/inboxBadge';

it('badgeLabel', () => {
  expect([badgeLabel(0), badgeLabel(3), badgeLabel(9), badgeLabel(10), badgeLabel(42)]).toEqual([null, '3', '9', '9+', '9+']);
});
it('inboxTab: Messages when a conversation is unread', () => {
  expect(inboxTab(2)).toBe('messages');
  expect(inboxTab(0)).toBe('activity');
});

import { showGetPro } from '@/utils/inboxBadge';
it('Get Pro shows for free accounts only (owner 2026-10-30)', () => {
  expect(showGetPro('free')).toBe(true);
  expect(showGetPro('pro')).toBe(false);
  expect(showGetPro('business')).toBe(false);
  expect(showGetPro(null)).toBe(false); // not known yet: don't flash it at a Pro user
});
