import { reservationFromOp, bookingPatch } from '@/utils/agentWallet';

const base = { kind: 'wallet.addReservation', title: 'Pennant', date: '2026-11-01', time: '19:00', endDate: null, confirmationCode: 'ABC123' } as const;
const ctx = { uid: 'U', tripId: 'T', paid: true, nowIso: '2026-10-16T00:00:00.000Z' };

describe('reservationFromOp', () => {
  it('Pro: a restaurant linked to the trip', () => {
    expect(reservationFromOp({ ...base, type: 'restaurant' } as never, ctx)).toEqual({
      ownerUid: 'U', type: 'restaurant', title: 'Pennant', confirmationCode: 'ABC123', checkIn: '2026-11-01', time: '19:00',
      createdAt: '2026-10-16T00:00:00.000Z', tripId: 'T', tripLink: 'manual', tripSuggestions: [], tripLinkDismissed: false,
    });
  });
  it('free user: added to the wallet unlinked', () => {
    const r = reservationFromOp({ ...base, type: 'restaurant' } as never, { ...ctx, paid: false });
    expect(r).not.toHaveProperty('tripId');
    expect(r).not.toHaveProperty('tripLink');
  });
  it('transit is stored as activity + transitMode (never a new enum)', () => {
    const r = reservationFromOp({ ...base, type: 'transit', transitMode: 'train' } as never, ctx);
    expect(r.type).toBe('activity');
    expect(r.transitMode).toBe('train');
    expect(r.departureLocalTime).toBe('19:00');
  });
  it('a hotel keeps its check-out; no code becomes empty', () => {
    const r = reservationFromOp({ ...base, type: 'hotel', endDate: '2026-11-03', confirmationCode: null, time: null } as never, ctx);
    expect(r.checkOut).toBe('2026-11-03');
    expect(r.confirmationCode).toBe('');
    expect(r).not.toHaveProperty('time');
  });
});

describe('bookingPatch', () => {
  it('maps a reservation update', () => {
    expect(bookingPatch({ kind: 'wallet.updateBooking', bookingKind: 'reservation', bookingId: 'R1', date: '2026-11-02', time: '20:00' } as never))
      .toEqual({ checkIn: '2026-11-02', time: '20:00' });
  });
});
