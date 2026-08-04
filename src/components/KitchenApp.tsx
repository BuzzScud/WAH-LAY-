/**
 * Kitchen order queue (plan phase 4 + Addendum B1). Polls every 7s —
 * self-healing, no realtime service (plan §6.2). A repeating audible chime
 * does not stop until a human taps Accept: the tap is the acknowledgment
 * AND the fraud check.
 *
 * Buttons per the full lifecycle: Accept / Ready / Picked up / Reject.
 */
import { useEffect, useRef, useState } from 'react';
import { withBase } from '@/lib/paths';

interface KitchenOrder {
  id: number;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  status: 'new' | 'acknowledged' | 'ready';
  pickupAt: string;
  createdAt: string;
  totalCents: number;
  notes: string | null;
  items: { qty: number; name: string; note: string | null; modifiers: string[] }[];
}

const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;
const POLL_MS = 7000;

export default function KitchenApp() {
  const [orders, setOrders] = useState<KitchenOrder[]>([]);
  const [offline, setOffline] = useState(false);
  const [soundOn, setSoundOn] = useState(false);
  const audioCtx = useRef<AudioContext | null>(null);
  const chimeTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    try {
      const res = await fetch(withBase('/api/kitchen/orders'));
      if (!res.ok) throw new Error(String(res.status));
      setOrders((await res.json()).orders);
      setOffline(false);
    } catch {
      setOffline(true); // a dropped connection heals on the next poll
    }
  };

  useEffect(() => {
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => clearInterval(t);
  }, []);

  // Repeating chime while ANY order is unacknowledged. Browsers require a
  // user gesture before audio — hence the explicit "Enable sound" button,
  // which doubles as the daily open-up ritual.
  const hasNew = orders.some((o) => o.status === 'new');
  useEffect(() => {
    if (!soundOn) return;
    if (hasNew && !chimeTimer.current) {
      const beep = () => {
        const ctx = (audioCtx.current ??= new AudioContext());
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain).connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.value = 0.4;
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      };
      beep();
      chimeTimer.current = setInterval(beep, 3000);
    }
    if (!hasNew && chimeTimer.current) {
      clearInterval(chimeTimer.current);
      chimeTimer.current = null;
    }
    return () => {
      if (chimeTimer.current) {
        clearInterval(chimeTimer.current);
        chimeTimer.current = null;
      }
    };
  }, [hasNew, soundOn]);

  const transition = async (id: number, status: string) => {
    await fetch(`/api/orders/${id}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    poll();
  };

  return (
    <div className="p-4">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold">Kitchen — open orders ({orders.length})</h1>
        <div className="flex items-center gap-3">
          {!soundOn && (
            <button className="rounded-lg bg-amber-500 px-4 py-3 font-bold text-black" onClick={() => setSoundOn(true)}>
              Enable sound
            </button>
          )}
          {offline && (
            <p className="rounded-lg bg-red-600 px-4 py-2 font-bold" role="alert">
              OFFLINE — check Wi-Fi. Orders may be waiting.
            </p>
          )}
        </div>
      </header>

      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {orders.map((o) => (
          <article
            key={o.id}
            className={`rounded-xl p-4 ${o.status === 'new' ? 'bg-red-900 ring-4 ring-red-500' : o.status === 'acknowledged' ? 'bg-stone-800' : 'bg-green-900'}`}
            aria-label={`Order ${o.orderNumber}`}
          >
            <div className="flex items-baseline justify-between">
              <h2 className="text-3xl font-black">#{o.orderNumber}</h2>
              <p className="text-lg">{dollars(o.totalCents)} — pay at pickup</p>
            </div>
            <p className="mt-1 text-lg">
              {o.customerName} · {o.customerPhone}
            </p>
            <p className="text-stone-300">
              Pickup {new Date(o.pickupAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </p>
            <ul className="mt-3 space-y-2 border-t border-white/20 pt-3">
              {o.items.map((it, i) => (
                <li key={i} className="text-lg">
                  <span className="font-bold">{it.qty}× {it.name}</span>
                  {it.modifiers.length > 0 && <span className="block text-stone-300">{it.modifiers.join(', ')}</span>}
                  {/* Special instructions are never silently dropped — bold on the ticket (§7.2). */}
                  {it.note && <span className="block font-black text-amber-300">{it.note}</span>}
                </li>
              ))}
            </ul>
            {o.notes && <p className="mt-2 font-black text-amber-300">ORDER NOTE: {o.notes}</p>}

            <div className="mt-4 flex flex-wrap gap-2">
              {o.status === 'new' && (
                <>
                  <button className="min-h-14 flex-1 rounded-xl bg-green-500 px-6 text-xl font-black text-black" onClick={() => transition(o.id, 'acknowledged')}>
                    ACCEPT
                  </button>
                  <button className="min-h-14 rounded-xl bg-red-500 px-4 font-bold text-black" onClick={() => transition(o.id, 'rejected')}>
                    Reject
                  </button>
                </>
              )}
              {o.status === 'acknowledged' && (
                <button className="min-h-14 flex-1 rounded-xl bg-amber-400 px-6 text-xl font-black text-black" onClick={() => transition(o.id, 'ready')}>
                  READY
                </button>
              )}
              {o.status === 'ready' && (
                <>
                  <button className="min-h-14 flex-1 rounded-xl bg-blue-400 px-6 text-xl font-black text-black" onClick={() => transition(o.id, 'picked_up')}>
                    PICKED UP
                  </button>
                  <button className="min-h-14 rounded-xl bg-stone-500 px-4 font-bold text-black" onClick={() => transition(o.id, 'no_show')}>
                    No-show
                  </button>
                </>
              )}
            </div>
          </article>
        ))}
        {orders.length === 0 && <p className="text-xl text-stone-400">No open orders. This screen updates by itself.</p>}
      </div>
    </div>
  );
}
