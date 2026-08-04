import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, hasKitchenAccess, enrollKitchenDevice } from '@/lib/auth';
import { startEscalationTicker } from '@/lib/escalation';
import { stripBase, withBase } from '@/lib/paths';

startEscalationTicker();

/**
 * Routes that may be framed by the site we are mounted inside. Everything else —
 * /admin and /kitchen above all, which render customer names and phone numbers —
 * stays unframeable. Scope this list narrowly; it is the clickjacking boundary.
 */
const FRAMEABLE_PATHS = new Set(['/', '/order', '/privacy']);

export const onRequest = defineMiddleware(async (context, next) => {
  const url = new URL(context.request.url);
  const { searchParams } = url;
  // MUST be the stripped path. `request.url` still carries the base that Astro's
  // router already removed, so comparing the raw pathname against '/admin' would
  // silently never match and leave every protected surface open. See lib/paths.ts.
  const pathname = stripBase(url.pathname);

  // --- Admin: owner session required (login page + login API excepted) ---
  const isAdminSurface =
    (pathname.startsWith('/admin') || pathname.startsWith('/api/admin')) &&
    pathname !== '/admin/login' &&
    pathname !== '/api/admin/login';
  if (isAdminSurface) {
    const user = await getSessionUser(context.cookies);
    if (!user) {
      if (pathname.startsWith('/api/'))
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      return context.redirect(withBase('/admin/login'));
    }
    context.locals.user = { id: user.id, username: user.username };
  }

  // --- Kitchen (Addendum B2): shows customer PII, never public. ---
  // The tablet enrolls once via /kitchen?token=<KITCHEN_TOKEN>.
  if (pathname === '/kitchen' || pathname.startsWith('/api/kitchen')) {
    const presented = searchParams.get('token');
    if (presented && pathname === '/kitchen') enrollKitchenDevice(context.cookies, presented);
    const owner = await getSessionUser(context.cookies);
    if (!hasKitchenAccess(context.cookies) && !owner) {
      if (pathname.startsWith('/api/'))
        return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
      return new Response('Not found', { status: 404 }); // do not advertise the surface
    }
  }

  const response = await next();

  // --- Baseline security headers ---
  // Set here rather than only in the Caddyfile so they hold in dev, in `astro
  // preview`, and if the app is ever put behind a different proxy.
  const headers = response.headers;
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Only the public storefront may be framed by the host site. /admin and /kitchen
  // keep DENY — they show customer PII, which is what framing protection is for.
  const frameable = FRAMEABLE_PATHS.has(pathname);
  headers.set('X-Frame-Options', frameable ? 'SAMEORIGIN' : 'DENY');
  headers.set('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

  // frame-ancestors is the modern half of X-Frame-Options. No 'unsafe-eval';
  // 'unsafe-inline' is still required by Astro's inline hydration scripts and
  // the JSON-LD block. img-src allows data: for the inline dish illustrations.
  if (!pathname.startsWith('/api/')) {
    headers.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "form-action 'self'",
        "base-uri 'self'",
        `frame-ancestors ${frameable ? "'self'" : "'none'"}`,
        "object-src 'none'",
      ].join('; ')
    );
  }

  return response;
});
