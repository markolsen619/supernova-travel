/** @jest-environment node */
// __tests__/functions/apns.test.ts
import { pushPassUpdates } from '../../functions/src/apns';

describe('pushPassUpdates (final review)', () => {
  it('a certificate Node cannot read gives no result instead of throwing', async () => {
    await expect(pushPassUpdates(['tok'], { cert: 'not a pem', key: 'not a pem' })).resolves.toEqual([]);
  });
  it('a connection that fails resolves instead of crashing the instance', async () => {
    await expect(pushPassUpdates(['tok'], { cert: '', key: '' }, 'https://127.0.0.1:9')).resolves.toEqual([]);
  }, 15_000);
  it('nothing to push makes no connection', async () => {
    await expect(pushPassUpdates([], { cert: '', key: '' })).resolves.toEqual([]);
  });
});
