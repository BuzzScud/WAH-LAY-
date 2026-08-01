import type { APIRoute } from 'astro';
import { verifyLogin, createSession, destroySession } from '@/lib/auth';
import { clientIp, isRateLimited } from '@/lib/rateLimit';

export const POST: APIRoute = async ({ request, cookies, clientAddress }) => {
  const ip = clientIp(request, clientAddress);
  if (isRateLimited(`login:${ip}`, 10, 15 * 60 * 1000)) {
    return new Response(JSON.stringify({ error: 'Too many attempts — wait 15 minutes' }), { status: 429 });
  }
  // A wrong Content-Type makes formData() throw; without this the endpoint
  // answers a malformed request with an unhandled 500 instead of a 400.
  const form = await request.formData().catch(() => null);
  if (!form) return new Response(JSON.stringify({ error: 'Malformed request' }), { status: 400 });

  const user = await verifyLogin(String(form.get('username') ?? ''), String(form.get('password') ?? ''));
  if (!user) {
    return new Response(JSON.stringify({ error: 'Wrong username or password' }), { status: 401 });
  }
  await createSession(cookies, user.id);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ cookies }) => {
  await destroySession(cookies);
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
