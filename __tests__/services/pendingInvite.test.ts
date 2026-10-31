const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
const mockPlatform = { OS: 'android' };
jest.mock('react-native', () => ({ get Platform() { return mockPlatform; } }));
const mockClip = { hasUrlAsync: jest.fn(), hasStringAsync: jest.fn(), getStringAsync: jest.fn() };
jest.mock('expo-clipboard', () => ({
  hasUrlAsync: () => mockClip.hasUrlAsync(),
  hasStringAsync: () => mockClip.hasStringAsync(),
  getStringAsync: () => mockClip.getStringAsync(),
}));
const mockReferrer = jest.fn();
jest.mock('expo-application', () => ({ getInstallReferrerAsync: () => mockReferrer() }));

import { checkInstallReferrerOnce, inviteFromClipboardOnce, readPendingInvite } from '@/services/pendingInvite';

beforeEach(() => { for (const k of Object.keys(mockStore)) delete mockStore[k]; mockReferrer.mockReset(); });

describe('checkInstallReferrerOnce (review fix: a failed read is tried again)', () => {
  it('a failed first read leaves it to try again, and the next read keeps the invite', async () => {
    mockReferrer.mockRejectedValueOnce(new Error('service not bound'));
    await checkInstallReferrerOnce();
    expect(await readPendingInvite()).toBeNull();
    mockReferrer.mockResolvedValueOnce('invite=abcdefgh12345678');
    await checkInstallReferrerOnce();
    expect(await readPendingInvite()).toBe('abcdefgh12345678');
  });
  it('reads only once after a successful read', async () => {
    mockReferrer.mockResolvedValue('utm_source=google-play');
    await checkInstallReferrerOnce();
    await checkInstallReferrerOnce();
    expect(mockReferrer).toHaveBeenCalledTimes(1);
  });
});

describe('inviteFromClipboardOnce (owner, 2026-10-31: iPhone picks up the link the page copied)', () => {
  const now = Date.now();
  beforeEach(() => { mockPlatform.OS = 'ios'; Object.values(mockClip).forEach((f) => f.mockReset()); });
  afterAll(() => { mockPlatform.OS = 'android'; });
  it('finds the invite once for a new account', async () => {
    mockClip.hasUrlAsync.mockResolvedValue(true);
    mockClip.getStringAsync.mockResolvedValue('https://supernova-a2125.web.app/join/abcdefgh12345678');
    expect(await inviteFromClipboardOnce('u1', now - 60_000)).toBe('abcdefgh12345678');
    expect(await inviteFromClipboardOnce('u1', now - 60_000)).toBeNull();
    expect(mockClip.getStringAsync).toHaveBeenCalledTimes(1);
  });
  it('never reads (no Allow Paste question) when nothing is copied', async () => {
    mockClip.hasUrlAsync.mockResolvedValue(false);
    mockClip.hasStringAsync.mockResolvedValue(false);
    expect(await inviteFromClipboardOnce('u2', now - 60_000)).toBeNull();
    expect(mockClip.getStringAsync).not.toHaveBeenCalled();
  });
  it('ignores something else that was copied, and older accounts', async () => {
    mockClip.hasUrlAsync.mockResolvedValue(true);
    mockClip.getStringAsync.mockResolvedValue('https://example.com');
    expect(await inviteFromClipboardOnce('u3', now - 60_000)).toBeNull();
    expect(await inviteFromClipboardOnce('u4', now - 2 * 86_400_000)).toBeNull();
    expect(mockClip.getStringAsync).toHaveBeenCalledTimes(1);
  });
});
