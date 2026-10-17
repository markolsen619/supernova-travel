import { previewEligibility, renderTripPreview, escapeHtml, tripIdFromPath, coverLookup, canonicalRedirect, cachedCover } from '../../functions/src/tripPreview';

describe('previewEligibility', () => {
  const trip = { visibility: 'public', moderationHidden: false };
  const author = { settings: { privacy: 'public' } };
  it('only a public trip by a public account, not hidden', () => {
    expect(previewEligibility(trip, author)).toBe(true);
    expect(previewEligibility(trip, {})).toBe(true);
    expect(previewEligibility({ ...trip, visibility: 'followers' }, author)).toBe(false);
    expect(previewEligibility({ ...trip, visibility: 'private' }, author)).toBe(false);
    expect(previewEligibility({ ...trip, moderationHidden: true }, author)).toBe(false);
    expect(previewEligibility(trip, { settings: { privacy: 'private' } })).toBe(false);
    expect(previewEligibility(null, author)).toBe(false);
    expect(previewEligibility(trip, null)).toBe(false);
  });
});

describe('tripIdFromPath', () => {
  it('reads the id from /trip/{id} and nothing else', () => {
    expect(tripIdFromPath('/trip/AbC123')).toBe('AbC123');
    expect(tripIdFromPath('/trip/AbC123/')).toBe('AbC123');
    expect(tripIdFromPath('/trip/')).toBeNull();
    expect(tripIdFromPath('/trip/a/b')).toBeNull();
    expect(tripIdFromPath('/trip/<x>')).toBeNull();
  });
});

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
  });
});

describe('renderTripPreview', () => {
  const trip = {
    id: 't1', title: 'Paris <script>alert(1)</script> & "co"', coverImageUrl: 'https://x/c.jpg?a=1&b=2',
    placeLabel: 'Paris', days: 5, authorName: 'Supernova',
  };
  it('escapes everything, in the page and in the share tags', () => {
    const html = renderTripPreview(trip, ['Louvre <b>']);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('Paris &lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;co&quot;');
    expect(html).toContain('Louvre &lt;b&gt;');
    expect(html).toContain('<meta property="og:image" content="https://x/c.jpg?a=1&amp;b=2">');
    expect(html).toContain('<meta property="og:description" content="Paris · 5 days on Supernova">');
  });
  it('shows the eyebrow, author and at most five stops', () => {
    const html = renderTripPreview({ ...trip, title: 'Paris' }, ['a1', 'a2', 'a3', 'a4', 'a5', 'a6']);
    expect(html).toContain('PARIS · 5 DAYS');
    expect(html).toContain('by Supernova');
    expect(html).toContain('a5');
    expect(html).not.toContain('a6');
  });
  it('a one-day trip says 1 day', () => {
    expect(renderTripPreview({ ...trip, days: 1 }, [])).toContain('1 DAY');
  });
  it('links into the app and the App Store', () => {
    const html = renderTripPreview(trip, []);
    expect(html).toContain('href="supernova://trip/t1"');
    expect(html).toContain('href="https://apps.apple.com/app/id6810490710"');
  });
  it('the generic page shows no trip details', () => {
    const html = renderTripPreview(null, []);
    expect(html).toContain('Supernova');
    expect(html).not.toContain('og:image');
    expect(html).toContain('href="https://apps.apple.com/app/id6810490710"');
    expect(html).toContain('href="supernova://"');
  });
});

describe('coverLookup', () => {
  const places = 'https://places.googleapis.com/v1/places/P1/photos/X/media?maxWidthPx=1200&key=SECRET';
  it('a Places photo is looked up server-side, never published with its key', () => {
    expect(coverLookup(places)).toEqual({
      kind: 'places',
      url: 'https://places.googleapis.com/v1/places/P1/photos/X/media?maxWidthPx=1200&key=SECRET&skipHttpRedirect=true',
    });
  });
  it('any other https image is used as is', () => {
    expect(coverLookup('https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media'))
      .toEqual({ kind: 'direct', url: 'https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg?alt=media' });
  });
  it('anything else has no cover, and no URL with a key ever passes through', () => {
    expect(coverLookup(null)).toEqual({ kind: 'none' });
    expect(coverLookup('not a url')).toEqual({ kind: 'none' });
    expect(coverLookup('http://x/a.jpg')).toEqual({ kind: 'none' });
    expect(coverLookup('https://maps.googleapis.com/maps/api/place/photo?key=SECRET')).toEqual({ kind: 'none' });
  });
});

