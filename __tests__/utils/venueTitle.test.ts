import { venueTitle, isVenueTypes } from '@/utils/venueTitle';

describe('venueTitle', () => {
  it('names the hotel on a generic check-in and check-out', () => {
    expect(venueTitle({ type: 'hotel', title: 'Hotel Check-in: Mission Beach' }, 'Hyatt Regency Mission Bay'))
      .toBe('Check into Hyatt Regency Mission Bay');
    expect(venueTitle({ type: 'hotel', title: 'Hotel Check-out' }, 'Hyatt Regency Mission Bay'))
      .toBe('Check out of Hyatt Regency Mission Bay');
    expect(venueTitle({ type: 'hotel', title: 'Beachfront stay' }, 'The Dana'))
      .toBe('Stay at The Dana');
  });

  it('keeps the meal and names the restaurant', () => {
    expect(venueTitle({ type: 'restaurant', title: 'Dinner: Seafood by the Bay' }, 'The Fish Market'))
      .toBe('Dinner at The Fish Market');
    expect(venueTitle({ type: 'restaurant', title: 'Lunch: Casual Beachfront Eatery' }, 'Draft'))
      .toBe('Lunch at Draft');
    expect(venueTitle({ type: 'restaurant', title: 'Brunch in Mission Beach' }, 'Kono’s Cafe'))
      .toBe('Brunch at Kono’s Cafe');
    expect(venueTitle({ type: 'restaurant', title: 'Local bites' }, 'Oscar’s')).toBe('Eat at Oscar’s');
  });

  it('treats a drinks stop as a bar whatever its type', () => {
    expect(venueTitle({ type: 'activity', title: 'Evening Drinks at a Mission Beach Dive Bar' }, 'The Pennant'))
      .toBe('Drinks at The Pennant');
  });

  it('leaves a title alone when it already names the place', () => {
    expect(venueTitle({ type: 'restaurant', title: 'Dinner at STK for steaks' }, 'STK San Diego')).toBeNull();
    expect(venueTitle({ type: 'hotel', title: 'Check into Hyatt Regency Mission Bay' }, 'Hyatt Regency Mission Bay')).toBeNull();
  });

  it('leaves sights, transport and blank names alone', () => {
    expect(venueTitle({ type: 'activity', title: 'Explore Balboa Park' }, 'Balboa Park')).toBeNull();
    expect(venueTitle({ type: 'transport', title: 'Ferry to Coronado' }, 'Coronado Ferry Landing')).toBeNull();
    expect(venueTitle({ type: 'restaurant', title: 'Dinner' }, '  ')).toBeNull();
  });
});

describe('isVenueTypes', () => {
  it('accepts a business and rejects a neighborhood or city', () => {
    expect(isVenueTypes(['lodging', 'point_of_interest', 'establishment'])).toBe(true);
    expect(isVenueTypes(['neighborhood', 'political'])).toBe(false);
    expect(isVenueTypes(['locality', 'political'])).toBe(false);
    expect(isVenueTypes(undefined)).toBe(false);
  });
});
