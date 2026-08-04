/**
 * Admin: phone blocklist for repeat no-shows (Addendum A4/B1).
 * Middleware enforces the owner session.
 */
import type { APIRoute } from 'astro';
import { desc, eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { normalizePhone } from '@/lib/rateLimit';

/**
 * List the blocked numbers. Same reason as the GET on settings.ts: /admin gets
 * this list server-rendered into the page, so a second console managing the same
 * store over HTTP had no way to show who is blocked — leaving a block/unblock UI
 * that could only ever write blind. The owner-session guard in middleware.ts
 * covers this exactly as it covers the POST and DELETE below.
 *
 * These are customer phone numbers, so: no-store, and nothing else joined in.
 */
export const GET: APIRoute = async () => {
  const rows = await db.query.blockedPhones.findMany({
    orderBy: desc(schema.blockedPhones.createdAt),
    limit: 500,
  });
  return new Response(
    JSON.stringify({
      blocked: rows.map((b) => ({
        phone: b.phone,
        reason: b.reason,
        createdAt: b.createdAt.toISOString(),
      })),
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};

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
