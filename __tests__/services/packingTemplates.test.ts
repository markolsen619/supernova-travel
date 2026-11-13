import { generatePackingList } from '@/services/packingTemplates';

const trip = (month: number, lat: number) => ({
  tags: [], description: '', destination: { name: 'Somewhere', lat },
  startDate: { toDate: () => new Date(2026, month - 1, 10) },
}) as never;
const labels = (t: unknown) => generatePackingList(t as never).map((i) => i.label);

describe('generatePackingList seasons by hemisphere (final review I3: July in Buenos Aires got shorts)', () => {
  it('July: summer clothes up north, winter clothes down south', () => {
    expect(labels(trip(7, 48.8))).toContain('Shorts');
    expect(labels(trip(7, -34.6))).toContain('Winter coat');
    expect(labels(trip(7, -34.6))).not.toContain('Shorts');
  });
  it('January flips the other way', () => {
    expect(labels(trip(1, -34.6))).toContain('Shorts');
    expect(labels(trip(1, 48.8))).toContain('Winter coat');
  });
});
