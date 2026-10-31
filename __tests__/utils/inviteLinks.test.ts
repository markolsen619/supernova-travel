import { parseInviteToken, parseInstallReferrer, shouldCheckClipboard, claimMode, inviteErrorCopy, shouldClearPending } from '@/utils/inviteLinks';

const T = 'abcdefgh12345678';
const DAY = 86_400_000;

describe('parseInviteToken', () => {
  it('finds our link inside a pasted message', () => {
    expect(parseInviteToken(`Mark invited you to Lisbon on Supernova. Join the trip: https://supernova-a2125.web.app/join/${T}`)).toBe(T);
    expect(parseInviteToken(`https://supernova-a2125.web.app/join/${T}/`)).toBe(T);
    expect(parseInviteToken(`https://supernova-a2125.web.app/join/${T}?x=1`)).toBe(T);
    expect(parseInviteToken(`supernova://join/${T}`)).toBe(T);
  });
  it('ignores anything else', () => {
    expect(parseInviteToken(`https://evil.example/join/${T}`)).toBeNull();
    expect(parseInviteToken(`https://supernova-a2125.web.app/trip/${T}`)).toBeNull();
    expect(parseInviteToken('https://supernova-a2125.web.app/join/short')).toBeNull();
    expect(parseInviteToken(`https://supernova-a2125.web.app/join/${T}extra`)).toBeNull();
    expect(parseInviteToken('')).toBeNull();
    expect(parseInviteToken(null)).toBeNull();
  });
});

describe('parseInstallReferrer', () => {
  it('reads invite= from the Play referrer', () => {
    expect(parseInstallReferrer(`invite=${T}`)).toBe(T);
    expect(parseInstallReferrer(`utm_source=x&invite=${T}`)).toBe(T);
    expect(parseInstallReferrer(`invite%3D${T}`)).toBe(T);
  });
  it('ignores organic installs and bad tokens', () => {
    expect(parseInstallReferrer('utm_source=google-play&utm_medium=organic')).toBeNull();
    expect(parseInstallReferrer('invite=BAD')).toBeNull();
    expect(parseInstallReferrer(null)).toBeNull();
  });
});

describe('shouldCheckClipboard / claimMode', () => {
  const base = { platform: 'ios', createdAtMs: 0, nowMs: DAY - 1, alreadyChecked: false, hasPending: false };
  it('looks once on iPhone for a new account with no invite waiting (the page copied the link)', () => {
    expect(shouldCheckClipboard(base)).toBe(true);
  });
  it('not on Android (Play carries the invite), not twice, not for older accounts, not when one is waiting', () => {
    expect(shouldCheckClipboard({ ...base, platform: 'android' })).toBe(false);
    expect(shouldCheckClipboard({ ...base, alreadyChecked: true })).toBe(false);
    expect(shouldCheckClipboard({ ...base, nowMs: DAY })).toBe(false);
    expect(shouldCheckClipboard({ ...base, createdAtMs: null })).toBe(false);
    expect(shouldCheckClipboard({ ...base, hasPending: true })).toBe(false);
  });
  it('joins automatically only for an account under a day old', () => {
    expect(claimMode({ createdAtMs: 0, nowMs: DAY - 1 })).toBe('auto');
    expect(claimMode({ createdAtMs: 0, nowMs: DAY })).toBe('confirm');
    expect(claimMode({ createdAtMs: null, nowMs: 0 })).toBe('confirm');
  });
});

describe('inviteErrorCopy', () => {
  it('says what happened and what to do', () => {
    expect(inviteErrorCopy('failed-precondition', 'Mark')).toBe('This invite has expired. Ask Mark for a new one.');
    expect(inviteErrorCopy('functions/failed-precondition')).toBe('This invite has expired. Ask your friend for a new one.');
    expect(inviteErrorCopy('permission-denied')).toBe("You can't join this trip.");
    expect(inviteErrorCopy('unavailable')).toBe("Couldn't reach Supernova. Check your connection and try again.");
    expect(inviteErrorCopy(undefined)).toBe('Something went wrong joining this trip. Try again.');
  });
});

describe('shouldClearPending (review fix: keep the invite until a final answer)', () => {
  it('clears after a join or a final refusal', () => {
    expect(shouldClearPending('joined')).toBe(true);
    expect(shouldClearPending('failed-precondition')).toBe(true);
    expect(shouldClearPending('functions/permission-denied')).toBe(true);
    expect(shouldClearPending('invalid-argument')).toBe(true);
  });
  it('keeps it when the phone could not reach us', () => {
    expect(shouldClearPending('unavailable')).toBe(false);
    expect(shouldClearPending('deadline-exceeded')).toBe(false);
    expect(shouldClearPending('internal')).toBe(false);
    expect(shouldClearPending('')).toBe(false);
  });
});
