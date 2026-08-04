/**
 * Admin console island — one-thumb use on a phone at the register.
 * Big controls, instant saves, no nested navigation.
 */
import { useState } from 'react';
import OrderInsights from './OrderInsights';
import { withBase } from '@/lib/paths';

interface AdminItem { id: number; nameEn: string; basePriceCents: number; isAvailable: boolean }
interface Initial {
  settings: { orderingPaused: boolean; prepTimeMinutes: number; taxRateBps: number } | null;
  categories: { id: number; name: string; items: AdminItem[] }[];
  modifierGroups: { id: number; name: string; modifiers: { id: number; name: string; isAvailable: boolean }[] }[];
  blocked: { phone: string; reason: string | null }[];
}

const dollars = (c: number) => (c / 100).toFixed(2);

async function patch(url: string, body: unknown) {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) alert('Save failed — try again or call your developer.');
  return res.ok;
}

export default function AdminApp({ initial }: { initial: Initial }) {
  const [settings, setSettings] = useState(initial.settings ?? { orderingPaused: false, prepTimeMinutes: 15, taxRateBps: 800 });
  const [cats, setCats] = useState(initial.categories);
  const [groups, setGroups] = useState(initial.modifierGroups);
  const [blocked, setBlocked] = useState(initial.blocked);
  const [newBlock, setNewBlock] = useState('');

  const setItem = (id: number, patchFields: Partial<AdminItem>) =>
    setCats((cs) => cs.map((c) => ({ ...c, items: c.items.map((i) => (i.id === id ? { ...i, ...patchFields } : i)) })));

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 pb-24">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <button
          className="min-h-11 rounded-lg border border-stone-300 px-4"
          onClick={async () => {
            await fetch(withBase('/api/admin/login'), { method: 'DELETE' });
            location.href = withBase('/admin/login');
          }}
        >
          Sign out
        </button>
      </header>

      {/* The two mid-rush controls, biggest and first. Insights sit below them:
          useful daily, never in the way during a rush. */}
      <section className="rounded-xl bg-white p-4 shadow">
        <button
          className={`min-h-14 w-full rounded-xl text-lg font-black text-white ${settings.orderingPaused ? 'bg-green-600' : 'bg-red-600'}`}
          onClick={async () => {
            const next = !settings.orderingPaused;
            if (await patch('/api/admin/settings', { orderingPaused: next }))
              setSettings((s) => ({ ...s, orderingPaused: next }));
          }}
        >
          {settings.orderingPaused ? 'RESUME online ordering' : 'PAUSE online ordering'}
        </button>
        {settings.orderingPaused && (
          <p className="mt-2 text-center text-sm text-stone-600">Customers see the phone number instead of the cart.</p>
        )}
        <label className="mt-4 block">
          <span className="font-semibold">Current wait (minutes)</span>
          <div className="mt-1 flex items-center gap-2">
            {[10, 15, 20, 30, 45, 60].map((m) => (
              <button
                key={m}
                className={`min-h-11 flex-1 rounded-lg border font-bold ${settings.prepTimeMinutes === m ? 'border-brand bg-brand text-white' : 'border-stone-300 bg-white'}`}
                onClick={async () => {
                  if (await patch('/api/admin/settings', { prepTimeMinutes: m }))
                    setSettings((s) => ({ ...s, prepTimeMinutes: m }));
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </label>
      </section>

      {/* Demand data sits above the menu: the menu is ~200 rows, and anything
          below it is effectively unreachable on a tablet. */}
      <OrderInsights />

      {/* Menu: inline price edit + one-tap 86. */}
      {cats.map((cat) => (
        <section key={cat.id} className="rounded-xl bg-white p-4 shadow">
          <h2 className="text-lg font-bold">{cat.name}</h2>
          <ul className="mt-2 divide-y divide-stone-100">
            {cat.items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2">
                <span className={`flex-1 ${!item.isAvailable ? 'text-stone-400 line-through' : ''}`}>{item.nameEn}</span>
                <span className="flex items-center gap-1">
                  $
                  <input
                    className="w-20 rounded-lg border border-stone-300 px-2 py-2 text-right"
                    defaultValue={dollars(item.basePriceCents)}
                    inputMode="decimal"
                    aria-label={`Price for ${item.nameEn}`}
                    onBlur={async (e) => {
                      const cents = Math.round(parseFloat(e.target.value) * 100);
                      if (Number.isInteger(cents) && cents >= 0 && cents !== item.basePriceCents) {
                        if (await patch('/api/admin/items', { kind: 'item', id: item.id, basePriceCents: cents }))
                          setItem(item.id, { basePriceCents: cents });
                      } else {
                        e.target.value = dollars(item.basePriceCents);
                      }
                    }}
                  />
                </span>
                <button
                  className={`min-h-11 rounded-lg px-3 font-bold ${item.isAvailable ? 'bg-stone-200' : 'bg-red-600 text-white'}`}
                  onClick={async () => {
                    if (await patch('/api/admin/items', { kind: 'item', id: item.id, isAvailable: !item.isAvailable }))
                      setItem(item.id, { isAvailable: !item.isAvailable });
                  }}
                >
                  {item.isAvailable ? '86' : 'un-86'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {/* Modifier availability: out of shrimp ≠ eight entrees off the menu. */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-bold">Options</h2>
        {groups.map((g) => (
          <div key={g.id} className="mt-2">
            <h3 className="font-semibold text-stone-700">{g.name}</h3>
            <div className="mt-1 flex flex-wrap gap-2">
              {g.modifiers.map((m) => (
                <button
                  key={m.id}
                  className={`min-h-11 rounded-lg border px-3 ${m.isAvailable ? 'border-stone-300' : 'border-red-600 bg-red-50 text-red-700 line-through'}`}
                  onClick={async () => {
                    if (await patch('/api/admin/items', { kind: 'modifier', id: m.id, isAvailable: !m.isAvailable }))
                      setGroups((gs) =>
                        gs.map((gg) => ({
                          ...gg,
                          modifiers: gg.modifiers.map((mm) => (mm.id === m.id ? { ...mm, isAvailable: !mm.isAvailable } : mm)),
                        }))
                      );
                  }}
                >
                  {m.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      {/* No-show blocklist (Addendum B1). */}
      <section className="rounded-xl bg-white p-4 shadow">
        <h2 className="text-lg font-bold">Blocked phone numbers</h2>
        <ul className="mt-2 space-y-2">
          {blocked.map((b) => (
            <li key={b.phone} className="flex items-center justify-between gap-2">
              <span>
                {b.phone} {b.reason && <span className="text-sm text-stone-500">— {b.reason}</span>}
              </span>
              <button
                className="min-h-11 rounded-lg border border-stone-300 px-3"
                onClick={async () => {
                  const res = await fetch(withBase('/api/admin/block'), {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phone: b.phone }),
                  });
                  if (res.ok) setBlocked((bs) => bs.filter((x) => x.phone !== b.phone));
                }}
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex gap-2">
          <input
            value={newBlock}
            onChange={(e) => setNewBlock(e.target.value)}
            placeholder="Phone number"
            type="tel"
            className="flex-1 rounded-lg border border-stone-300 px-3 py-2"
            aria-label="Phone number to block"
          />
          <button
            className="min-h-11 rounded-lg bg-stone-800 px-4 font-semibold text-white"
            onClick={async () => {
              const res = await fetch(withBase('/api/admin/block'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone: newBlock, reason: 'no-show' }),
              });
              if (res.ok) {
                setBlocked((bs) => [...bs, { phone: newBlock, reason: 'no-show' }]);
                setNewBlock('');
              } else alert('Invalid phone number');
            }}
          >
            Block
          </button>
        </div>
      </section>
    </div>
  );
}
