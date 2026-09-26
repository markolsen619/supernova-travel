import {
  CANCEL_REASONS,
  buildCancellationFeedback,
  isValidCancelReason,
} from '@/utils/cancellation';

describe('CANCEL_REASONS', () => {
  it('offers a short, non-overlapping set', () => {
    // A long list is a wall to read when someone has already decided to go.
    expect(CANCEL_REASONS.length).toBeGreaterThanOrEqual(4);
    expect(CANCEL_REASONS.length).toBeLessThanOrEqual(6);
    expect(new Set(CANCEL_REASONS.map((r) => r.id)).size).toBe(CANCEL_REASONS.length);
  });

  it('has no "other" catch-all', () => {
    // "Other" collects nothing actionable. The free-text note covers it.
    expect(CANCEL_REASONS.map((r) => r.id)).not.toContain('other');
  });
});

describe('isValidCancelReason', () => {
  it('accepts a known id', () => {
    expect(isValidCancelReason(CANCEL_REASONS[0].id)).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidCancelReason('made_up')).toBe(false);
    expect(isValidCancelReason('')).toBe(false);
    expect(isValidCancelReason(null)).toBe(false);
  });
});

describe('buildCancellationFeedback', () => {
  it('records the reason and tier', () => {
    const doc = buildCancellationFeedback({ uid: 'u1', tier: 'pro', reason: 'too_expensive', note: '' });
    expect(doc).toMatchObject({ uid: 'u1', tier: 'pro', reason: 'too_expensive' });
  });

  it('allows no reason at all', () => {
    // Skipping must be possible — the survey can never block cancelling.
    expect(buildCancellationFeedback({ uid: 'u1', tier: 'pro', reason: null, note: '' }).reason).toBeNull();
  });

  it('drops an unrecognised reason rather than storing it', () => {
    // Keeps the field queryable: a typo or an older client's id must not
    // become a new category nobody can aggregate.
    expect(buildCancellationFeedback({ uid: 'u1', tier: 'pro', reason: 'nonsense', note: '' }).reason).toBeNull();
  });

  it('trims the note and caps its length', () => {
    const doc = buildCancellationFeedback({
      uid: 'u1', tier: 'pro', reason: null, note: '  ' + 'x'.repeat(900) + '  ',
    });
    expect(doc.note.length).toBe(500);
  });

  it('stores an empty note as empty, not null', () => {
    // One shape for the field keeps reads simple.
    expect(buildCancellationFeedback({ uid: 'u1', tier: 'pro', reason: null, note: '   ' }).note).toBe('');
  });
});
