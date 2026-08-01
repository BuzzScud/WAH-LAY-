/**
 * Order submission — the critical phase (plan phase 4). The server validates
 * the whole cart against the database: prices, availability, modifier rules,
 * open hours, pause flag, blocklist, rate limits, idempotency — then writes
 * the order and fans out notifications.
 */
import type { APIRoute } from 'astro';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getOpenState, quotePickupAt } from '@/lib/hours';
import { priceCart, computeTaxCents, PricingError } from '@/lib/pricing';
import { clientIp, isRateLimited, normalizePhone } from '@/lib/rateLimit';
import { notifyNewOrder } from '@/lib/notify';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const PICKUP_OFFSETS = new Set([0, 15, 30, 45]); // ASAP / +15 / +30 / +45

export const POST: APIRoute = async ({ request, clientAddress }) => {
  const settings = await db.query.storeSettings.findFirst();
  if (!settings) return json({ error: 'Store not configured' }, 500);
  const storePhone = settings.phone;
  // Deliberate error states (plan phase 5): the customer always gets the
  // phone number in the message, never a stack trace.
  const fail = (msg: string, status = 400) =>
    json({ error: `${msg}. You can always call us at ${storePhone}.`, phone: storePhone }, status);

  // --- rate limit by IP (Cloudflare-aware, Addendum B4) ---
  const ip = clientIp(request, clientAddress);
  if (isRateLimited(`ip:${ip}`, 10, 60 * 60 * 1000)) {
    return fail('Too many orders from this connection — please call us instead', 429);
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return fail('Invalid request');
  }

  // --- basic field validation (checkout collects exactly four things) ---
  const name = String(body.customerName ?? '').trim().slice(0, 80);
  const phone = normalizePhone(String(body.customerPhone ?? ''));
  const notes = String(body.notes ?? '').trim().slice(0, 250) || null;
  const pickupOffset = Number(body.pickupOffsetMinutes ?? 0);
  const idempotencyKey = String(body.idempotencyKey ?? '');
  if (!name) return fail('Please tell us your name');
  if (!phone) return fail('Please enter a valid US phone number');
  if (!PICKUP_OFFSETS.has(pickupOffset)) return fail('Invalid pickup time');
  if (!/^[0-9a-f-]{16,64}$/i.test(idempotencyKey)) return fail('Invalid request');

  // --- idempotency: a double-tap returns the same order, never two ---
  const existing = await db.query.orders.findFirst({
    where: eq(schema.orders.idempotencyKey, idempotencyKey),
  });
  if (existing) {
    return json({ orderNumber: existing.orderNumber, orderId: existing.id, duplicate: true });
  }

  // --- blocklist (no-show repeat offenders, Addendum A4/B1) ---
  const blocked = await db.query.blockedPhones.findFirst({
    where: eq(schema.blockedPhones.phone, phone),
  });
  if (blocked) return fail('We were unable to place this order online — please call us to order', 403);

  // --- max two open orders per phone (plan phase 5) ---
  const open = await db.query.orders.findMany({
    where: and(
      eq(schema.orders.customerPhone, phone),
      inArray(schema.orders.status, ['new', 'acknowledged', 'ready'])
    ),
  });
  if (open.length >= 2) return fail('You already have two open orders — please call us', 429);

  // --- store must be open and accepting (server is the truth, plan §7.1) ---
  const openState = await getOpenState();
  if (!openState.acceptingOrders) {
    return fail(openState.reason ?? 'We are not taking online orders right now');
  }

  // --- server-side re-pricing (never trust a client price) ---
  let priced;
  try {
    priced = await priceCart(body.lines);
  } catch (e) {
    if (e instanceof PricingError) return fail(e.message);
    console.error('[orders] pricing failed:', e);
    return fail('Something went wrong pricing your order', 500);
  }
  const taxCents = computeTaxCents(priced.subtotalCents, settings.taxRateBps);
  const totalCents = priced.subtotalCents + taxCents;

  // --- ASAP quoted from current prep time, not closing time (§7.1) ---
  const pickupAt = quotePickupAt(settings.prepTimeMinutes, pickupOffset);

  // --- write everything in one transaction ---
  const order = await db.transaction(async (tx) => {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.orders)
      .where(sql`created_at::date = (now() at time zone ${settings.timezone})::date`);
    const orderNumber = String(101 + count); // short, daily-ish, readable on a ticket

    const [o] = await tx
      .insert(schema.orders)
      .values({
        orderNumber,
        customerName: name,
        customerPhone: phone,
        pickupAt,
        subtotalCents: priced.subtotalCents,
        taxCents,
        totalCents,
        notes,
        idempotencyKey,
        smsOptIn: body.smsOptIn !== false, // checkout shows the opt-in language (Addendum B6)
        notifiedAt: new Date(),
      })
      .returning();

    for (const line of priced.lines) {
      const [oi] = await tx
        .insert(schema.orderItems)
        .values({
          orderId: o.id,
          menuItemId: line.itemId,
          nameSnapshot: line.nameSnapshot,
          qty: line.qty,
          unitPriceCents: line.unitPriceCents,
          notes: line.note,
        })
        .returning();
      for (const m of line.modifiers) {
        await tx.insert(schema.orderItemModifiers).values({
          orderItemId: oi.id,
          modifierId: m.modifierId,
          nameSnapshot: m.nameSnapshot,
          priceDeltaCents: m.priceDeltaCents,
        });
      }
    }
    return o;
  });

  // --- notification fan-out (layers 2+3) — never blocks the response ---
  notifyNewOrder({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: name,
    customerPhone: phone,
    totalCents,
    pickupAt,
    notes,
    items: priced.lines.map((l) => ({
      qty: l.qty,
      nameSnapshot: l.nameSnapshot,
      unitPriceCents: l.unitPriceCents,
      modifiers: l.modifiers,
      note: l.note,
    })),
  }).catch((e) => console.error('[orders] notify failed:', e));

  // Wording (layer 6): "we'll text you when the restaurant confirms" —
  // never "order confirmed" before a human taps Accept.
  return json({
    orderNumber: order.orderNumber,
    orderId: order.id,
    totalCents,
    pickupAt: pickupAt.toISOString(),
    message: "Order received! We'll text you as soon as the restaurant confirms it.",
  });
};
