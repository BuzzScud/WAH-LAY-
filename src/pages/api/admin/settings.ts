/**
 * Admin: the two things the owner touches mid-rush — the global "Pause online
 * ordering" switch and the "Current wait" minutes — plus tax rate.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

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
