/**
 * Admin: the two things the owner touches mid-rush — the global "Pause online
 * ordering" switch and the "Current wait" minutes — plus tax rate.
 * Middleware enforces the owner session.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

/**
 * Read the same three fields PATCH writes.
 *
 * /admin renders its own state server-side into the page, so this route existed
 * write-only. That is fine for one console and wrong for two: the Equity Orbit
 * admin page manages this store over HTTP and needs to show current values
 * before it changes them. Adding a GET is not a new way in — the middleware
 * guard on /api/admin already requires the owner session, and this returns
 * strictly less than the console it sits beside (no PII, no menu, no orders).
 */
export const GET: APIRoute = async () => {
  const settings = await db.query.storeSettings.findFirst();
  if (!settings) {
    return new Response(JSON.stringify({ error: 'Store not configured' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return new Response(
    JSON.stringify({
      orderingPaused: settings.orderingPaused,
      prepTimeMinutes: settings.prepTimeMinutes,
      taxRateBps: settings.taxRateBps,
      // Context a remote console cannot infer, and cannot change from here.
      name: settings.name,
      phone: settings.phone,
      timezone: settings.timezone,
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });

  const patch: Partial<typeof schema.storeSettings.$inferInsert> = {};
  if (typeof body.orderingPaused === 'boolean') patch.orderingPaused = body.orderingPaused;
  if (Number.isInteger(body.prepTimeMinutes) && body.prepTimeMinutes >= 5 && body.prepTimeMinutes <= 120)
    patch.prepTimeMinutes = body.prepTimeMinutes;
  if (Number.isInteger(body.taxRateBps) && body.taxRateBps >= 0 && body.taxRateBps <= 2000)
    patch.taxRateBps = body.taxRateBps;
  if (Object.keys(patch).length === 0)
    return new Response(JSON.stringify({ error: 'Nothing to update' }), { status: 400 });

  await db.update(schema.storeSettings).set(patch).where(eq(schema.storeSettings.id, 1));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
