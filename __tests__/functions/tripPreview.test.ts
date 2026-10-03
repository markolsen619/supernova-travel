import { previewEligibility, renderTripPreview, escapeHtml, tripIdFromPath } from '../../functions/src/tripPreview';

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
