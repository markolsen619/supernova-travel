import {
  makeToken, isToken, inviteUrl, playStoreUrl, firstName, inviteMessage, linkDecision, canCreateLink,
  utcDay, tokenFromJoinPath, renderJoinPage, formatTripDates, INVITE_TTL_MS, platformFromUserAgent,
} from '../../functions/src/tripInviteLinks';

const link = (o: Partial<{ status: 'open' | 'used' | 'cancelled'; expiresAtMs: number }> = {}) =>
  ({ tripId: 't1', inviterUid: 'inviter', status: 'open' as const, expiresAtMs: 2_000, ...o });
const base = { link: link(), nowMs: 1_000, tripExists: true, inviterOnTrip: true, callerUid: 'friend', callerIsMember: false, blocked: false };

describe('makeToken', () => {
  it('makes 16 lowercase letters/digits and skips biased bytes', () => {
    const bytes = new Uint8Array(32).map((_, i) => (i === 0 ? 255 : i));
    const t = makeToken(bytes)!;
    expect(t).toMatch(/^[a-z0-9]{16}$/);
    expect(t[0]).toBe('b'); // byte 255 skipped, byte 1 → 'b'
  });
  it('returns null when there are not enough usable bytes', () => {
    expect(makeToken(new Uint8Array(16).fill(253))).toBeNull();
  });
});

describe('isToken / tokenFromJoinPath', () => {
  it('accepts exactly 16 lowercase alphanumerics', () => {
    expect(isToken('abcdefgh12345678')).toBe(true);
    expect(isToken('ABCDEFGH12345678')).toBe(false);
    expect(isToken('abc')).toBe(false);
    expect(isToken(42)).toBe(false);
  });
  it('reads /join/{token} only', () => {
    expect(tokenFromJoinPath('/join/abcdefgh12345678')).toBe('abcdefgh12345678');
    expect(tokenFromJoinPath('/join/abcdefgh12345678/')).toBe('abcdefgh12345678');
    expect(tokenFromJoinPath('/join/<script>')).toBeNull();
    expect(tokenFromJoinPath('/trip/abcdefgh12345678')).toBeNull();
  });
});

describe('urls and message', () => {
  it('builds the join, Play and message text', () => {
    expect(inviteUrl('abcdefgh12345678')).toBe('https://supernova-a2125.web.app/join/abcdefgh12345678');
    expect(playStoreUrl('abcdefgh12345678')).toBe('https://play.google.com/store/apps/details?id=com.supernovatravel.app&referrer=invite%3Dabcdefgh12345678');
    expect(inviteMessage('Mark', 'Lisbon', 'https://x/join/a')).toBe('Mark invited you to Lisbon on Supernova. Join the trip: https://x/join/a');
  });
  it('uses the first word of a name, else A friend', () => {
    expect(firstName('Mark Olsen')).toBe('Mark');
    expect(firstName('  ')).toBe('A friend');
    expect(firstName(null)).toBe('A friend');
  });
});

describe('linkDecision', () => {
  it('joins an open, unexpired link', () => expect(linkDecision(base)).toBe('join'));
  it('a member just opens the trip, before any link check', () => {
    expect(linkDecision({ ...base, callerIsMember: true, link: link({ status: 'used' }) })).toBe('member');
  });
  it('used, cancelled, expired, missing link → expired', () => {
    expect(linkDecision({ ...base, link: link({ status: 'used' }) })).toBe('expired');
    expect(linkDecision({ ...base, link: link({ status: 'cancelled' }) })).toBe('expired');
    expect(linkDecision({ ...base, nowMs: 2_000 })).toBe('expired');
    expect(linkDecision({ ...base, link: null })).toBe('expired');
  });
  it('inviter left or trip gone → expired', () => {
    expect(linkDecision({ ...base, inviterOnTrip: false })).toBe('expired');
    expect(linkDecision({ ...base, tripExists: false, callerIsMember: false })).toBe('expired');
  });
  it('the inviter themself, and blocks', () => {
    expect(linkDecision({ ...base, callerUid: 'inviter' })).toBe('self');
    expect(linkDecision({ ...base, blocked: true })).toBe('blocked');
  });
});