describe('renderTripPreview — generic page and photo credit', () => {
  it('the generic page for a trip it can not show still opens that trip in the app', () => {
    const html = renderTripPreview(null, [], 'AbC123');
    expect(html).toContain('href="supernova://trip/AbC123"');
    expect(html).not.toContain('AbC123</');
  });
  it('a Google photo carries its credit', () => {
    const html = renderTripPreview({
      id: 't1', title: 'Rome', coverImageUrl: 'https://lh3.googleusercontent.com/x', coverCredit: 'Google',
      placeLabel: 'Rome', days: 3, authorName: 'Supernova',
    }, []);
    expect(html).toContain('Photo: Google');
  });
});

describe('canonicalRedirect', () => {
  it('sends any query string or trailing slash to the one cached path', () => {
    expect(canonicalRedirect('/trip/AbC?a=1')).toBe('/trip/AbC');
    expect(canonicalRedirect('/trip/AbC/')).toBe('/trip/AbC');
    expect(canonicalRedirect('/trip/AbC/?x')).toBe('/trip/AbC');
  });
  it('leaves the canonical path and non-trip paths alone', () => {
    expect(canonicalRedirect('/trip/AbC')).toBeNull();
    expect(canonicalRedirect('/trip/<x>?a')).toBeNull();
  });
});

describe('cachedCover', () => {
  const now = Date.UTC(2026, 9, 3);
  const entry = { source: 'https://places/x', photoUri: 'https://lh3/y', resolvedAt: now - 2 * 86400000 };
  it('reuses a resolved photo for the same cover for a week', () => {
    expect(cachedCover(entry, 'https://places/x', now)).toBe('https://lh3/y');
    expect(cachedCover({ ...entry, resolvedAt: now - 8 * 86400000 }, 'https://places/x', now)).toBeNull();
  });
  it('a changed cover or a missing entry resolves again', () => {
    expect(cachedCover(entry, 'https://places/other', now)).toBeNull();
    expect(cachedCover(undefined, 'https://places/x', now)).toBeNull();
    expect(cachedCover({ source: 'https://places/x' }, 'https://places/x', now)).toBeNull();
  });
});

import { postIdFromPath, postPreviewEligibility, renderPostPreview } from '../../functions/src/tripPreview';

describe('preview pages carry the app icon', () => {
  // iOS share sheets and link previews draw the site's icon; without these they fell back to a
  // generic text glyph (2026-10-16).
  it('every page links the touch icon and favicon', () => {
    for (const html of [renderTripPreview(null, []), renderPostPreview(null)]) {
      expect(html).toContain('<link rel="apple-touch-icon" href="/apple-touch-icon.png">');
      expect(html).toContain('<link rel="icon" type="image/png" href="/favicon.png">');
    }
  });
  it('a trip without a cover uses the star as its preview image', () => {
    const html = renderTripPreview({ id: 't1', title: 'T', coverImageUrl: null, placeLabel: 'Lisbon', days: 2, authorName: 'A' }, []);
    expect(html).toContain('<meta property="og:image" content="https://supernova-a2125.web.app/apple-touch-icon.png">');
  });
});

describe('postIdFromPath', () => {
  it('reads /post/{id}', () => {
    expect(postIdFromPath('/post/abc123')).toBe('abc123');
    expect(postIdFromPath('/post/abc123/')).toBe('abc123');
  });
  it('rejects anything else', () => {
    expect(postIdFromPath('/post/')).toBeNull();
    expect(postIdFromPath('/post/a/b')).toBeNull();
    expect(postIdFromPath('/trip/abc')).toBeNull();
    expect(postIdFromPath('/post/<x>')).toBeNull();
  });
});

