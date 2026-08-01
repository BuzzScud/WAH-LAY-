/**
 * Twilio inbound-SMS webhook (Addendum B5). Customers WILL reply to the
 * confirmation text ("make it two", "running late"). Replies must never land
 * in silence: forward every inbound message to the owner's phone and log it.
 *
 * Configure in Twilio: Phone Number -> Messaging -> "A message comes in" ->
 * Webhook POST https://yourdomain.com/api/sms/inbound
 * TODO before live: validate Twilio's X-Twilio-Signature header.
 */
import type { APIRoute } from 'astro';
import { sendSms } from '@/lib/notify';
import { db, schema } from '@/db/client';

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const from = String(form?.get('From') ?? 'unknown');
  const body = String(form?.get('Body') ?? '').slice(0, 500);

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

  // Empty TwiML = no auto-reply (our outbound messages already say to call).
  return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
    headers: { 'Content-Type': 'text/xml' },
  });
};
