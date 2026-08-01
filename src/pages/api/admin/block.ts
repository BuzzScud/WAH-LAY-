/** Admin: phone blocklist for repeat no-shows (Addendum A4/B1). */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { normalizePhone } from '@/lib/rateLimit';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ''));
  if (!phone) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 });
  await db
    .insert(schema.blockedPhones)
    .values({ phone, reason: String(body?.reason ?? '').slice(0, 200) || null })
    .onConflictDoNothing();
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const phone = normalizePhone(String(body?.phone ?? ''));
  if (!phone) return new Response(JSON.stringify({ error: 'Invalid phone' }), { status: 400 });
  await db.delete(schema.blockedPhones).where(eq(schema.blockedPhones.phone, phone));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
