import { airportInfo } from '../../functions/src/airportInfo';

describe('airportInfo', () => {
  it('location and country by IATA code', () => {
    const lis = airportInfo('LIS')!;
    expect(lis.country).toBe('PT');
    expect(lis.lat).toBeCloseTo(38.77, 1);
    expect(airportInfo('JFK')!.country).toBe('US');
    expect(airportInfo('lis')!.country).toBe('PT');
  });
  it('unknown codes: null', () => {
    expect(airportInfo('XXX')).toBeNull();
    expect(airportInfo('')).toBeNull();
  });
});
