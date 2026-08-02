/**
 * Order lifecycle transitions (Addendum B1). Kitchen/admin only (middleware
 * guards /api/kitchen; this endpoint checks kitchen-or-owner itself).
 *
 *   new -> acknowledged (Accept)  -> customer confirmation SMS
 *   new -> rejected     (Reject)  -> customer "please call us" SMS
 *   acknowledged -> ready         -> optional "ready" SMS (SMS_READY_ENABLED)
 *   ready -> picked_up | no_show
 *   any open -> canceled (staff, e.g. customer phoned in)
 */
import type { APIRoute } from 'astro';
import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getSessionUser, hasKitchenAccess } from '@/lib/auth';
import { notifyCustomer } from '@/lib/notify';
import { clientIp, isRateLimited } from '@/lib/rateLimit';

/**
 * Public status poll for the customer's confirmation page (Addendum C:
 * the page already polls, so "Ready" shows there before the Phase-2 SMS
 * exists). Returns the status string only — no PII.
 */
export const GET: APIRoute = async ({ params, request, clientAddress }) => {
  // The confirmation page polls every ~15s; 60/min per IP is generous for a
  // customer and stops bulk enumeration of sequential order ids.
  if (isRateLimited(`status:${clientIp(request, clientAddress)}`, 60, 60_000)) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 });
  }
  const id = Number(params.id);
  if (!Number.isInteger(id)) return new Response(JSON.stringify({ error: 'Invalid' }), { status: 400 });
  const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
  if (!order) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(
    JSON.stringify({ orderNumber: order.orderNumber, status: order.status, pickupAt: order.pickupAt }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};

type OrderStatus = typeof schema.orders.$inferSelect.status;
const TRANSITIONS: Record<string, OrderStatus[]> = {
  acknowledged: ['new'],
  rejected: ['new'],
  ready: ['acknowledged', 'new'],
  picked_up: ['ready', 'acknowledged'],
  no_show: ['ready', 'acknowledged'],
  canceled: ['new', 'acknowledged', 'ready'],
};

export const POST: APIRoute = async ({ params, request, cookies }) => {
  const owner = await getSessionUser(cookies);
  if (!hasKitchenAccess(cookies) && !owner) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const id = Number(params.id);
  const { status } = await request.json().catch(() => ({}));
  if (!Number.isInteger(id) || !(status in TRANSITIONS)) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
  }

  const now = new Date();
  const patch: Partial<typeof schema.orders.$inferInsert> = { status: status as any };
  if (status === 'acknowledged') patch.acknowledgedAt = now;
  if (status === 'ready') patch.readyAt = now;
  if (['picked_up', 'no_show', 'canceled', 'rejected'].includes(status)) patch.closedAt = now;

  // Atomic, status-guarded update: two concurrent taps (double-Accept, or
  // Accept vs Reject) must not both apply — only the one whose expected
  // current status still holds wins; the loser gets the 409.
  const [order] = await db
    .update(schema.orders)
    .set(patch)
    .where(and(eq(schema.orders.id, id), inArray(schema.orders.status, TRANSITIONS[status])))
    .returning();
  if (!order) {
    const current = await db.query.orders.findFirst({ where: eq(schema.orders.id, id) });
    if (!current) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
    return new Response(
      JSON.stringify({ error: `Cannot go from ${current.status} to ${status}` }),
      { status: 409 }
    );
  }

  const settings = await db.query.storeSettings.findFirst();
  if (settings) {
    const target = { id: order.id, orderNumber: order.orderNumber, customerPhone: order.customerPhone, pickupAt: order.pickupAt, smsOptIn: order.smsOptIn };
    if (status === 'acknowledged')
      notifyCustomer(target, 'confirm', settings.phone, settings.timezone).catch(console.error);
    if (status === 'rejected')
      notifyCustomer(target, 'reject', settings.phone, settings.timezone).catch(console.error);
    if (status === 'ready')
      notifyCustomer(target, 'ready', settings.phone, settings.timezone).catch(console.error);
  }

  return new Response(JSON.stringify({ ok: true, status }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
