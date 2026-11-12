import { stopsNeedingTickets, reminderDue, ticketsReminderCopy } from '../../functions/src/ticketsReminder';

describe('"Still need tickets" reminder (owner, 2026-11-08)', () => {
  it('counts activity stops with no booking, not visited', () => {
    expect(stopsNeedingTickets([
      { type: 'activity' }, { type: 'activity', bookingRef: 'X' }, { type: 'activity', fromBooking: { id: 'r' } },
      { type: 'restaurant' }, { type: 'activity', visited: true }, { type: 'activity', bookingRef: '' },
    ])).toBe(2);
  });
  it('due exactly 7 calendar days before the trip starts, at least 2 stops, once', () => {
    expect(reminderDue({ startDay: '2026-11-15', count: 3, alreadySent: false }, '2026-11-08')).toBe(true);
    expect(reminderDue({ startDay: '2026-11-16', count: 3, alreadySent: false }, '2026-11-08')).toBe(false);
    expect(reminderDue({ startDay: '2026-11-15', count: 1, alreadySent: false }, '2026-11-08')).toBe(false);
    expect(reminderDue({ startDay: '2026-11-15', count: 3, alreadySent: true }, '2026-11-08')).toBe(false);
    expect(reminderDue({ startDay: null, count: 3, alreadySent: false }, '2026-11-08')).toBe(false);
  });
  it('copy names the city and the count', () => {
    expect(ticketsReminderCopy(['Lisbon'], 3)).toEqual({ title: 'Lisbon in 7 days', body: '3 stops may still need tickets. Book them before they sell out.' });
  });
  it('a multi-city trip names the whole trip, not just its first city (owner, 2026-11-11)', () => {
    expect(ticketsReminderCopy(['Prague', 'Budapest', 'Vienna'], 6)).toEqual({
      title: 'Prague + 2 more cities in 7 days',
      body: '6 stops across your trip may still need tickets. Book them before they sell out.',
    });
    expect(ticketsReminderCopy(['Prague', 'Vienna'], 2).title).toBe('Prague + 1 more city in 7 days');
  });
  it('falls back to "Your trip" without a city', () => {
    expect(ticketsReminderCopy([], 2).title).toBe('Your trip in 7 days');
  });
});

import { reminderToday } from '../../functions/src/ticketsReminder';
it('reminderToday is the UTC date of the run (calendarDay\'s +12 h made it tomorrow at 15:00 → "7 days" sent 8 days early)', () => {
  expect(reminderToday(Date.parse('2026-11-08T15:00:00Z'))).toBe('2026-11-08');
  expect(reminderToday(Date.parse('2026-11-08T23:59:00Z'))).toBe('2026-11-08');
});
it('a stop marked booked in the app no longer needs tickets', () => {
  expect(stopsNeedingTickets([{ type: 'activity', bookedVia: 'GetYourGuide' }, { type: 'activity' }])).toBe(1);
});
