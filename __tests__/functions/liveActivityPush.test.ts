import { generateKeyPairSync, createVerify } from 'crypto';
import { apnsJwt, liveActivityPayload, LA_TOPIC } from '../../functions/src/liveActivityPush';

const H = 3_600_000;
const dep = Date.parse('2026-11-20T14:00:00Z');
const pass = {
  flightNumber: 'TP204', origin: 'LIS', destination: 'OPO', destinationCity: 'Porto', status: 'upcoming',
  departureTime: '2026-11-20T14:00:00Z', arrivalTime: '2026-11-20T15:00:00Z', gate: '14', seat: '21A', delayMinutes: 0,
};

describe('liveActivityPayload', () => {
  it('updates with the content-state the widget decodes', () => {
    const p = liveActivityPayload(pass, dep - 2 * H);
    expect(p.aps.event).toBe('update');
    expect(p.aps.timestamp).toBe(Math.floor((dep - 2 * H) / 1000));
    expect(p.aps['content-state']).toEqual({
      title: 'TP204 · LIS → OPO', subtitle: 'Gate 14 · Seat 21A', timerEndDateInMilliseconds: dep,
      imageName: 'star', dynamicIslandImageName: 'star',
    });
    expect(p.aps['dismissal-date']).toBeUndefined();
  });

  it('shows a delay and moves the timer', () => {
    const p = liveActivityPayload({ ...pass, delayMinutes: 25 }, dep - H);
    expect(p.aps['content-state'].subtitle).toBe('Delayed 25 min');
    expect(p.aps['content-state'].timerEndDateInMilliseconds).toBe(dep + 25 * 60_000);
  });

  it('ends a cancelled flight, dismissed soon after', () => {
    const now = dep - H;
    const p = liveActivityPayload({ ...pass, status: 'cancelled' }, now);
    expect(p.aps.event).toBe('end');
    expect(p.aps['content-state'].subtitle).toBe('Cancelled');
    expect(p.aps['dismissal-date']).toBe(Math.floor(now / 1000) + 15 * 60);
  });

  it('ends after arrival, or 3 h after departure without one', () => {
    expect(liveActivityPayload(pass, dep + H + 1).aps.event).toBe('end');
    expect(liveActivityPayload({ ...pass, arrivalTime: undefined }, dep + 3 * H - 1).aps.event).toBe('update');
    expect(liveActivityPayload({ ...pass, arrivalTime: undefined }, dep + 3 * H).aps.event).toBe('end');
  });

  it('falls back to the city when gate and seat are unknown', () => {
    expect(liveActivityPayload({ ...pass, gate: null, seat: undefined }, dep - H).aps['content-state'].subtitle).toBe('To Porto');
  });
});

describe('apnsJwt', () => {
  it('is an ES256 token APNs can verify (raw r||s signature)', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const jwt = apnsJwt(pem, 'KEY123', 'R47484PAGA', 1_800_000_000);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(h, 'base64url').toString())).toEqual({ alg: 'ES256', kid: 'KEY123' });
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ iss: 'R47484PAGA', iat: 1_800_000_000 });
    const sig = Buffer.from(s, 'base64url');
    expect(sig.length).toBe(64);
    const ok = createVerify('SHA256').update(`${h}.${c}`).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, sig);
    expect(ok).toBe(true);
  });

  it('targets the app bundle Live Activity topic', () => {
    expect(LA_TOPIC).toBe('com.supernovatravel.app.push-type.liveactivity');
  });
});
