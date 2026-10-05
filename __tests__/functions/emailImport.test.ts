import {
  signatureValid, sign, newToken, tokenFromAddress, looksLikeBooking, gmailConfirmation, importGate,
  dailyKey, bookingsFromParse, emailPushCopy, trimImportLog,
} from '../../functions/src/emailImport';

describe('signatureValid', () => {
  const body = Buffer.from('{"to":"a@supernovatravel.xyz"}');
  it('accepts the Worker signature and rejects anything else', () => {
    expect(signatureValid(body, sign(body, 's3cret'), 's3cret')).toBe(true);
    expect(signatureValid(Buffer.from('{"to":"b"}'), sign(body, 's3cret'), 's3cret')).toBe(false);
    expect(signatureValid(body, sign(body, 'other'), 's3cret')).toBe(false);
    expect(signatureValid(body, undefined, 's3cret')).toBe(false);
    expect(signatureValid(body, 'zz', 's3cret')).toBe(false);
    expect(signatureValid(body, sign(body, ''), '')).toBe(false); // no secret configured: refuse
  });
});

describe('tokens and addresses', () => {
  it('makes 10-character a-z0-9 tokens', () => {
    const t = newToken();
    expect(t).toMatch(/^[a-z0-9]{10}$/);
    expect(newToken()).not.toBe(t);
  });
  it('reads the token from our domain only, ignoring case and +tags', () => {
    expect(tokenFromAddress('K7X2M9QPZ4@SupernovaTravel.xyz')).toBe('k7x2m9qpz4');
    expect(tokenFromAddress('k7x2m9qpz4+gmail@supernovatravel.xyz')).toBe('k7x2m9qpz4');
    expect(tokenFromAddress('Name <k7x2m9qpz4@supernovatravel.xyz>')).toBe('k7x2m9qpz4');
    expect(tokenFromAddress('k7x2m9qpz4@evil.xyz')).toBeNull();
    expect(tokenFromAddress('short@supernovatravel.xyz')).toBeNull();
    expect(tokenFromAddress('')).toBeNull();
  });
});

describe('looksLikeBooking', () => {
  it('lets confirmations through and keeps plainly unrelated mail out', () => {
    expect(looksLikeBooking('Your booking confirmation – Hotel Artemide', '', false)).toBe(true);
    expect(looksLikeBooking('Fwd: trip', 'Record locator: XK7P2Q', false)).toBe(true);
    expect(looksLikeBooking('Hello', 'see attached', true)).toBe(true);
    expect(looksLikeBooking('Weekly newsletter', 'Our favourite recipes', false)).toBe(false);
  });
});

describe('gmailConfirmation', () => {
  const body = `mark@example.com has requested to automatically forward mail to your email
address k7x2m9qpz4@supernovatravel.xyz.
Confirmation code: 123456789
To allow mark@example.com to automatically forward mail to your address, please click the link below`;
  it('pulls the code from Gmail\'s forwarding confirmation', () => {
    expect(gmailConfirmation('Gmail Team <forwarding-noreply@google.com>', '(#123456789) Gmail Forwarding Confirmation - Receive Mail from mark@example.com', body))
      .toBe('123456789');
  });
  it('ignores anything not from Google', () => {
    expect(gmailConfirmation('x@phish.com', 'Gmail Forwarding Confirmation', body)).toBeNull();
    expect(gmailConfirmation('forwarding-noreply@google.com', 'Something else', body)).toBeNull();
  });
});

describe('importGate', () => {
  const ok = { paid: true, consent: true, usedToday: 0, looksLikeBooking: true };
  it('checks Pro, then consent, then the daily cap, then the keyword filter', () => {
    expect(importGate(ok)).toBe('parse');
    expect(importGate({ ...ok, paid: false, consent: false })).toBe('needs_pro');
    expect(importGate({ ...ok, consent: false, usedToday: 99 })).toBe('needs_consent');
    expect(importGate({ ...ok, usedToday: 25, looksLikeBooking: false })).toBe('daily_limit');
    expect(importGate({ ...ok, looksLikeBooking: false })).toBe('not_booking');
  });
  it('the daily key is the UTC day', () => {
    expect(dailyKey(new Date('2026-10-04T23:30:00-07:00'))).toBe('email_imports_2026-10-05');
  });
});