describe('limits and days', () => {
  it('allows up to 20 open per trip and 50 a day', () => {
    expect(canCreateLink(19, 49)).toBe(true);
    expect(canCreateLink(20, 0)).toBe(false);
    expect(canCreateLink(0, 50)).toBe(false);
  });
  it('utcDay and the ttl', () => {
    expect(utcDay(Date.UTC(2026, 9, 30, 23, 59))).toBe('2026-10-30');
    expect(INVITE_TTL_MS).toBe(30 * 86_400_000);
  });
});

describe('formatTripDates', () => {
  it('same month, across months, none', () => {
    expect(formatTripDates(new Date(Date.UTC(2026, 4, 3)), new Date(Date.UTC(2026, 4, 9)))).toBe('MAY 3 – 9');
    expect(formatTripDates(new Date(Date.UTC(2026, 4, 30)), new Date(Date.UTC(2026, 5, 2)))).toBe('MAY 30 – JUN 2');
    expect(formatTripDates(null, null)).toBeNull();
  });
});

describe('renderJoinPage', () => {
  it('escapes everything and links both stores with the referrer', () => {
    const html = renderJoinPage({ token: 'abcdefgh12345678', inviterFirst: '<b>Mark', tripTitle: 'Lisbon & "Porto"', dates: 'MAY 3 – 9', coverUrl: 'https://img/x.jpg' }, {});
    expect(html).toContain('&lt;b&gt;Mark invited you');
    expect(html).toContain('Lisbon &amp; &quot;Porto&quot;');
    expect(html).toContain('referrer=invite%3Dabcdefgh12345678');
    expect(html).toContain('https://apps.apple.com/app/id6810490710');
    expect(html).toContain('href="supernova://join/abcdefgh12345678"');
    expect(html).toContain('data-copy="https://supernova-a2125.web.app/join/abcdefgh12345678" href="https://apps.apple.com/app/id6810490710"');
    expect(html).toContain('navigator.clipboard.writeText');
    expect(html).toContain('Install Supernova and sign up, and it brings you to the trip.');
    expect(html).not.toContain('<b>Mark');
  });
  it('expired page names the inviter when known and has no join link', () => {
    const html = renderJoinPage(null, { inviterFirst: 'Mark' });
    expect(html).toContain('This invite has expired. Ask Mark for a new one.');
    expect(html).not.toContain('/join/');
    expect(renderJoinPage(null, {})).toContain('Ask your friend for a new one.');
  });
});

describe('review fixes: opening the app from the page, photo credit', () => {
  const inv = { token: 'abcdefgh12345678', inviterFirst: 'Mark', tripTitle: 'Lisbon', dates: null, coverUrl: 'https://img/x.jpg', coverCredit: 'Google' };
  it('iPhone opens the app by its scheme (a same-site universal link stays in Safari)', () => {
    expect(renderJoinPage(inv, { platform: 'ios' })).toContain('class="cta" href="supernova://join/abcdefgh12345678"');
  });
  it('Android opens the app by an intent link that falls back to Play', () => {
    const html = renderJoinPage(inv, { platform: 'android' });
    expect(html).toContain('href="intent://join/abcdefgh12345678#Intent;scheme=supernova;package=com.supernovatravel.app;');
    expect(html).toContain('S.browser_fallback_url=https%3A%2F%2Fplay.google.com');
  });
  it('credits a Google photo', () => {
    expect(renderJoinPage(inv, { platform: 'other' })).toContain('Photo: Google');
    expect(renderJoinPage({ ...inv, coverCredit: null }, {})).not.toContain('Photo:');
  });
  it('reads the platform from the user agent', () => {
    expect(platformFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios');
    expect(platformFromUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('android');
    expect(platformFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe('other');
    expect(platformFromUserAgent(undefined)).toBe('other');
  });
});
