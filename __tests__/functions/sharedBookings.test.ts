import { mirrorId, sharedTripId, sharedCopy, tripMembers, mirrorPlan } from '../../functions/src/sharedBookings';

const pass = {
  ownerUid: 'mark', airline: 'Lufthansa', flightNumber: 'LH 431', origin: 'ORD', originCity: 'Chicago',
  destination: 'MUC', destinationCity: 'Munich', departureTime: '2026-11-18T21:40:00Z', seat: '32A', gate: 'C18',
  status: 'upcoming', localDate: '2026-11-18', tripId: 'ce', tripLink: 'auto',
  barcode: 'M1OLSEN/MARK EABC123 ORDMUCLH 0431', barcodeFormat: 'pdf417', confirmationCode: 'ABC123',
  tripSuggestions: ['ce'], source: 'email', createdAt: '2026-10-01T00:00:00Z',
};
const hotel = {
  ownerUid: 'mark', type: 'hotel', title: 'Boutique Hotel Falkenturm', confirmationCode: '88412',
  checkIn: '2026-11-28', checkOut: '2026-12-01', address: 'Falkenturmstr. 10, Munich',
  notes: 'Door code 4471', attachmentUrls: ['https://x/y.pdf'], tripId: 'ce', createdAt: '2026-10-01T00:00:00Z',
};

describe('mirrorId', () => {
  it('keeps passes and reservations apart', () => {
    expect(mirrorId('boarding_pass', 'a1')).toBe('boarding_pass_a1');
    expect(mirrorId('reservation', 'a1')).toBe('reservation_a1');
  });
});

describe('sharedTripId', () => {
  it('is the linked trip when sharing is on or unset', () => {
    expect(sharedTripId(pass)).toBe('ce');
    expect(sharedTripId({ ...pass, sharedWithTrip: true })).toBe('ce');
  });
  it('is null when switched off, unlinked, or deleted', () => {
    expect(sharedTripId({ ...pass, sharedWithTrip: false })).toBeNull();
    expect(sharedTripId({ ...pass, tripId: null })).toBeNull();
    expect(sharedTripId(undefined)).toBeNull();
  });
});

describe('sharedCopy', () => {
  it('never carries a boarding pass barcode or booking reference', () => {
    const copy = sharedCopy('boarding_pass', 'p1', pass, 'Mark Olsen');
    expect(copy).not.toHaveProperty('barcode');
    expect(copy).not.toHaveProperty('barcodeFormat');
    expect(copy).not.toHaveProperty('confirmationCode');
    expect(copy).toMatchObject({
      kind: 'boarding_pass', id: 'p1', ownerUid: 'mark', ownerName: 'Mark Olsen', tripId: 'ce',
      flightNumber: 'LH 431', seat: '32A', departureTime: '2026-11-18T21:40:00Z', localDate: '2026-11-18',
    });
  });
  it('shares a reservation with its confirmation code but not notes or attachments', () => {
    const copy = sharedCopy('reservation', 'r1', hotel, 'Mark Olsen');
    expect(copy).toMatchObject({ kind: 'reservation', title: 'Boutique Hotel Falkenturm', confirmationCode: '88412', checkIn: '2026-11-28' });
    expect(copy).not.toHaveProperty('notes');
    expect(copy).not.toHaveProperty('attachmentUrls');
  });
  it('drops wallet bookkeeping fields', () => {
    const copy = sharedCopy('boarding_pass', 'p1', pass, 'Mark');
    for (const k of ['tripLink', 'tripSuggestions', 'source', 'sharedWithTrip']) expect(copy).not.toHaveProperty(k);
  });
  it('keeps transit fields', () => {
    const train = { ownerUid: 'mark', type: 'activity', transitMode: 'train', title: 'ICE 918', confirmationCode: 'Q1',
      checkIn: '2026-11-25', departureLocalTime: '10:19', arrivalLocalTime: '14:29', fromPlace: 'Berlin Hbf', toPlace: 'München Hbf', tripId: 'ce' };
    expect(sharedCopy('reservation', 'r2', train, 'Mark')).toMatchObject({ transitMode: 'train', departureLocalTime: '10:19', toPlace: 'München Hbf' });
  });
  it('omits fields the booking does not have rather than writing undefined', () => {
    const copy = sharedCopy('reservation', 'r1', { ownerUid: 'mark', type: 'hotel', title: 'H', tripId: 'ce' }, 'Mark');
    expect(Object.values(copy).includes(undefined)).toBe(false);
  });
});

describe('tripMembers', () => {
  it('is the author plus collaborators', () => {
    expect([...tripMembers({ authorUid: 'mark', collaborators: ['kell'] })].sort()).toEqual(['kell', 'mark']);
  });
  it('is empty for a missing trip', () => {
    expect(tripMembers(undefined).size).toBe(0);
  });
});

describe('mirrorPlan', () => {
  const members = new Set(['mark', 'kell']);
  it('writes shared bookings of members and deletes everything else', () => {
    const plan = mirrorPlan(
      [
        { id: 'boarding_pass_p1', ownerUid: 'mark', shared: true },
        { id: 'reservation_r1', ownerUid: 'mark', shared: false },
        { id: 'reservation_r2', ownerUid: 'ex', shared: true },
      ],
      ['reservation_r1', 'reservation_r2', 'reservation_gone'],
      members,
    );
    expect(plan.write).toEqual(['boarding_pass_p1']);
    expect(plan.remove.sort()).toEqual(['reservation_gone', 'reservation_r1', 'reservation_r2']);
  });
  it('removes every copy when the trip is gone', () => {
    expect(mirrorPlan([{ id: 'x', ownerUid: 'mark', shared: true }], ['x'], new Set()).remove).toEqual(['x']);
  });
});
