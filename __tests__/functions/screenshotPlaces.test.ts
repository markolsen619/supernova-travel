import { SHOTS_PROMPT, SHOTS_SYSTEM, shotPaths, validShotsRequest } from '../../functions/src/screenshotPlaces';
import { releaseQuota, wishQuota } from '../../functions/src/socialPost';

describe('validShotsRequest', () => {
  it('accepts an s-prefixed 21-char id and 1–5 images', () => {
    expect(validShotsRequest({ saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 3 })).toEqual({ saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 3 });
  });
  it('refuses bad ids and counts', () => {
    for (const d of [{ saveId: 'AbCdEfGhIjKlMnOpQrStU', count: 1 }, { saveId: 's../x', count: 1 }, { saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 0 },
      { saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 6 }, { saveId: 'sAbCdEfGhIjKlMnOpQrSt', count: 2.5 }, null, 'x']) {
      expect(validShotsRequest(d)).toBeNull();
    }
  });
});

describe('shotPaths', () => {
  it('lists 0.jpg… in the user\'s own folder', () => {
    expect(shotPaths('u1', 'sAbCdEfGhIjKlMnOpQrSt', 2)).toEqual(['wish_shots/u1/sAbCdEfGhIjKlMnOpQrSt/0.jpg', 'wish_shots/u1/sAbCdEfGhIjKlMnOpQrSt/1.jpg']);
  });
});

describe('prompts', () => {
  it('asks only for places shown or named, never guessed', () => {
    expect(SHOTS_SYSTEM).toMatch(/never guess/i);
    expect(SHOTS_SYSTEM).toMatch(/at most 10/i);
    expect(SHOTS_PROMPT.length).toBeGreaterThan(10);
  });
});

describe('releaseQuota (review focus 3: a failed read is not charged)', () => {
  it('gives back a claim made by wishQuota', () => {
    const now = Date.parse('2026-11-11T10:00:00Z');
    const claim = wishQuota({}, 'sAbCdEfGhIjKlMnOpQrSt', false, now);
    if (!claim.ok) throw new Error('claim');
    const back = releaseQuota(claim.patch, 'sAbCdEfGhIjKlMnOpQrSt', now);
    expect(back.videos).toEqual([]);
    expect(back.hours?.['2026-11-11T10']).toBe(0);
  });
});
