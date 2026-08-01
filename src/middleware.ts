import { defineMiddleware } from 'astro:middleware';
import { getSessionUser, hasKitchenAccess, enrollKitchenDevice } from '@/lib/auth';
import { startEscalationTicker } from '@/lib/escalation';

startEscalationTicker();

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname, searchParams } = new URL(context.request.url);

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
      return context.redirect('/admin/login');
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

  return next();
});
