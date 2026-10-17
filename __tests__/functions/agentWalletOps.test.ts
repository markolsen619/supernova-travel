import { validateWalletOps } from '../../functions/src/agentWalletOps';

const labels = { days: {}, stops: {}, dayStops: {}, cityCount: 1, packing: {},
  bookings: { b1: { kind: 'reservation', id: 'R1', linked: false }, b2: { kind: 'boarding_pass', id: 'P1', linked: true } } } as never;
const trip = { startDay: '2026-11-01', endDay: '2026-11-03' };
const v = (op: object) => validateWalletOps([op], labels, trip).ops[0];

describe('validateWalletOps', () => {
  it('adds a reservation on a trip day', () => {
    expect(v({ op: 'addReservation', type: 'restaurant', title: 'Pennant', date: '2026-11-01', time: '19:00', confirmationCode: 'ABC123' }))
      .toEqual({ kind: 'wallet.addReservation', type: 'restaurant', title: 'Pennant', date: '2026-11-01', time: '19:00', endDate: null, confirmationCode: 'ABC123' });
  });
  it('refuses a date outside the trip', () => {
    expect(v({ op: 'addReservation', type: 'restaurant', title: 'Pennant', date: '2027-01-01' })).toBeUndefined();
  });
  it('transit needs a mode', () => {
    expect(v({ op: 'addReservation', type: 'transit', transitMode: 'train', title: 'Coaster', date: '2026-11-02' })).toMatchObject({ transitMode: 'train' });
  });
  it('links only an unlinked booking, unlinks only a linked one', () => {
    expect(v({ op: 'linkBooking', booking: 'b1' })).toEqual({ kind: 'wallet.linkBooking', bookingKind: 'reservation', bookingId: 'R1' });
    expect(v({ op: 'linkBooking', booking: 'b2' })).toBeUndefined();
    expect(v({ op: 'unlinkBooking', booking: 'b2' })).toEqual({ kind: 'wallet.unlinkBooking', bookingKind: 'boarding_pass', bookingId: 'P1' });
  });
  it('a booking label that is not the caller\'s (unknown) is dropped', () => {
    expect(v({ op: 'updateBooking', booking: 'b9', time: '20:00' })).toBeUndefined();
  });
  it('updates a booking time', () => {
    expect(v({ op: 'updateBooking', booking: 'b1', time: '20:00' })).toEqual({ kind: 'wallet.updateBooking', bookingKind: 'reservation', bookingId: 'R1', time: '20:00' });
  });
  it('never edits a boarding pass (link/unlink only)', () => {
    expect(v({ op: 'updateBooking', booking: 'b2', time: '20:00' })).toBeUndefined();
  });
});
