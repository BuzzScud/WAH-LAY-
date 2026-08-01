/**
 * Admin: inline price edit + one-tap "86 this item" toggle, and modifier
 * availability (a sold-out modifier disables the option, not the dish).
 * Middleware enforces the owner session.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (!body) return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });

  if (body.kind === 'item') {
    const id = Number(body.id);
    const patch: Partial<typeof schema.menuItems.$inferInsert> = {};
    if (typeof body.isAvailable === 'boolean') patch.isAvailable = body.isAvailable;
    if (Number.isInteger(body.basePriceCents) && body.basePriceCents >= 0)
      patch.basePriceCents = body.basePriceCents;
    if (!Number.isInteger(id) || Object.keys(patch).length === 0)
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    await db.update(schema.menuItems).set(patch).where(eq(schema.menuItems.id, id));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  if (body.kind === 'modifier') {
    const id = Number(body.id);
    if (!Number.isInteger(id) || typeof body.isAvailable !== 'boolean')
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
    await db.update(schema.modifiers).set({ isAvailable: body.isAvailable }).where(eq(schema.modifiers.id, id));
    return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400 });
};