describe('postPreviewEligibility', () => {
  const author = { settings: { privacy: 'public' } };
  it('shows a public post by a public account', () => {
    expect(postPreviewEligibility({ visibility: 'public' }, author)).toBe(true);
  });
  it('treats a post with no visibility (older apps) as public, like the feed backfill', () => {
    expect(postPreviewEligibility({}, author)).toBe(true);
  });
  it('hides followers-only, hidden, private-account and missing posts', () => {
    expect(postPreviewEligibility({ visibility: 'followers' }, author)).toBe(false);
    expect(postPreviewEligibility({ visibility: 'public', moderationHidden: true }, author)).toBe(false);
    expect(postPreviewEligibility({ visibility: 'public' }, { settings: { privacy: 'private' } })).toBe(false);
    expect(postPreviewEligibility(null, author)).toBe(false);
    expect(postPreviewEligibility({ visibility: 'public' }, null)).toBe(false);
  });
});

describe('renderPostPreview', () => {
  const post = { id: 'p1', authorName: 'Kelly <b>', caption: 'Tacos "al pastor"', placeName: 'Mexico City', imageUrl: 'https://firebasestorage.googleapis.com/x.jpg' };
  it('shows the photo, author, place and caption, escaped', () => {
    const html = renderPostPreview(post);
    expect(html).toContain('<meta property="og:image" content="https://firebasestorage.googleapis.com/x.jpg">');
    expect(html).toContain('Kelly &lt;b&gt;');
    expect(html).toContain('Tacos &quot;al pastor&quot;');
    expect(html).toContain('MEXICO CITY');
    expect(html).toContain('href="supernova://post/p1"');
    expect(html).not.toContain('<b>');
  });
  it('falls back to the star image when the post has no usable photo', () => {
    expect(renderPostPreview({ ...post, imageUrl: null })).toContain('content="https://supernova-a2125.web.app/apple-touch-icon.png"');
  });
  it('the generic page shows nothing about the post', () => {
    const html = renderPostPreview(null, 'p1');
    expect(html).not.toContain('Tacos');
    expect(html).toContain('href="supernova://post/p1"');
  });
});

describe('canonicalRedirect for posts', () => {
  it('redirects query strings on post links too', () => {
    expect(canonicalRedirect('/post/p1?x=1')).toBe('/post/p1');
    expect(canonicalRedirect('/post/p1')).toBeNull();
  });
});

import { postImageLookup } from '../../functions/src/tripPreview';

describe('review fix: a post page never publishes a keyed Places URL', () => {
  const places = 'https://places.googleapis.com/v1/places/abc/photos/xyz/media?maxWidthPx=800&key=SECRET';
  it('a trip post (cover is a Places URL) is resolved, never used directly', () => {
    const l = postImageLookup({ mediaType: 'trip', mediaUrl: places, mediaUrls: [places], thumbnailUrl: places });
    // 'places' = resolved server-side to Google's key-less photoUri; only that address is ever published.
    expect(l.kind).toBe('places');
  });
  it('a photo post uses its Storage URL', () => {
    const url = 'https://firebasestorage.googleapis.com/v0/b/x/o/p.jpg?alt=media&token=t';
    expect(postImageLookup({ mediaType: 'image', mediaUrls: [url] })).toEqual({ kind: 'direct', url });
  });
  it('a video post uses its cover frame', () => {
    expect(postImageLookup({ mediaType: 'video', mediaUrl: 'https://x/v.mp4', thumbnailUrl: 'https://x/c.jpg' })).toEqual({ kind: 'direct', url: 'https://x/c.jpg' });
  });
  it('any other keyed URL is dropped', () => {
    expect(postImageLookup({ mediaType: 'image', mediaUrls: ['https://maps.example.com/p?key=SECRET'] })).toEqual({ kind: 'none' });
  });
});
