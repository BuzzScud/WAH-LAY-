/**
 * Turns raw order_submissions rows into the numbers the owner actually wants:
 * what sells, when, on what, and how many built orders became phone calls.
 *
 * Kept out of the API route so it can be unit-tested and reused by any future
 * export or report without going through HTTP.
 */
import type { schema } from '@/db/client';

type Row = typeof schema.orderSubmissions.$inferSelect;

const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface Totals {
  orders: number;
  items: number;
  revenueCents: number;
  averageBasketCents: number;
  /** Share of built orders where the customer then tapped Call, 0–1. */
  callRate: number;
  /** Median seconds spent building — mean is useless here, one abandoned tab skews it. */
  medianBuildSeconds: number | null;
}

function totals(rows: Row[]): Totals {
  if (rows.length === 0)
    return { orders: 0, items: 0, revenueCents: 0, averageBasketCents: 0, callRate: 0, medianBuildSeconds: null };

  const revenueCents = rows.reduce((s, r) => s + r.totalCents, 0);
  const builds = rows
    .map((r) => r.buildSeconds)
    .filter((n): n is number => typeof n === 'number')
    .sort((a, b) => a - b);

  return {
    orders: rows.length,
    items: rows.reduce((s, r) => s + r.itemCount, 0),
    revenueCents,
    averageBasketCents: Math.round(revenueCents / rows.length),
    callRate: rows.filter((r) => r.calledAt).length / rows.length,
    medianBuildSeconds: builds.length ? builds[Math.floor(builds.length / 2)] : null,
  };
}

export interface DishStat {
  name: string;
  categoryName: string;
  qty: number;
  revenueCents: number;
  orders: number;
}

/** Most-built dishes, by quantity. */
function topDishes(rows: Row[], limit = 15): DishStat[] {
  const byName = new Map<string, DishStat>();
  for (const row of rows) {
    for (const line of row.lines) {
      const stat = byName.get(line.name) ?? {
        name: line.name,
        categoryName: line.categoryName,
        qty: 0,
        revenueCents: 0,
        orders: 0,
      };
      stat.qty += line.qty;
      stat.revenueCents += line.lineTotalCents;
      stat.orders += 1;
      byName.set(line.name, stat);
    }
  }
  return [...byName.values()].sort((a, b) => b.qty - a.qty).slice(0, limit);
}

/** Orders per local hour, 0–23 — every hour present so the bar chart has no gaps. */
function byHour(rows: Row[]): { hour: number; orders: number; revenueCents: number }[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, revenueCents: 0 }));
  for (const r of rows) {
    const b = buckets[r.localHour];
    if (!b) continue;
    b.orders += 1;
    b.revenueCents += r.totalCents;
  }
  return buckets;
}

function byWeekday(rows: Row[]): { day: string; orders: number; revenueCents: number }[] {
  const buckets = DAY_SHORT.map((day) => ({ day, orders: 0, revenueCents: 0 }));
  for (const r of rows) {
    const b = buckets[r.localWeekday];
    if (!b) continue;
    b.orders += 1;
    b.revenueCents += r.totalCents;
  }
  // Monday-first, to match the rest of the site.
  return [...buckets.slice(1), buckets[0]];
}

function countBy<K extends string>(rows: Row[], key: (r: Row) => K | null): { label: K; count: number }[] {
  const map = new Map<K, number>();
  for (const r of rows) {
    const k = key(r);
    if (k) map.set(k, (map.get(k) ?? 0) + 1);
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function summarise(rows: Row[], since: Date) {
  const recent = rows.filter((r) => r.createdAt >= since);
  return {
    allTime: totals(rows),
    window: totals(recent),
    closedWhileBuilding: recent.filter((r) => !r.storeOpen).length,
    topDishes: topDishes(recent),
    byHour: byHour(recent),
    byWeekday: byWeekday(recent),
    byDevice: countBy(recent, (r) => (r.device as 'mobile' | 'tablet' | 'desktop' | null) ?? null),
    /** Distinct browsers, and how many came back to build more than once. */
    uniqueBuilders: new Set(recent.map((r) => r.sessionId).filter(Boolean)).size,
    repeatBuilders: [...countBy(recent, (r) => (r.sessionId as string) ?? null)].filter((s) => s.count > 1).length,
  };
}

export type Summary = ReturnType<typeof summarise>;
