import {
  containsObjectionableText,
  firstObjectionableField,
} from '@/utils/contentFilter';

describe('containsObjectionableText', () => {
  it('catches a slur as a whole word, in any case', () => {
    expect(containsObjectionableText('you are a Faggot')).toBe(true);
    expect(containsObjectionableText('RETARD')).toBe(true);
  });

  it('catches plurals', () => {
    expect(containsObjectionableText('those whores')).toBe(true);
    expect(containsObjectionableText('sluts')).toBe(true);
  });

  it('catches character substitutions', () => {
    expect(containsObjectionableText('c0on')).toBe(true);
    expect(containsObjectionableText('wh0r3')).toBe(true);
    expect(containsObjectionableText('$lut')).toBe(true);
  });

  it('catches stretched letters', () => {
    expect(containsObjectionableText('fagggggot')).toBe(true);
    expect(containsObjectionableText('cuuuunt')).toBe(true);
  });

  it('catches spaced-out spellings', () => {
    expect(containsObjectionableText('what a c u n t')).toBe(true);
    expect(containsObjectionableText('k y s')).toBe(true);
  });

  it('catches accented spellings', () => {
    expect(containsObjectionableText('whöre')).toBe(true);
  });

  it('catches phrases, including stretched ones', () => {
    expect(containsObjectionableText('just go kill yourself')).toBe(true);
    expect(containsObjectionableText('kill yourselllf')).toBe(true);
    expect(containsObjectionableText('Send nudes')).toBe(true);
  });

  describe('leaves ordinary travel writing alone', () => {
    it.each([
      'Two weeks in Niger and Nigeria',
      'Scunthorpe to Penistone by train',
      'A classic sunset in Cancún',
      'Raccoons raided our campsite',
      'Pros and cons of the night bus',
      'Spick and span hostel, great staff',
      '#foodporn in Bangkok',
      'Pakistan was the highlight of the year',
      'Cocktails at the Dickens Inn',
      'Assisted living for my grandparents near Essex',
      'Hanging out by the pool',
      'This view is fucking unreal',
      'I kill it at karaoke, 10/10 would go again!',
      'Day 1 of 14: 5am start',
    ])('%s', (text) => {
      expect(containsObjectionableText(text)).toBe(false);
    });
  });

  it('treats empty input as clean', () => {
    expect(containsObjectionableText('')).toBe(false);
    expect(containsObjectionableText(null)).toBe(false);
    expect(containsObjectionableText(undefined)).toBe(false);
    expect(containsObjectionableText('   ')).toBe(false);
  });
});

describe('firstObjectionableField', () => {
  it('names the first field that fails', () => {
    expect(firstObjectionableField({ fullName: 'Sam', bio: 'total whore', location: 'coon' })).toBe('bio');
  });

  it('returns null when every field is clean', () => {
    expect(firstObjectionableField({ fullName: 'Sam', bio: 'Slow travel', location: null })).toBeNull();
  });
});
