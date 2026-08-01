/**
 * Escalation + heartbeat ticker (plan §7.3 layers 4 & 5). Runs inside the app
 * process every 60s:
 *
 *  - Order status 'new' with no acknowledgment 3 min after notify -> resend
 *    SMS to the owner. Still nothing at 6 min -> SMS the second number.
 *  - Kitchen screen has not polled in 10 min during open hours -> SMS the
 *    owner "Kitchen screen is offline" (at most once per 30 min).
 *
 * NOTE (Addendum B3): this ticker dies with the droplet. The external uptime
 * monitor polling /api/health is what catches THAT failure — set it up.
 */
import { and, eq, isNotNull } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { sendSms } from './notify';
import { getOpenState } from './hours';

const MIN = 60_000;

async function tick() {
  const now = new Date();

  // --- order escalation ---
  const stale = await db.query.orders.findMany({
    where: and(eq(schema.orders.status, 'new'), isNotNull(schema.orders.notifiedAt)),
  });
  for (const order of stale) {
    const age = now.getTime() - order.notifiedAt!.getTime();
    if (order.escalationLevel === 0 && age > 3 * MIN) {
      await sendSms(
        process.env.OWNER_PHONE ?? '',
        `UNACKNOWLEDGED order #${order.orderNumber} (${Math.round(age / MIN)} min). Check the kitchen screen!`,
        'escalation_1',
        order.id
      );
      await db.update(schema.orders).set({ escalationLevel: 1 }).where(eq(schema.orders.id, order.id));
    } else if (order.escalationLevel === 1 && age > 6 * MIN) {
      const second = process.env.ESCALATION_PHONE ?? process.env.OWNER_PHONE ?? '';
      await sendSms(
        second,
        `STILL unacknowledged: order #${order.orderNumber} (${Math.round(age / MIN)} min). Customer ${order.customerName} ${order.customerPhone}.`,
        'escalation_2',
        order.id
      );
      await db.update(schema.orders).set({ escalationLevel: 2 }).where(eq(schema.orders.id, order.id));
    }
  }

  // --- kitchen heartbeat ---
  const settings = await db.query.storeSettings.findFirst();
  if (!settings) return;
  const open = await getOpenState(now);
  if (open.isOpen && settings.kitchenLastSeenAt) {
    const silentFor = now.getTime() - settings.kitchenLastSeenAt.getTime();
    const lastAlert = settings.heartbeatAlertedAt?.getTime() ?? 0;
    if (silentFor > 10 * MIN && now.getTime() - lastAlert > 30 * MIN) {
      await sendSms(
        process.env.OWNER_PHONE ?? '',
        `Kitchen screen is OFFLINE (no contact for ${Math.round(silentFor / MIN)} min). Check power and Wi-Fi.`,
        'heartbeat'
      );
      await db
        .update(schema.storeSettings)
        .set({ heartbeatAlertedAt: now })
        .where(eq(schema.storeSettings.id, 1));
    }
  }
}

/** Idempotent starter — survives dev HMR without stacking intervals. */
export function startEscalationTicker() {
  const g = globalThis as unknown as { __escalationTimer?: ReturnType<typeof setInterval> };
  if (g.__escalationTimer) return;
  g.__escalationTimer = setInterval(() => {
    tick().catch((e) => console.error('[escalation] tick failed:', e));
  }, MIN);
  console.log('[escalation] ticker started (60s interval)');
}
