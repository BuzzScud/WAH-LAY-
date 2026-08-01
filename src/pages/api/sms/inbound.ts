/**
 * Twilio inbound-SMS webhook (Addendum B5). Customers WILL reply to the
 * confirmation text ("make it two", "running late"). Replies must never land
 * in silence: forward every inbound message to the owner's phone and log it.
 *
 * Configure in Twilio: Phone Number -> Messaging -> "A message comes in" ->
 * Webhook POST https://yourdomain.com/api/sms/inbound
 *
 * Every accepted request texts the owner and writes a row, so the request has
 * to be proven to come from Twilio first — otherwise the URL is a free way to
 * bill the account and flood the owner's phone.
 */
import type { APIRoute } from 'astro';
import { sendSms } from '@/lib/notify';
import { db, schema } from '@/db/client';
import { clientIp, isRateLimited } from '@/lib/rateLimit';
import { verifyTwilioSignature } from '@/lib/twilioSignature';

/** Empty TwiML: accepted, no auto-reply (our outbound texts already say to call). */
const NO_REPLY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const xml = (status = 200) =>
  new Response(NO_REPLY, { status, headers: { 'Content-Type': 'text/xml' } });

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Backstop in case a token ever leaks: a real number cannot text this fast.
  if (isRateLimited(`sms-inbound:${clientIp(request, clientAddress)}`, 20, 60_000)) {
    return new Response('Too many requests', { status: 429 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return new Response('Bad request', { status: 400 });

  const signature = verifyTwilioSignature(request, form);
  if (signature === 'invalid') {
    console.warn('[sms/inbound] rejected: bad X-Twilio-Signature');
    return new Response('Forbidden', { status: 403 });
  }
  if (signature === 'unconfigured') {
    // No auth token means nothing can be verified. Fine on a dev box that never
    // sends anything; in live mode it would leave the amplifier wide open.
    if ((process.env.NOTIFY_MODE ?? 'console') === 'live') {
      console.error('[sms/inbound] TWILIO_AUTH_TOKEN unset — refusing to forward in live mode');
      return new Response('Webhook not configured', { status: 503 });
    }
    console.warn('[sms/inbound] unverified (no TWILIO_AUTH_TOKEN) — dev mode only');
  }

  const from = String(form.get('From') ?? 'unknown');
  const body = String(form.get('Body') ?? '').slice(0, 500);

  await db.insert(schema.notificationLog).values({
    channel: 'sms',
    target: from,
    kind: 'inbound_forward',
    status: 'received',
    providerResponse: body,
  });

  const owner = process.env.OWNER_PHONE;
  if (owner) {
    await sendSms(owner, `Customer text from ${from}: "${body}" — call them back.`, 'inbound_forward');
  }

  return xml();
};
