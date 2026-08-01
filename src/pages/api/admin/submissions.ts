/**
 * Admin: the built-order log and its summary. Owner session enforced by
 * middleware, so this route only has to worry about shaping the data.
 *
 * ?days=N  — window for the summary (default 30, max 365)
 * ?format=csv — the raw log, one row per line item, for a spreadsheet.
 */
import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { summarise } from '@/lib/submissionStats';

export const prerender = false;

/**
 * Dish notes are free text a customer typed. Excel and Sheets treat a cell
 * starting with = + - @ (or a leading tab/CR) as a formula, so a note like
 * `=cmd|'/C calc'!A1` becomes a DDE payload the moment the owner opens this
 * export. Prefixing with an apostrophe forces the cell to stay text; the
 * apostrophe is not shown by the spreadsheet.
 */
const csvCell = (v: unknown) => {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const GET: APIRoute = async ({ url }) => {
  const days = Math.min(365, Math.max(1, Number(url.searchParams.get('days')) || 30));
  const since = new Date(Date.now() - days * 86_400_000);

  const rows = await db.query.orderSubmissions.findMany({
    orderBy: desc(schema.orderSubmissions.createdAt),
    limit: 5000,
  });

  if (url.searchParams.get('format') === 'csv') {
    const header = [
      'reference', 'created_at', 'dish', 'category', 'qty', 'unit_price', 'line_total',
      'modifiers', 'note', 'order_total', 'local_hour', 'local_weekday', 'store_open',
      'device', 'build_seconds', 'called', 'session',
    ];
    const lines = rows.flatMap((r) =>
      r.lines.map((l) =>
        [
          r.reference, r.createdAt.toISOString(), l.name, l.categoryName, l.qty,
          (l.unitPriceCents / 100).toFixed(2), (l.lineTotalCents / 100).toFixed(2),
          l.modifiers.map((m) => m.name).join('; '), l.note ?? '',
          (r.totalCents / 100).toFixed(2), r.localHour, r.localWeekday, r.storeOpen,
          r.device ?? '', r.buildSeconds ?? '', r.calledAt ? 'yes' : 'no', r.sessionId ?? '',
        ].map(csvCell).join(',')
      )
    );
    return new Response([header.join(','), ...lines].join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="wah-lay-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  }

  return new Response(
    JSON.stringify({
      days,
      summary: summarise(rows, since),
      recent: rows.slice(0, 50).map((r) => ({
        reference: r.reference,
        createdAt: r.createdAt.toISOString(),
        totalCents: r.totalCents,
        itemCount: r.itemCount,
        device: r.device,
        storeOpen: r.storeOpen,
        buildSeconds: r.buildSeconds,
        called: Boolean(r.calledAt),
        lines: r.lines.map((l) => ({
          name: l.name,
          qty: l.qty,
          modifiers: l.modifiers.map((m) => m.name),
          note: l.note,
        })),
      })),
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
};
