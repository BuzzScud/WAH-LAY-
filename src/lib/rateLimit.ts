/**
 * Rate limiting (plan phase 5). In-memory sliding window — one process, one
 * droplet, so this is exactly enough. If you ever run more than one app
 * container, move this to Postgres.
 *
 * Addendum B4: when Cloudflare's proxy is on, the socket address is a
 * Cloudflare IP shared by everyone. Trust CF-Connecting-IP first, else the
 * proxy chain's X-Forwarded-For, else the socket.
 */

export function clientIp(request: Request, socketAddr?: string): string {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return socketAddr ?? 'unknown';
}

const buckets = new Map<string, number[]>();

/** True if `key` has exceeded `max` hits in the trailing `windowMs`. */
export function isRateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map cannot grow unbounded.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
  }
  return false;
}

/** Normalize US phone input to +1XXXXXXXXXX; returns null if not plausible. */
export function normalizePhone(raw: string): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
