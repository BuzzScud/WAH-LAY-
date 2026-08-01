/**
 * Admin: what customers actually built.
 *
 * Orders are phoned in, so this is the only quantitative picture the owner
 * gets of demand — which is exactly why it loads lazily, below the mid-rush
 * controls, and never blocks the admin page from being useful.
 */
import { useEffect, useState } from 'react';
import type { Summary } from '@/lib/submissionStats';

interface RecentLine {
  name: string;
  qty: number;
  modifiers: string[];
  note: string | null;
}
interface Recent {
  reference: string;
  createdAt: string;
  totalCents: number;
  itemCount: number;
  device: string | null;
  storeOpen: boolean;
  buildSeconds: number | null;
  called: boolean;
  lines: RecentLine[];
}
interface Payload {
  days: number;
  summary: Summary;
  recent: Recent[];
}

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;

const duration = (s: number | null) =>
  s == null ? '—' : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;

const WINDOWS = [7, 30, 90, 365];

export default function OrderInsights() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState(false);
  const [openRef, setOpenRef] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(false);
    fetch(`/api/admin/submissions?days=${days}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => live && setData(d))
      .catch(() => live && setError(true));
    return () => {
      live = false;
    };
  }, [days]);

  return (
    <section className="rounded-xl bg-white p-4 shadow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Orders built online</h2>
          <p className="text-sm text-stone-600">
            Every order a customer confirmed on the website. They still phone it in.
          </p>
        </div>
        <a
          href={`/api/admin/submissions?days=${days}&format=csv`}
          className="inline-flex min-h-11 items-center rounded-lg border border-stone-300 px-4 text-sm font-semibold"
        >
          Download CSV
        </a>
      </div>

      <div className="mt-4 flex gap-2">
        {WINDOWS.map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`min-h-11 flex-1 rounded-lg border text-sm font-semibold ${
              days === d ? 'border-brand bg-brand text-white' : 'border-stone-300 bg-white'
            }`}
          >
            {d === 365 ? '1 year' : `${d} days`}
          </button>
        ))}
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-100 px-3 py-2 text-red-800" role="alert">
          Couldn't load the numbers. Reload the page.
        </p>
      )}

      {!data && !error && <p className="mt-6 text-center text-stone-500">Loading…</p>}

      {data && data.summary.window.orders === 0 && (
        <p className="mt-6 rounded-lg bg-stone-100 px-4 py-6 text-center text-stone-600">
          Nobody has built an order in this window yet.
        </p>
      )}

      {data && data.summary.window.orders > 0 && (
        <>
          {/* ------------------------------------------------------- tiles */}
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Orders built" value={String(data.summary.window.orders)} />
            <Stat label="Value built" value={money(data.summary.window.revenueCents)} />
            <Stat label="Average basket" value={money(data.summary.window.averageBasketCents)} />
            <Stat
              label="Then called"
              value={pct(data.summary.window.callRate)}
              hint="Tapped the call button"
            />
            <Stat label="Dishes" value={String(data.summary.window.items)} />
            <Stat
              label="Time to build"
              value={duration(data.summary.window.medianBuildSeconds)}
              hint="Median"
            />
          </dl>

          <p className="mt-3 text-xs text-stone-500">
            {data.summary.uniqueBuilders} device{data.summary.uniqueBuilders === 1 ? '' : 's'},{' '}
            {data.summary.repeatBuilders} came back more than once.{' '}
            {data.summary.closedWhileBuilding > 0 &&
              `${data.summary.closedWhileBuilding} built while the shop was closed.`}
          </p>

          {/* ------------------------------------------------- top dishes */}
          <h3 className="mt-7 font-bold">Most ordered</h3>
          <ol className="mt-2 space-y-1.5">
            {data.summary.topDishes.map((d, i) => {
              const max = data.summary.topDishes[0].qty || 1;
              return (
                <li key={d.name} className="text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate">
                      <span className="mr-1.5 text-stone-400 tabular-nums">{i + 1}.</span>
                      {d.name}
                    </span>
                    <span className="shrink-0 tabular-nums text-stone-600">
                      {d.qty} · {money(d.revenueCents)}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-stone-100">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${(d.qty / max) * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ol>

          {/* ----------------------------------------------------- by hour
              The whole day is drawn, quiet hours included — dropping the empty
              ones would stretch a single busy hour across the chart and read as
              "every hour is equally busy". The lunch and dinner peaks are the
              point, and you only see peaks against the flat stretches. */}
          <h3 className="mt-7 font-bold">Busiest hours</h3>
          <Bars
            data={data.summary.byHour.map((h) => ({
              label: hourLabel(h.hour),
              value: h.orders,
              // 24 labels never fit; one every three hours keeps the axis readable.
              showLabel: h.hour % 3 === 0,
            }))}
            empty="No hourly pattern yet."
          />

          <h3 className="mt-7 font-bold">Busiest days</h3>
          <Bars
            data={data.summary.byWeekday.map((d) => ({ label: d.day, value: d.orders }))}
            empty="No weekly pattern yet."
          />

          {/* ---------------------------------------------------- devices */}
          <h3 className="mt-7 font-bold">Devices</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {data.summary.byDevice.map((d) => (
              <li key={d.label} className="rounded-lg bg-stone-100 px-3 py-1.5">
                <span className="capitalize">{d.label}</span>{' '}
                <span className="font-semibold tabular-nums">{d.count}</span>
              </li>
            ))}
          </ul>

          {/* ------------------------------------------------------- log */}
          <h3 className="mt-7 font-bold">Recent orders</h3>
          <ul className="mt-2 divide-y divide-stone-200">
            {data.recent.map((r) => (
              <li key={r.reference}>
                <button
                  className="flex w-full items-center gap-3 py-3 text-left"
                  onClick={() => setOpenRef(openRef === r.reference ? null : r.reference)}
                  aria-expanded={openRef === r.reference}
                >
                  <span className="font-mono text-xs text-stone-500">{r.reference}</span>
                  <span className="flex-1 truncate text-sm">
                    {new Date(r.createdAt).toLocaleString([], {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                    <span className="ml-2 text-stone-500">
                      {r.itemCount} item{r.itemCount === 1 ? '' : 's'}
                    </span>
                  </span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs font-semibold ${
                      r.called ? 'bg-green-100 text-green-800' : 'bg-stone-100 text-stone-600'
                    }`}
                  >
                    {r.called ? 'called' : 'no call'}
                  </span>
                  <span className="w-16 text-right font-semibold tabular-nums">{money(r.totalCents)}</span>
                </button>
                {openRef === r.reference && (
                  <div className="pb-3 pl-4 text-sm text-stone-700">
                    <ul className="space-y-1">
                      {r.lines.map((l, i) => (
                        <li key={i}>
                          <span className="font-semibold tabular-nums">{l.qty}×</span> {l.name}
                          {l.modifiers.length > 0 && (
                            <span className="text-stone-500"> — {l.modifiers.join(', ')}</span>
                          )}
                          {l.note && <span className="text-stone-800"> “{l.note}”</span>}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-stone-500">
                      {r.device ?? 'unknown device'} · built in {duration(r.buildSeconds)} ·{' '}
                      {r.storeOpen ? 'shop was open' : 'shop was closed'}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg bg-stone-50 p-3">
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-0.5 text-xl font-bold tabular-nums">{value}</dd>
      {hint && <p className="text-xs text-stone-400">{hint}</p>}
    </div>
  );
}

/** 6pm reads faster than 18 on a tablet at arm's length. */
function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'a' : 'p';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

/** Deliberately plain: a bar per bucket, labelled, no library. */
type Bar = { label: string; value: number; showLabel?: boolean };

function Bars({ data, empty }: { data: Bar[]; empty: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.every((d) => d.value === 0)) return <p className="mt-2 text-sm text-stone-500">{empty}</p>;
  return (
    <div className="mt-2 flex items-end gap-1.5 overflow-x-auto pb-1">
      {data.map((d) => (
        <div key={d.label} className="flex min-w-6 flex-1 flex-col items-center gap-1">
          <span className="text-xs tabular-nums text-stone-500">{d.value || ''}</span>
          <div
            className={`w-full rounded-t ${d.value > 0 ? 'bg-brand' : 'bg-stone-200'}`}
            style={{ height: `${Math.max(4, (d.value / max) * 80)}px` }}
          />
          <span className="text-xs text-stone-500">{d.showLabel === false ? '' : d.label}</span>
        </div>
      ))}
    </div>
  );
}
