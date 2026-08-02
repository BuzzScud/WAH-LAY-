/**
 * Notification fan-out (plan §7.3). Every attempt is logged to
 * notification_log — a silent Twilio failure must not look like a quiet night.
 *
 * NOTIFY_MODE=console (default): log to stdout, nothing real is sent.
 * NOTIFY_MODE=live: Twilio (SMS) + Resend (email) over plain fetch — no SDKs.
 */
import { db, schema } from '@/db/client';

type Kind =
  | 'new_order'
  | 'escalation_1'
  | 'escalation_2'
  | 'customer_confirm'
  | 'customer_reject'
  | 'customer_ready'
  | 'heartbeat'
  | 'inbound_forward';

const mode = () => process.env.NOTIFY_MODE ?? 'console';

async function log(entry: {
  orderId?: number | null;
  channel: string;
  target: string;
  kind: Kind;
  status: string;
  providerResponse?: string;
}) {
  try {
    await db.insert(schema.notificationLog).values({
      orderId: entry.orderId ?? null,
      channel: entry.channel,
      target: entry.target,
      kind: entry.kind,
      status: entry.status,
      providerResponse: entry.providerResponse?.slice(0, 2000),
    });
  } catch (e) {
    console.error('[notify] failed to write notification_log:', e);
  }
}

export async function sendSms(to: string, body: string, kind: Kind, orderId?: number | null) {
  if (mode() !== 'live') {
    console.log(`[notify:console] SMS to ${to} (${kind}): ${body}`);
    await log({ orderId, channel: 'sms', target: to, kind, status: 'logged' });
    return;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) {
    await log({ orderId, channel: 'sms', target: to, kind, status: 'failed', providerResponse: 'Twilio env vars missing' });
    return;
  }
  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    const text = await res.text();
    await log({ orderId, channel: 'sms', target: to, kind, status: res.ok ? 'sent' : 'failed', providerResponse: text });
  } catch (e) {
    await log({ orderId, channel: 'sms', target: to, kind, status: 'failed', providerResponse: String(e) });
  }
}

export async function sendEmail(to: string, subject: string, html: string, kind: Kind, orderId?: number | null) {
  if (mode() !== 'live') {
    console.log(`[notify:console] EMAIL to ${to} (${kind}): ${subject}`);
    await log({ orderId, channel: 'email', target: to, kind, status: 'logged' });
    return;
  }
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;
  if (!key || !from) {
    await log({ orderId, channel: 'email', target: to, kind, status: 'failed', providerResponse: 'Resend env vars missing' });
    return;
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    const text = await res.text();
    await log({ orderId, channel: 'email', target: to, kind, status: res.ok ? 'sent' : 'failed', providerResponse: text });
  } catch (e) {
    await log({ orderId, channel: 'email', target: to, kind, status: 'failed', providerResponse: String(e) });
  }
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Customer-typed text (names, notes) goes into email HTML — escape it. */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Layers 2 + 3: owner SMS + kitchen archive email, on every new order. */
export async function notifyNewOrder(order: {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  totalCents: number;
  pickupAt: Date;
  notes: string | null;
  items: { qty: number; nameSnapshot: string; unitPriceCents: number; modifiers: { nameSnapshot: string }[]; note: string | null }[];
}) {
  const ownerPhone = process.env.OWNER_PHONE;
  const kitchenEmail = process.env.KITCHEN_EMAIL;
  const summary = order.items.map((i) => `${i.qty}x ${i.nameSnapshot}`).join(', ');

  if (ownerPhone) {
    await sendSms(
      ownerPhone,
      `New order #${order.orderNumber} — ${order.customerName}, ${dollars(order.totalCents)}: ${summary}`.slice(0, 320),
      'new_order',
      order.id
    );
  }
  if (kitchenEmail) {
    const rows = order.items
      .map(
        (i) =>
          `<tr><td>${i.qty}x</td><td><strong>${esc(i.nameSnapshot)}</strong><br>${i.modifiers
            .map((m) => esc(m.nameSnapshot))
            .join(', ')}${i.note ? `<br><strong>NOTE: ${esc(i.note)}</strong>` : ''}</td><td>${dollars(i.unitPriceCents * i.qty)}</td></tr>`
      )
      .join('');
    await sendEmail(
      kitchenEmail,
      `Order #${order.orderNumber} — ${order.customerName} — ${dollars(order.totalCents)}`,
      `<h2>Order #${order.orderNumber}</h2>
       <p>${esc(order.customerName)} — ${order.customerPhone}<br>Pickup: ${order.pickupAt.toLocaleString()}</p>
       <table>${rows}</table>
       ${order.notes ? `<p><strong>ORDER NOTE: ${esc(order.notes)}</strong></p>` : ''}
       <p>Total: <strong>${dollars(order.totalCents)}</strong> — pay at pickup</p>`,
      'new_order',
      order.id
    );
  }
}

/**
 * Customer-facing lifecycle messages (Addendum B1). Wording matters (layer 6):
 * the customer is never told "confirmed" until a human has tapped Accept.
 * Inbound-reply handling (Addendum B5): every message says to CALL, not reply.
 */
export async function notifyCustomer(
  order: { id: number; orderNumber: string; customerPhone: string; pickupAt: Date; smsOptIn: boolean },
  event: 'confirm' | 'reject' | 'ready',
  storePhone: string,
  storeTz: string
) {
  if (!order.smsOptIn) return;
  const time = order.pickupAt.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: storeTz,
  });
  const callUs = `Questions? Call ${storePhone} — texts to this number are not monitored.`;
  if (event === 'confirm') {
    await sendSms(
      order.customerPhone,
      `Order #${order.orderNumber} confirmed! Ready around ${time}. ${callUs}`,
      'customer_confirm',
      order.id
    );
  } else if (event === 'reject') {
    await sendSms(
      order.customerPhone,
      `Sorry — we couldn't take order #${order.orderNumber} right now. Nothing has been cooked or charged. Please call ${storePhone}.`,
      'customer_reject',
      order.id
    );
  } else if (event === 'ready' && process.env.SMS_READY_ENABLED === 'true') {
    await sendSms(
      order.customerPhone,
      `Order #${order.orderNumber} is ready for pickup! ${callUs}`,
      'customer_ready',
      order.id
    );
  }
}
