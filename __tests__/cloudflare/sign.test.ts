import { signBody } from '../../cloudflare/email-inbound/src/sign';
import { sign } from '../../functions/src/emailImport';

it('the Worker signs exactly as inboundEmail verifies', async () => {
  const body = JSON.stringify({ to: 'k7x2m9qpz4@supernovatravel.xyz', from: 'a@b.c', raw: 'aGk=' });
  expect(await signBody(body, 's3cret')).toBe(sign(Buffer.from(body), 's3cret'));
});
