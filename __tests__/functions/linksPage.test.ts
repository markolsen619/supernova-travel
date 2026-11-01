import { parseLinksConfig, renderLinksPage, storeHref, type LinksTrip } from '../../functions/src/linksPage';

const trip: LinksTrip = { id: 'abc123', city: 'Lisbon', days: 4, title: 'Lisbon <Family> & "Fun"', photoUrl: 'https://lh3.googleusercontent.com/p/x', credit: 'Google' };

describe('parseLinksConfig', () => {
  it('reads a promo and trips, dropping anything malformed', () => {
    const c = parseLinksConfig({
      promo: { eyebrow: 'PRO', title: 'Try Pro free', body: 'One week.', cta: 'Get the app' },
      trips: [{ tripId: 'abc123', city: 'Lisbon', query: 'Alfama Lisbon' }, { tripId: '', city: 'x' }, 'junk'],
    });
    expect(c.promo?.title).toBe('Try Pro free');
    expect(c.trips).toEqual([{ tripId: 'abc123', city: 'Lisbon', query: 'Alfama Lisbon' }]);
  });
  it('no doc or a promo without a title: no promo, no trips', () => {
    expect(parseLinksConfig(undefined)).toEqual({ promo: null, trips: [] });
    expect(parseLinksConfig({ promo: { title: '' } }).promo).toBeNull();
  });
});

describe('storeHref', () => {
  it('sends each phone to its own store', () => {
    expect(storeHref('ios')).toBe('https://apps.apple.com/app/id6810490710');
    expect(storeHref('android')).toBe('https://play.google.com/store/apps/details?id=com.supernovatravel.app');
    expect(storeHref('other')).toBe('https://apps.apple.com/app/id6810490710');
  });
});

describe('renderLinksPage', () => {
  const page = renderLinksPage({ promo: { eyebrow: 'SUPERNOVA PRO', title: 'Try Pro free for 1 week', body: 'Cancel anytime.', cta: 'Get the app' }, trips: [trip], platform: 'android' });
  it('escapes everything and links trips to their share pages', () => {
    expect(page).toContain('Lisbon &lt;Family&gt; &amp; &quot;Fun&quot;');
    expect(page).not.toContain('<Family>');
    expect(page).toContain('href="https://supernova-a2125.web.app/trip/abc123"');
    expect(page).toContain('LISBON · 4 DAYS');
    expect(page).toContain('Photo: Google');
  });
  it('the promo button goes to this phone\'s store; both store badges are there', () => {
    expect(page).toMatch(/class="btn-white" href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.supernovatravel\.app"/);
    expect(page).toContain('https://apps.apple.com/app/id6810490710');
    expect(page).toContain('/links/app-store-badge.svg');
    expect(page).toContain('/links/google-play-badge.png');
  });
  it('no promo, no card; a trip without a photo still shows', () => {
    const p = renderLinksPage({ promo: null, trips: [{ ...trip, photoUrl: null, credit: null }], platform: 'ios' });
    expect(p).not.toContain('class="promo"');
    expect(p).toContain('LISBON · 4 DAYS');
    expect(p).not.toContain('Photo: Google');
  });
  it('never puts a key-carrying URL on the page', () => {
    const p = renderLinksPage({ promo: null, trips: [{ ...trip, photoUrl: 'https://places.googleapis.com/v1/x/media?key=AIzaSECRET' }], platform: 'ios' });
    expect(p).not.toContain('AIza');
  });
});
