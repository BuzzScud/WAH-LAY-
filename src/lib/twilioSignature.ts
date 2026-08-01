/**
 * Twilio webhook authentication.
 *
 * /api/sms/inbound is a public URL that sends an SMS to the owner's phone and
 * writes a row for every request it accepts. Unauthenticated, that is a free
 * amplifier: anyone who finds the URL can bill the Twilio account and flood
 * the owner's phone. Twilio signs every real request, so verify the signature.
 *
 * The scheme (Twilio "Security" docs): take the full request URL, append each
 * POST parameter as key+value sorted by key, HMAC-SHA1 that string with the
 * account's auth token, and base64 the result. Compare against X-Twilio-Signature.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export type SignatureResult = 'valid' | 'invalid' | 'unconfigured';

/**
 * The URL Twilio signed is the public one it was configured with. Behind
 * Caddy/Cloudflare the app sees http://internal:3000, so rebuild the original
 * from the proxy headers — otherwise every genuine request fails to verify.
 */
export function publicUrl(request: Request): string {
  const url = new URL(request.url);
  const proto = request.headers.get('x-forwarded-proto');
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (proto) url.protocol = `${proto}:`;
  if (host) url.host = host;
  return url.toString();
}

export function verifyTwilioSignature(
  request: Request,
  params: FormData,
  authToken: string | undefined = process.env.TWILIO_AUTH_TOKEN
): SignatureResult {
  if (!authToken) return 'unconfigured';

  const header = request.headers.get('x-twilio-signature');
  if (!header) return 'invalid';

  // URL first, then every param as key+value, sorted by key.
  const keys = [...new Set([...params.keys()])].sort();
  let payload = publicUrl(request);
  for (const key of keys) payload += key + String(params.get(key) ?? '');

  const expected = createHmac('sha1', authToken).update(payload, 'utf8').digest('base64');

  // Constant-time compare; equal lengths are required by timingSafeEqual.
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  if (a.length !== b.length) return 'invalid';
  return timingSafeEqual(a, b) ? 'valid' : 'invalid';
}
