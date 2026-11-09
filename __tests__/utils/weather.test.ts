import { symbolKind, parseForecast, usesFahrenheit, tempLabel, forecastUrl, MET_HEADERS } from '@/utils/weather';

describe('weather on trip days (owner, 2026-11-09: MET Norway — free for commercial use, credited)', () => {
  it('symbolKind maps MET symbol codes to a few icons', () => {
    expect(['clearsky_day', 'fair_night', 'partlycloudy_day', 'cloudy', 'fog', 'lightrain', 'rainshowers_day', 'heavyrainandthunder', 'snow', 'lightsleetshowers_day', 'drizzle', 'mystery'].map(symbolKind))
      .toEqual(['sun', 'sun', 'partly', 'cloud', 'fog', 'rain', 'rain', 'storm', 'snow', 'snow', 'rain', 'cloud']);
  });
  it('parseForecast: each local day\'s high, low and its midday sky (local day from the city\'s longitude)', () => {
    const ts = (time: string, t: number, sym?: string) => ({ time, data: { instant: { details: { air_temperature: t } }, ...(sym ? { next_6_hours: { summary: { symbol_code: sym } } } : {}) } });
    const json = { properties: { timeseries: [
      ts('2026-12-01T21:00:00Z', 10), // Tokyo (lng 139.8 → +9 h): 06:00 on Dec 2
      ts('2026-12-02T03:00:00Z', 18, 'clearsky_day'), // 12:00 Dec 2
      ts('2026-12-02T06:00:00Z', 20, 'partlycloudy_day'),
      ts('2026-12-02T12:00:00Z', 12, 'rain'), // 21:00 Dec 2
      ts('2026-12-02T18:00:00Z', 8, 'cloudy'), // 03:00 Dec 3
    ] } };
    const f = parseForecast(json, 139.8);
    expect(f['2026-12-02']).toEqual({ kind: 'sun', max: 20, min: 10 });
    expect(f['2026-12-03']).toEqual({ kind: 'cloud', max: 8, min: 8 });
    expect(parseForecast({}, 0)).toEqual({});
    expect(parseForecast(null, 0)).toEqual({});
  });
  it('°F where people read Fahrenheit, else °C', () => {
    expect(usesFahrenheit('en-US')).toBe(true);
    expect(usesFahrenheit('en-GB')).toBe(false);
    expect(usesFahrenheit('en')).toBe(false);
  });
  it('tempLabel rounds and converts', () => {
    expect(tempLabel({ kind: 'sun', max: 24.4, min: 15.5 }, false)).toBe('24° / 16°');
    expect(tempLabel({ kind: 'sun', max: 24.4, min: 15.5 }, true)).toBe('76° / 60°');
  });
  it('asks MET Norway for only the rounded city position, identifying the app as their terms require', () => {
    expect(forecastUrl(35.6812, 139.7671)).toBe('https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=35.68&lon=139.77');
    expect(MET_HEADERS['User-Agent']).toMatch(/^SupernovaTravel\/1\.\d+ .*supernovatravel\.xyz/);
  });
});
