/**
 * Kitchen screen poll (plan §6.2: poll every 5–10s, self-healing, no realtime
 * service). Each poll also updates the heartbeat timestamp that layer 5
 * watches. Auth: middleware guards /api/kitchen/* (Addendum B2).
 */
import type { APIRoute } from 'astro';
import { desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export const GET: APIRoute = async () => {
  await db
    .update(schema.storeSettings)
    .set({ kitchenLastSeenAt: new Date() })
    .where(eq(schema.storeSettings.id, 1));

  const orders = await db.query.orders.findMany({
    where: inArray(schema.orders.status, ['new', 'acknowledged', 'ready']),
    orderBy: desc(schema.orders.createdAt),
  });
  const ids = orders.map((o) => o.id);
  const items = ids.length
    ? await db.query.orderItems.findMany({ where: inArray(schema.orderItems.orderId, ids) })
    : [];
  const itemIds = items.map((i) => i.id);
  const mods = itemIds.length
    ? await db.query.orderItemModifiers.findMany({
        where: inArray(schema.orderItemModifiers.orderItemId, itemIds),
      })
    : [];

  return new Response(
    JSON.stringify({
      orders: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customerName: o.customerName,
        customerPhone: o.customerPhone,
        status: o.status,
        pickupAt: o.pickupAt,
        createdAt: o.createdAt,
        totalCents: o.totalCents,
        notes: o.notes,
        items: items
          .filter((i) => i.orderId === o.id)
          .map((i) => ({
            qty: i.qty,
            name: i.nameSnapshot,
            note: i.notes,
            modifiers: mods.filter((m) => m.orderItemId === i.id).map((m) => m.nameSnapshot),
          })),
      })),
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};
