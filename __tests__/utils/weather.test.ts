import { weatherKind, parseForecast, usesFahrenheit, tempLabel, forecastUrl } from '@/utils/weather';

describe('weather on trip days (owner, 2026-11-08; Open-Meteo, free, no key)', () => {
  it('weatherKind maps WMO codes to a few icons', () => {
    expect([0, 1, 2, 3, 45, 61, 66, 71, 80, 95].map(weatherKind)).toEqual(['sun', 'sun', 'partly', 'cloud', 'fog', 'rain', 'rain', 'snow', 'rain', 'storm']);
    expect(weatherKind(999)).toBe('cloud');
  });
  it('parseForecast keys days by their local date', () => {
    const f = parseForecast({ daily: { time: ['2026-12-01', '2026-12-02'], weather_code: [0, 61], temperature_2m_max: [24.4, 19.6], temperature_2m_min: [15.5, 12.1] } });
    expect(f['2026-12-02']).toEqual({ kind: 'rain', max: 19.6, min: 12.1 });
    expect(parseForecast({})).toEqual({});
    expect(parseForecast(null)).toEqual({});
  });
  it('°F where people read Fahrenheit, else °C', () => {
    expect(usesFahrenheit('en-US')).toBe(true);
    expect(usesFahrenheit('es-US')).toBe(true);
    expect(usesFahrenheit('en-GB')).toBe(false);
    expect(usesFahrenheit('ja-JP')).toBe(false);
    expect(usesFahrenheit('en')).toBe(false);
  });
  it('tempLabel rounds and converts', () => {
    expect(tempLabel({ kind: 'sun', max: 24.4, min: 15.5 }, false)).toBe('24° / 16°');
    expect(tempLabel({ kind: 'sun', max: 24.4, min: 15.5 }, true)).toBe('76° / 60°');
  });
  it('forecastUrl asks only for the city position (rounded) and the daily summary', () => {
    expect(forecastUrl(35.6812, 139.7671)).toBe('https://api.open-meteo.com/v1/forecast?latitude=35.68&longitude=139.77&daily=weather_code%2Ctemperature_2m_max%2Ctemperature_2m_min&timezone=auto&forecast_days=16');
  });
});
