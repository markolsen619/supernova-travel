import { resolvePostAuthor } from '@/utils/postAuthor';

const post = (over: Record<string, unknown> = {}) =>
  ({
    authorUid: 'u1',
    authorDisplayName: 'Kelly Dibernardo',
    authorAvatarUrl: null,
    ...over,
  }) as never;

describe('resolvePostAuthor', () => {
  it('uses the live profile when one is loaded', () => {
    // The real case: Kelly posted at 06:24 with no avatar, set one at 06:35.
    // The post's frozen copy says null; her profile knows better.
    expect(
      resolvePostAuthor(post(), { name: 'Kelly Dibernardo', avatarUrl: 'https://live/new.jpg' }),
    ).toEqual({ name: 'Kelly Dibernardo', avatarUrl: 'https://live/new.jpg' });
  });

  it('prefers the live avatar even when the post has an older one', () => {
    // Changing your photo should update every post, not just future ones.
    expect(
      resolvePostAuthor(post({ authorAvatarUrl: 'https://old.jpg' }), {
        name: 'Kelly',
        avatarUrl: 'https://new.jpg',
      }).avatarUrl,
    ).toBe('https://new.jpg');
  });

  it('falls back to the post copy before the profiles query resolves', () => {
    // First render of the feed has no profiles yet. Showing the stored
    // avatar beats flashing initials and then swapping.
    expect(resolvePostAuthor(post({ authorAvatarUrl: 'https://stored.jpg' }), undefined).avatarUrl)
      .toBe('https://stored.jpg');
  });

  it('falls back to the post copy when the author has no profile document', () => {
    // A deleted account: the post survives with its denormalized name.
    expect(resolvePostAuthor(post({ authorDisplayName: 'Gone' }), undefined).name).toBe('Gone');
  });

  it('does not let a live profile with no avatar erase a stored one', () => {
    // If someone REMOVES their photo the live value is null — but null here
    // is also what "not loaded" looks like on a partial doc, and blanking a
    // working avatar is the worse failure.
    expect(
      resolvePostAuthor(post({ authorAvatarUrl: 'https://stored.jpg' }), {
        name: 'Kelly',
        avatarUrl: null,
      }).avatarUrl,
    ).toBe('https://stored.jpg');
  });

  it('never returns an empty name', () => {
    // Avatar renders initials from the name; an empty string renders a blank
    // circle, which looks broken rather than anonymous.
    expect(resolvePostAuthor(post({ authorDisplayName: '' }), undefined).name).toBe('Traveler');
  });
});
