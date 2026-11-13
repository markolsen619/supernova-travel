import { COUNTRY_INFO } from '@/constants/countryInfo';
import catalog from '../../data/destinations.json';

describe('COUNTRY_INFO', () => {
  const entries = Object.entries(COUNTRY_INFO);
  it('covers the world (≥ 190 countries) with every hard fact valid', () => {
    expect(entries.length).toBeGreaterThanOrEqual(190);
    for (const [code, c] of entries) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(c.name.length).toBeGreaterThan(1);
      expect(c.plugs.length).toBeGreaterThan(0);
      for (const p of c.plugs) expect(p).toMatch(/^[A-O]$/);
      expect([100, 110, 115, 120, 127, 220, 230, 240]).toContain(c.voltage);
      expect(c.currency.code).toMatch(/^[A-Z]{3}$/);
      expect(c.emergency).toMatch(/\d/);
      expect(['left', 'right']).toContain(c.drive);
      if (c.tapWater) expect(['safe', 'bottled']).toContain(c.tapWater);
      if (c.airaloSlug) expect(c.airaloSlug).toMatch(/^[a-z-]+-esim$/);
    }
  });
  it('every catalog country has tipping, tap water and an Airalo page', () => {
    const codes = [...new Set((catalog as { countryCode: string }[]).map((e) => e.countryCode))];
    for (const code of codes) {
      expect(COUNTRY_INFO[code]).toBeDefined();
      expect(COUNTRY_INFO[code].tipping).toBeTruthy();
      expect(COUNTRY_INFO[code].tapWater).toBeTruthy();
      expect(COUNTRY_INFO[code].airaloSlug).toBeTruthy();
    }
  });
  it('spot checks known facts', () => {
    expect(COUNTRY_INFO.US).toMatchObject({ plugs: ['A', 'B'], voltage: 120, drive: 'right', currency: { code: 'USD' }, emergency: '911' });
    expect(COUNTRY_INFO.GB).toMatchObject({ plugs: ['G'], voltage: 230, drive: 'left', currency: { code: 'GBP' }, emergency: '999' });
    expect(COUNTRY_INFO.JP).toMatchObject({ plugs: ['A', 'B'], voltage: 100, drive: 'left', currency: { code: 'JPY' } });
    expect(COUNTRY_INFO.CZ).toMatchObject({ name: 'Czechia', plugs: ['C', 'E'], voltage: 230, drive: 'right', currency: { code: 'CZK' }, emergency: '112' });
    expect(COUNTRY_INFO.AU).toMatchObject({ plugs: ['I'], voltage: 230, drive: 'left', currency: { code: 'AUD' }, emergency: '000' });
    expect(COUNTRY_INFO.IN).toMatchObject({ voltage: 230, drive: 'left', currency: { code: 'INR' }, emergency: '112' });
    expect(COUNTRY_INFO.CN.plugs).toEqual(expect.arrayContaining(['A', 'C', 'I']));
    expect(COUNTRY_INFO.IE).toMatchObject({ plugs: ['G'], drive: 'left', currency: { code: 'EUR' } });
  });
});
