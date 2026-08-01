/**
 * Health endpoint (Addendum B3). Point a free external monitor (UptimeRobot /
 * Better Stack) at this URL every minute, alerting the owner AND the
 * developer. The in-process heartbeat cannot report the droplet's own death —
 * this is the layer that catches it.
 */
import type { APIRoute } from 'astro';
import { sql } from 'drizzle-orm';
import { db } from '@/db/client';

export const GET: APIRoute = async () => {
  try {
    await db.execute(sql`select 1`);
    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'db_unreachable' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    });
  }
};
