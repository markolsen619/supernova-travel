import { mergeNewestFirst } from '@/utils/tripMerge';

const t = (id: string, ms: number | null) => ({ id, createdAt: ms == null ? null : { toMillis: () => ms } });

describe('mergeNewestFirst', () => {
  it('interleaves lists by creation time, newest first', () => {
    const merged = mergeNewestFirst([t('pub-old', 1), t('pub-new', 30)], [t('fol-mid', 20)]);
    expect(merged.map((x) => x.id)).toEqual(['pub-new', 'fol-mid', 'pub-old']);
  });

  it('drops a trip that appears in both lists', () => {
    // A trip switched from followers to public between the two reads.
    expect(mergeNewestFirst([t('a', 5)], [t('a', 5)]).map((x) => x.id)).toEqual(['a']);
  });

  it('puts trips with no timestamp yet last', () => {
    expect(mergeNewestFirst([t('pending', null), t('a', 5)]).map((x) => x.id)).toEqual(['a', 'pending']);
  });
});
