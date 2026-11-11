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

import { shotQuota } from '../../functions/src/socialPost';
describe('shotQuota (fresh review I-1: re-reading a counted save skipped the hourly cap — free Gemini calls)', () => {
  const now = Date.parse('2026-11-11T10:00:00Z');
  const SID = 'sAbCdEfGhIjKlMnOpQrSt';
  it('a re-read of a counted save still counts toward the hour', () => {
    const first = shotQuota({}, SID, false, now);
    if (!first.ok) throw new Error('first');
    expect(first.monthNew).toBe(true);
    const again = shotQuota(first.patch, SID, false, now);
    if (!again.ok) throw new Error('again');
    expect(again.monthNew).toBe(false);
    expect(again.patch.hours?.['2026-11-11T10']).toBe(2);
  });
  it('caps re-reads of one save at 3', () => {
    let doc = {};
    for (let i = 0; i < 3; i++) { const q = shotQuota(doc, SID, true, now); if (!q.ok) throw new Error(String(i)); doc = q.patch; }
    expect(shotQuota(doc, SID, true, now)).toEqual({ ok: false, reason: 'hourly' });
  });
  it('the hourly cap applies to re-reads too', () => {
    const full = { videos: [SID], hours: { '2026-11-11T10': 30 } };
    expect(shotQuota(full, SID, true, now)).toEqual({ ok: false, reason: 'hourly' });
  });
  it('giving back a re-read refunds the hour but keeps the month counted', () => {
    const doc = { videos: [SID], hours: { '2026-11-11T10': 2 }, reads: { [SID]: 2 } };
    const back = releaseQuota(doc, SID, now, { month: false });
    expect(back.videos).toEqual([SID]);
    expect(back.hours?.['2026-11-11T10']).toBe(1);
  });
});
