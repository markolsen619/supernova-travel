import { normalizeTime, chunk } from '@/utils/transitTime';

describe('normalizeTime', () => {
  it('accepts what people type and stores HH:MM', () => {
    expect(normalizeTime('10:19')).toBe('10:19');
    expect(normalizeTime('9:05')).toBe('09:05');
    expect(normalizeTime(' 9.05 ')).toBe('09:05');
    expect(normalizeTime('1019')).toBe('10:19');
  });
  it('refuses what is not a time', () => {
    expect(normalizeTime('')).toBeNull();
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime('10:60')).toBeNull();
    expect(normalizeTime('morning')).toBeNull();
  });
});

describe('chunk', () => {
  it('lays out a grid in full rows (no wrapping)', () => {
    expect(chunk([1, 2, 3, 4, 5, 6, 7], 3)).toEqual([[1, 2, 3], [4, 5, 6], [7]]);
    expect(chunk([], 3)).toEqual([]);
  });
});
