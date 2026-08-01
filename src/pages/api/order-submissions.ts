/**
 * Records an order the customer built, then hands back a reference code.
 *
 * This does NOT send anything to the kitchen — ordering happens on the phone.
 * The row exists so the owner can see real demand in the admin: what sells,
 * at what hour, on what device, and how many built orders turn into calls.
 *
 * Two rules make the data worth analysing:
 *   1. Prices are re-derived from the live menu here. A client that posts
 *      "$0.01 total" gets the real total stored.
 *   2. No personal information is accepted or recorded — not even an IP.
 */
import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getOpenState, storeNow } from '@/lib/hours';
import { clientIp, isRateLimited } from '@/lib/rateLimit';

export const prerender = false;

const MAX_LINES = 60;
const MAX_QTY = 40;

/** Unambiguous alphabet: no O/0, I/1, so it survives being read aloud. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function reference(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  const code = Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
  return `WL-${code.slice(0, 3)}${code.slice(3)}`;
}

function deviceFrom(width: unknown, ua: string): string {
  const w = typeof width === 'number' && width > 0 ? width : null;
  if (w) return w < 640 ? 'mobile' : w < 1024 ? 'tablet' : 'desktop';
  if (/iPad|Tablet/i.test(ua)) return 'tablet';
  return /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
}

type ModifierRow = typeof schema.modifiers.$inferSelect;

const clamp = (n: unknown, lo: number, hi: number): number | null =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : null;

export const POST: APIRoute = async ({ request, clientAddress }) => {
  // Loose limit — this is a write with no side effects, but a runaway script
  // should not be able to fill the table.
  if (isRateLimited(`submit:${clientIp(request, clientAddress)}`, 30, 60_000)) {
    return json({ error: 'Too many requests. Please wait a moment.' }, 429);
  }

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.lines) || body.lines.length === 0) {
    return json({ error: 'Nothing to record.' }, 400);
  }
  if (body.lines.length > MAX_LINES) {
    return json({ error: 'That order is too large to record. Please call us.' }, 400);
  }

  const [settings, categories, items, mods, open] = await Promise.all([
    db.query.storeSettings.findFirst(),
    db.query.categories.findMany(),
    db.query.menuItems.findMany(),
    db.query.modifiers.findMany(),
    getOpenState(),
  ]);
  if (!settings) return json({ error: 'Store not configured.' }, 503);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const modById = new Map(mods.map((m) => [m.id, m]));
  const categoryById = new Map(categories.map((c) => [c.id, c]));

  // --- Re-price every line from the menu, ignoring whatever the client sent.
  const lines: schema.SubmissionLine[] = [];
  for (const raw of body.lines) {
    const item = itemById.get(raw?.itemId);
    if (!item) continue; // dish was pulled since they built it — drop it

    const qty = clamp(raw.qty, 1, MAX_QTY) ?? 1;
    const chosen: ModifierRow[] = (Array.isArray(raw.modifierIds) ? raw.modifierIds : [])
      .map((id: unknown) => modById.get(id as number))
      .filter((m: ModifierRow | undefined): m is ModifierRow => Boolean(m));

    const override = chosen.find((m) => m.priceOverrideCents != null);
    const unitPriceCents =
      (override ? override.priceOverrideCents! : item.basePriceCents) +
      chosen.filter((m) => m.priceOverrideCents == null).reduce((s, m) => s + m.priceDeltaCents, 0);

    lines.push({
      itemId: item.id,
      name: item.nameEn,
      categoryName: categoryById.get(item.categoryId)?.name ?? '',
      qty,
      unitPriceCents,
      lineTotalCents: unitPriceCents * qty,
      modifiers: chosen.map((m) => ({ id: m.id, name: m.name, priceDeltaCents: m.priceDeltaCents })),
      note: typeof raw.note === 'string' ? raw.note.slice(0, 120) : null,
    });
  }

  if (lines.length === 0) {
    return json({ error: 'None of those dishes are on the menu any more. Please rebuild your order.' }, 409);
  }

  const subtotalCents = lines.reduce((s, l) => s + l.lineTotalCents, 0);
  const taxCents = Math.round((subtotalCents * settings.taxRateBps) / 10_000);
  const now = storeNow(settings.timezone);
  const userAgent = (request.headers.get('user-agent') ?? '').slice(0, 300);

  const [row] = await db
    .insert(schema.orderSubmissions)
    .values({
      reference: reference(),
      subtotalCents,
      taxCents,
      totalCents: subtotalCents + taxCents,
      taxRateBps: settings.taxRateBps,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      lineCount: lines.length,
      lines,
      localHour: Math.floor(now.minutes / 60),
      localWeekday: now.weekday,
      storeOpen: open.isOpen,
      closedReason: open.isOpen ? null : open.reason,
      buildSeconds: clamp(body.buildSeconds, 0, 86_400),
      viewportWidth: clamp(body.viewportWidth, 0, 10_000),
      device: deviceFrom(body.viewportWidth, userAgent),
      userAgent,
      referrer: typeof body.referrer === 'string' ? body.referrer.slice(0, 300) : null,
      sessionId: typeof body.sessionId === 'string' ? body.sessionId.slice(0, 64) : null,
    })
    .returning({ reference: schema.orderSubmissions.reference });

  return json({
    reference: row.reference,
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents,
    droppedLines: body.lines.length - lines.length,
  });
};

/**
 * Outcome ping: did building the order turn into a phone call? Sent with
 * sendBeacon as the customer leaves for the dialler, so it must stay cheap and
 * must never block. Unknown references are ignored silently.
 */
export const PATCH: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const ref = typeof body?.reference === 'string' ? body.reference : null;
  const event = body?.event === 'called' ? 'called' : body?.event === 'copied' ? 'copied' : null;
  if (!ref || !event) return new Response(null, { status: 204 });

  await db
    .update(schema.orderSubmissions)
    .set(event === 'called' ? { calledAt: new Date() } : { copiedAt: new Date() })
    .where(eq(schema.orderSubmissions.reference, ref));

  return new Response(null, { status: 204 });
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
