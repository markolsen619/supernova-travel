import { statusLine, gmailCodeFresh, addressFor, GMAIL_FILTER, type EmailImportEntry, LOYALTY_FILTER, loyaltySourceLine } from '@/utils/emailImport';

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

describe('safeGmailLink', () => {
  const { safeGmailLink } = require('@/utils/emailImport');
  it('only Google https confirmation links become a button', () => {
    expect(safeGmailLink('https://mail.google.com/mail/vf-%5Babc%5D-def')).toBe('https://mail.google.com/mail/vf-%5Babc%5D-def');
    expect(safeGmailLink('https://mail-settings.google.com/mail/vf-x')).toBe('https://mail-settings.google.com/mail/vf-x');
    expect(safeGmailLink('https://evil.example/mail/vf-x')).toBeNull();
    expect(safeGmailLink('http://mail.google.com/mail/vf-x')).toBeNull();
    expect(safeGmailLink(undefined)).toBeNull();
  });
});

describe('statusLine for rewards statements', () => {
  const base = { id: 'e', receivedAt: null, subject: 's', status: 'imported' as const };
  it('says a balance was updated', () => {
    expect(statusLine({ ...base, items: [{ kind: 'loyalty', id: 'l1', title: 'Delta SkyMiles: 45,210 miles' }] }))
      .toBe('Updated Delta SkyMiles: 45,210 miles');
  });
  it('says nothing changed when the statement was older than the saved balance', () => {
    expect(statusLine({ ...base, items: [] })).toBe('Already up to date');
  });
  it('counts bookings and balances apart', () => {
    expect(statusLine({ ...base, items: [
      { kind: 'reservation', id: 'r', title: 'Hotel' }, { kind: 'loyalty', id: 'l', title: 'Bonvoy: 1 points' },
    ] })).toBe('Added 1 booking · 1 balance updated');
  });
});

describe('LOYALTY_FILTER', () => {
  it('is a Gmail search for statements', () => {
    expect(LOYALTY_FILTER).toMatch(/^subject:\(/);
    expect(LOYALTY_FILTER).toContain('statement');
  });
});

describe('loyaltySourceLine', () => {
  it('says when an email last updated the balance', () => {
    expect(loyaltySourceLine({ source: 'email', balanceAsOf: '2026-10-08' })).toBe('Updated from email · Oct 8');
    expect(loyaltySourceLine({ source: undefined, balanceAsOf: undefined })).toBeNull();
  });
});
