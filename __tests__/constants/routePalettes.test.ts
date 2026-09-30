import { ROUTE_PALETTES, routePalette, dayRouteColor } from '@/constants/routePalettes';

// Relative luminance per WCAG; the map is dark (Standard "night"/"dusk" and 3D terrain),
// so every route colour must stand well clear of it.
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrastOnDark = (hex: string) => (luminance(hex) + 0.05) / (luminance('#0B0A12') + 0.05);

describe('route palettes', () => {
  it('offers five, with Aurora as the default', () => {
    expect(ROUTE_PALETTES.map((p) => p.id)).toEqual(['aurora', 'sunset', 'ocean', 'forest', 'moonlight']);
    expect(routePalette(undefined).id).toBe('aurora');
    expect(routePalette('not-a-palette').id).toBe('aurora');
  });

  it('keeps every colour readable on the dark map (≥ 4.5:1)', () => {
    for (const p of ROUTE_PALETTES) {
      for (const c of [...p.days, p.actual]) expect(contrastOnDark(c)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('gives each palette at least six distinct day colours, cycling after that', () => {
    for (const p of ROUTE_PALETTES) {
      expect(new Set(p.days).size).toBeGreaterThanOrEqual(6);
      expect(dayRouteColor(p, p.days.length)).toBe(p.days[0]);
    }
  });
});
