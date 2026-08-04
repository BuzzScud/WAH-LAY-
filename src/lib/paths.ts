/**
 * Mount-point helpers.
 *
 * Wah Lay runs at the root in local dev, and under a base path when it is
 * mounted inside another site (production: `/api/wahlay`, proxied by the Equity
 * Orbit Node API). Astro rewrites asset URLs for `base` on its own, but it does
 * NOT touch hand-written `href`/`fetch` strings — those escape the mount and hit
 * the host app instead, so every app-absolute path goes through `withBase`.
 *
 * `stripBase` is the other half, and it is load-bearing for security: Astro's
 * router strips `base` before matching routes, but `Astro.request.url` keeps it.
 * Middleware guards that compare `pathname` against '/admin' or '/kitchen' would
 * therefore stop matching the moment a base is configured — failing OPEN, with
 * no error and a normal-looking page. Guards must compare stripped paths.
 */
const RAW_BASE = import.meta.env.BASE_URL ?? '/';

/** '' when served at the root, '/api/wahlay' when mounted. Never a trailing slash. */
export const BASE_PATH = RAW_BASE === '/' ? '' : RAW_BASE.replace(/\/+$/, '');

/** Prefix an app-absolute path with the mount point: '/order' -> '/api/wahlay/order'. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Remove the mount point from an incoming request path: '/api/wahlay/admin' -> '/admin'. */
export function stripBase(pathname: string): string {
  if (!BASE_PATH) return pathname;
  if (pathname === BASE_PATH) return '/';
  if (pathname.startsWith(`${BASE_PATH}/`)) return pathname.slice(BASE_PATH.length) || '/';
  return pathname;
}