describe('bookingsFromParse', () => {
  const ctx = { uid: 'u1', emailImportId: 'e1', nowIso: '2026-10-04T00:00:00.000Z' };
  it('maps each booking to its wallet document, with place fields', () => {
    const docs = bookingsFromParse({ bookings: [
      { kind: 'boarding_pass', fields: { airline: 'American', flightNumber: 'aa104', origin: 'jfk', destination: 'fco',
        destinationCity: 'Rome', destinationCountryCode: 'it', departureTime: '2026-07-25T12:10:00Z', departureLocalDate: '2026-07-25', seat: '14A' } },
      { kind: 'reservation', reservationType: 'hotel', fields: { title: 'Hotel Artemide', confirmationCode: '88213',
        checkIn: '2026-07-25', checkOut: '2026-07-28', city: 'Roma', countryCode: 'IT' } },
    ] }, ctx);
    expect(docs).toHaveLength(2);
    expect(docs[0]).toEqual({ collection: 'boarding_passes', title: 'AA104', data: expect.objectContaining({
      ownerUid: 'u1', source: 'email', emailImportId: 'e1', airline: 'American', flightNumber: 'AA104', origin: 'JFK',
      destination: 'FCO', status: 'upcoming', createdAt: ctx.nowIso, placeCity: 'Rome', placeCountryCode: 'IT',
      localDate: '2026-07-25', seat: '14A' }) });
    expect(docs[1]).toEqual({ collection: 'reservations', title: 'Hotel Artemide', data: expect.objectContaining({
      ownerUid: 'u1', source: 'email', type: 'hotel', title: 'Hotel Artemide', confirmationCode: '88213',
      checkIn: '2026-07-25', checkOut: '2026-07-28', placeCity: 'Roma', placeCountryCode: 'IT' }) });
  });
  it('drops entries missing what makes them a booking, and caps at 6', () => {
    expect(bookingsFromParse({ bookings: [{ kind: 'boarding_pass', fields: { airline: 'X' } }] }, ctx)).toEqual([]);
    expect(bookingsFromParse({ bookings: [{ kind: 'reservation', reservationType: 'activity', fields: {} }] }, ctx)).toEqual([]);
    expect(bookingsFromParse({ bookings: 'nope' }, ctx)).toEqual([]);
    expect(bookingsFromParse(null, ctx)).toEqual([]);
    const many = Array.from({ length: 9 }, (_, i) => ({ kind: 'reservation', reservationType: 'restaurant', fields: { title: `R${i}` } }));
    expect(bookingsFromParse({ bookings: many }, ctx)).toHaveLength(6);
  });
  it('an unknown reservation type becomes an activity; a date that is not a date is dropped', () => {
    const [d] = bookingsFromParse({ bookings: [{ kind: 'reservation', reservationType: 'spa', fields: { title: 'Spa', checkIn: 'soon' } }] }, ctx);
    expect(d.data.type).toBe('activity');
    expect(d.data.checkIn).toBeUndefined();
  });
});

describe('emailPushCopy', () => {
  it('reads naturally for each outcome', () => {
    expect(emailPushCopy([{ title: 'AA104' }], 'Rome in Spring', false))
      .toEqual({ title: 'Added to your wallet', body: 'AA104 · Rome in Spring' });
    expect(emailPushCopy([{ title: 'Hotel Artemide' }], null, true))
      .toEqual({ title: 'Is this for a trip?', body: 'Hotel Artemide — tap to choose' });
    expect(emailPushCopy([{ title: 'Hotel Artemide' }], null, false))
      .toEqual({ title: 'Added to your wallet', body: 'Hotel Artemide' });
    expect(emailPushCopy([{ title: 'A' }, { title: 'B' }], 'Rome in Spring', false))
      .toEqual({ title: 'Added 2 bookings to your wallet', body: 'Rome in Spring' });
  });
});

describe('trimImportLog', () => {
  it('keeps the newest entries', () => {
    const rows = Array.from({ length: 53 }, (_, i) => ({ id: `r${i}`, receivedAt: i }));
    expect(trimImportLog(rows).sort()).toEqual(['r0', 'r1', 'r2']);
    expect(trimImportLog(rows.slice(0, 10))).toEqual([]);
  });
});
