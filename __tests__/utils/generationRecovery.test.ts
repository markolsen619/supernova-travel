import { isConnectionLoss, waitForGeneratedTrip } from '@/utils/generationRecovery';

const err = (code: string) => Object.assign(new Error(code), { code });

describe('isConnectionLoss', () => {
  it('the errors a dropped connection produces: the server may still have made the trip', () => {
    expect(isConnectionLoss(err('functions/internal'))).toBe(true);
    expect(isConnectionLoss(err('functions/unavailable'))).toBe(true);
    expect(isConnectionLoss(err('functions/deadline-exceeded'))).toBe(true);
  });
  it('a refusal from the server is final', () => {
    expect(isConnectionLoss(err('functions/resource-exhausted'))).toBe(false);
    expect(isConnectionLoss(err('functions/permission-denied'))).toBe(false);
    expect(isConnectionLoss(err('functions/failed-precondition'))).toBe(false);
    expect(isConnectionLoss(err('functions/invalid-argument'))).toBe(false);
    expect(isConnectionLoss(new Error('x'))).toBe(false);
    expect(isConnectionLoss(null)).toBe(false);
  });
});

describe('waitForGeneratedTrip', () => {
  const noSleep = () => Promise.resolve();
  it('finds the trip once the server has written it', async () => {
    let calls = 0;
    const exists = async () => ++calls >= 3;
    await expect(waitForGeneratedTrip(exists, { attempts: 10, intervalMs: 1, sleep: noSleep })).resolves.toBe(true);
    expect(calls).toBe(3);
  });
  it('a read that fails (the rules refuse a trip that does not exist yet) counts as not there yet', async () => {
    let calls = 0;
    const exists = async () => {
      calls++;
      if (calls < 2) throw new Error('permission-denied');
      return true;
    };
    await expect(waitForGeneratedTrip(exists, { attempts: 5, intervalMs: 1, sleep: noSleep })).resolves.toBe(true);
  });
  it('gives up after its attempts, so a real failure still shows', async () => {
    let calls = 0;
    const exists = async () => { calls++; return false; };
    await expect(waitForGeneratedTrip(exists, { attempts: 4, intervalMs: 1, sleep: noSleep })).resolves.toBe(false);
    expect(calls).toBe(4);
  });
});
