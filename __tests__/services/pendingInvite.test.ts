const mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (k: string) => mockStore[k] ?? null),
  setItem: jest.fn(async (k: string, v: string) => { mockStore[k] = v; }),
  removeItem: jest.fn(async (k: string) => { delete mockStore[k]; }),
}));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
const mockReferrer = jest.fn();
jest.mock('expo-application', () => ({ getInstallReferrerAsync: () => mockReferrer() }));

import { checkInstallReferrerOnce, readPendingInvite } from '@/services/pendingInvite';

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
