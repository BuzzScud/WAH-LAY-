// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';

// Server code reads process.env (works in the prod container via env_file);
// mirror .env into process.env for local dev so both paths behave the same.
Object.assign(process.env, loadEnv(process.env.NODE_ENV ?? 'development', process.cwd(), ''));

/**
 * Hosts this app is legitimately served under.
 *
 * Astro's CSRF guard compares the browser's `Origin` header against the URL it
 * reconstructs from the request. That reconstruction calls `validateHost`, which
 * returns undefined whenever `allowedDomains` is empty — the hostname then falls
 * back to the literal `localhost`, so `url.origin` can never equal a real
 * Origin and EVERY form POST 403s, including the admin login. Listing the real
 * hosts here is what makes the check function instead of just fail closed.
 *
 * Comma-separated `WAHLAY_ALLOWED_HOSTS` overrides at build time. Baked into the
 * manifest, so this must be set when `npm run build` runs — not at boot.
 */
const allowedHosts = (
  process.env.WAHLAY_ALLOWED_HOSTS ?? 'theequityorbit.com,www.theequityorbit.com'
)
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

const allowedDomains = [
  ...allowedHosts.map((hostname) => ({ hostname, protocol: 'https' })),
  // Local dev and the loopback hop from the host app's proxy.
  { hostname: 'localhost' },
  { hostname: '127.0.0.1' },
];

export default defineConfig({
  security: { allowedDomains },
  // Mounted inside Equity Orbit at /api/wahlay in production (the host's Apache
  // already proxies /api/* to its Node API, which forwards this prefix here).
  // Dev deliberately uses the SAME base so base-related bugs — above all the
  // middleware auth guards documented in src/lib/paths.ts — surface locally
  // instead of in production. Set WAHLAY_BASE_PATH=/ to serve at the root.
  base: process.env.WAHLAY_BASE_PATH ?? '/api/wahlay',
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
  server: { host: true, port: Number(process.env.PORT ?? 3000) },
});
