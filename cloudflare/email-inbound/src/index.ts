import { signBody } from './sign';

interface Env { INBOUND_SECRET: string; INBOUND_URL: string }
const MAX_BYTES = 10 * 1024 * 1024;

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export default {
  /** Every email to @supernovatravel.xyz (Email Routing catch-all). Never bounces. */
  async email(message: ForwardableEmailMessage, env: Env): Promise<void> {
    if (message.rawSize > MAX_BYTES) return;
    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const body = JSON.stringify({ to: message.to, from: message.from, raw: toBase64(raw) });
    await fetch(env.INBOUND_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Supernova-Signature': await signBody(body, env.INBOUND_SECRET) },
      body,
    });
  },
};
