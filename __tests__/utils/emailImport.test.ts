import { statusLine, gmailCodeFresh, addressFor, GMAIL_FILTER, type EmailImportEntry } from '@/utils/emailImport';

const e = (over: Partial<EmailImportEntry>): EmailImportEntry =>
  ({ id: 'e', receivedAt: null, subject: 'S', status: 'imported', items: [], ...over });

describe('statusLine', () => {
  it('says what happened to each email', () => {
    expect(statusLine(e({ items: [{ kind: 'reservation', id: 'r', title: 'Hotel Artemide' }], tripTitle: 'Rome in Spring' })))
      .toBe('Added Hotel Artemide · Rome in Spring');
    expect(statusLine(e({ items: [{ kind: 'reservation', id: 'a', title: 'A' }, { kind: 'boarding_pass', id: 'b', title: 'B' }] })))
      .toBe('Added 2 bookings');
    expect(statusLine(e({ status: 'not_booking' }))).toBe('Not a booking');
    expect(statusLine(e({ status: 'unreadable' }))).toBe("Couldn't read this — try pasting it into Import instead");
    expect(statusLine(e({ status: 'needs_pro' }))).toBe('Needs Pro');
    expect(statusLine(e({ status: 'needs_consent' }))).toBe('Allow AI import to use this');
    expect(statusLine(e({ status: 'daily_limit' }))).toBe('Daily limit reached');
    expect(statusLine(e({ status: 'gmail_confirmation' }))).toBe('Gmail confirmation');
  });
});

describe('gmailCodeFresh / addressFor / GMAIL_FILTER', () => {
  it('shows the Gmail code for a day', () => {
    const now = new Date('2026-10-05T12:00:00Z');
    expect(gmailCodeFresh(new Date('2026-10-05T00:00:00Z'), now)).toBe(true);
    expect(gmailCodeFresh(new Date('2026-10-04T11:00:00Z'), now)).toBe(false);
    expect(gmailCodeFresh(null, now)).toBe(false);
  });
  it('builds the address and the filter', () => {
    expect(addressFor('k7x2m9qpz4')).toBe('k7x2m9qpz4@supernovatravel.xyz');
    expect(addressFor(undefined)).toBeNull();
    expect(GMAIL_FILTER).toBe('subject:(confirmation OR itinerary OR booking OR reservation OR e-ticket OR "boarding pass")');
  });
});

describe('receivedLabel', () => {
  const { receivedLabel } = require('@/utils/emailImport');
  const now = new Date('2026-10-05T12:00:00');
  it('reads like a log', () => {
    expect(receivedLabel(new Date('2026-10-05T11:59:30'), now)).toBe('Just now');
    expect(receivedLabel(new Date('2026-10-05T11:15:00'), now)).toBe('45 min ago');
    expect(receivedLabel(new Date('2026-10-05T09:00:00'), now)).toBe('3 h ago');
    expect(receivedLabel(new Date('2026-10-03T09:00:00'), now)).toBe('Oct 3');
    expect(receivedLabel(null, now)).toBe('');
  });
});
