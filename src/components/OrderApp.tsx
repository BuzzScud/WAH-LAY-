/**
 * Menu + order builder. Nothing is submitted anywhere: the customer builds
 * their order here, and the last screen hands them a clean list to read down
 * the phone plus the number to call. The kitchen keeps taking orders the way
 * it always has.
 *
 * That means this component owns the whole quote — line prices, Broward
 * County tax, total — and says plainly that the restaurant confirms it on the
 * call. The order lives in localStorage, so a refresh or an interrupting phone
 * call does not lose it.
 *
 * Modifier groups render as REAL fieldsets with legends and real radio /
 * checkbox inputs (§7.2) — screen-reader friendly and simply less code.
 *
 * Every dish shows a picture: the owner's photo from public/menu/ when one
 * exists, otherwise the illustration for its archetype. Both arrive on the
 * /api/menu payload so this component never touches the filesystem.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import DishMedia from './DishMedia';
import type { ArtKind } from './DishArt';
import { ArrowRightIcon, CheckIcon, ChiliIcon, CloseIcon, PhoneIcon, TrashIcon } from './Icon';
import { estimateReadyMinutes } from '@/lib/prepTime';
import { withBase } from '@/lib/paths';

interface Modifier {
  id: number;
  name: string;
  priceDeltaCents: number;
  priceOverrideCents: number | null;
  isAvailable: boolean;
}
interface Group {
  id: number;
  name: string;
  minSelect: number;
  maxSelect: number;
  required: boolean;
  modifiers: Modifier[];
}
interface Item {
  id: number;
  nameEn: string;
  nameZh: string | null;
  description: string | null;
  basePriceCents: number;
  isAvailable: boolean;
  tags: string[];
  art: ArtKind;
  photo: string | null;
  tint: string;
  groups: Group[];
}
interface Category {
  id: number;
  name: string;
  art: ArtKind;
  photo: string | null;
  items: Item[];
}
interface MenuPayload {
  store: { name: string; phone: string; address: string; prepTimeMinutes: number; taxRateBps: number } | null;
  open: { isOpen: boolean; acceptingOrders: boolean; reason: string | null };
  categories: Category[];
}
interface CartLine {
  itemId: number;
  itemName: string;
  qty: number;
  modifierIds: number[];
  modifierNames: string[];
  unitPriceCents: number;
  note?: string;
  art: ArtKind;
  photo: string | null;
  tint: string;
}

const CART_KEY = 'takeout-cart-v2';
const SESSION_KEY = 'takeout-session';
const STARTED_KEY = 'takeout-started-at';
const dollars = (c: number) => `$${(c / 100).toFixed(2)}`;

/** Anonymous id so the owner can tell a repeat builder from a new one. It
 *  identifies a browser, not a person, and is never sent with anything else. */
function sessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/** Identity of a line: same dish, same options, same note = same line. */
const lineKey = (l: CartLine) =>
  `${l.itemId}|${[...l.modifierIds].sort((a, b) => a - b).join(',')}|${l.note ?? ''}`;

function loadCart(): CartLine[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

/**
 * A saved order can be days old: prices change, dishes get pulled, the owner
 * uploads a photo. Re-derive every line from the menu we just fetched and drop
 * anything that no longer exists, so the total on screen is never a fiction.
 */
function reconcile(cart: CartLine[], menu: MenuPayload): CartLine[] {
  const items = new Map(menu.categories.flatMap((c) => c.items).map((i) => [i.id, i]));
  return cart.flatMap((line) => {
    const item = items.get(line.itemId);
    // Gone from the menu, or 86'd since this cart was saved. Keeping an 86'd
    // dish would let someone confirm an order the kitchen has to refuse.
    if (!item || !item.isAvailable) return [];

    const mods = item.groups
      .flatMap((g) => g.modifiers)
      .filter((m) => line.modifierIds.includes(m.id) && m.isAvailable);

    // If stripping unavailable options broke a required group (the entree on
    // a combination platter got 86'd), the whole line goes — a cart line the
    // kitchen can't make must not survive to confirmation.
    const chosenIds = new Set(mods.map((m) => m.id));
    const groupsSatisfied = item.groups.every((g) => {
      const count = g.modifiers.filter((m) => chosenIds.has(m.id)).length;
      const min = g.required ? Math.max(1, g.minSelect) : g.minSelect;
      return count >= min && count <= g.maxSelect;
    });
    if (!groupsSatisfied) return [];

    const override = mods.find((m) => m.priceOverrideCents != null);
    const unitPriceCents =
      (override ? override.priceOverrideCents! : item.basePriceCents) +
      mods.filter((m) => m.priceOverrideCents == null).reduce((s, m) => s + m.priceDeltaCents, 0);

    return [
      {
        ...line,
        itemName: item.nameEn,
        modifierIds: mods.map((m) => m.id),
        modifierNames: mods.map((m) => m.name),
        unitPriceCents,
        art: item.art,
        photo: item.photo,
        tint: item.tint,
      },
    ];
  });
}

export default function OrderApp() {
  const [menu, setMenu] = useState<MenuPayload | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    setCart(loadCart());
    fetch(withBase('/api/menu'))
      .then((r) => r.json())
      .then((payload: MenuPayload) => {
        setMenu(payload);
        setCart((c) => reconcile(c, payload));
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const subtotal = useMemo(() => cart.reduce((s, l) => s + l.unitPriceCents * l.qty, 0), [cart]);

  /**
   * What to quote for THIS order rather than one flat number for everyone. The
   * category comes off the live menu instead of being stored on the cart line —
   * a saved order can be days old, and a dish can be recategorised.
   */
  const readyMinutes = useMemo(() => {
    const base = menu?.store?.prepTimeMinutes ?? 15;
    if (!menu) return base;
    const categoryOf = new Map(menu.categories.flatMap((c) => c.items.map((i) => [i.id, c.name])));
    return estimateReadyMinutes(
      cart.map((l) => ({ itemName: l.itemName, categoryName: categoryOf.get(l.itemId) ?? '', qty: l.qty })),
      base
    );
  }, [menu, cart]);

  // The hero badge is server-rendered in order.astro (outside this island) so it
  // paints instantly with no layout shift. Keep its text in step with the cart.
  useEffect(() => {
    const badge = document.getElementById('prep-estimate');
    if (badge && menu?.open.acceptingOrders) badge.textContent = `Ready in about ${readyMinutes} min`;
  }, [readyMinutes, menu?.open.acceptingOrders]);

  // An empty order has nothing to review — bounce back to the menu.
  useEffect(() => {
    if (reviewing && cart.length === 0) setReviewing(false);
  }, [reviewing, cart.length]);

  // The review screen behaves like a page: entering it pushes a history
  // entry, so the phone's back button returns to the menu instead of
  // leaving the site with a built cart.
  useEffect(() => {
    if (reviewing) {
      history.pushState({ review: true }, '');
      const onPop = () => setReviewing(false);
      window.addEventListener('popstate', onPop);
      return () => window.removeEventListener('popstate', onPop);
    }
  }, [reviewing]);
  const backToMenu = () => {
    if (history.state?.review) history.back();
    else setReviewing(false);
  };

  if (loadError)
    return (
      <p className="mx-auto max-w-xl p-8 text-center text-lg" role="alert">
        We couldn't load the menu. Please call us to order.
      </p>
    );
  if (!menu) return <MenuSkeleton />;

  const setQty = (key: string, qty: number) =>
    setCart((c) =>
      qty <= 0 ? c.filter((l) => lineKey(l) !== key) : c.map((l) => (lineKey(l) === key ? { ...l, qty } : l))
    );

  if (reviewing)
    return (
      <OrderSummary
        cart={cart}
        subtotal={subtotal}
        store={menu.store}
        open={menu.open}
        readyMinutes={readyMinutes}
        onBack={backToMenu}
        onSetQty={setQty}
        onClear={() => setCart([])}
      />
    );

  const count = cart.reduce((n, l) => n + l.qty, 0);

  return (
    <div className="pb-36">
      <CategoryTabs categories={menu.categories} />

      <div className="mx-auto max-w-3xl px-4">
        {!menu.open.acceptingOrders && (
          <p
            className="mt-5 rounded-2xl border border-gold/40 bg-gold/12 px-5 py-4 font-medium text-ink"
            role="status"
          >
            {menu.open.reason ?? "We're closed right now"} — build your order anyway and call it in
            when we open.
          </p>
        )}

        {menu.categories.map((cat) => (
          <section
            key={cat.id}
            id={`order-cat-${cat.id}`}
            aria-labelledby={`cat-${cat.id}`}
            className="scroll-mt-32 pt-10"
          >
            <div className="relative overflow-hidden rounded-2xl border border-line bg-ink text-cream">
              <div className="absolute inset-y-0 right-0 w-1/2 opacity-45">
                <DishMedia kind={cat.art} photo={cat.photo} name={cat.name} className="h-full w-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-r from-ink via-ink/85 to-transparent" />
              </div>
              <h2 id={`cat-${cat.id}`} className="relative px-5 py-4 font-display text-xl font-bold sm:text-2xl">
                {cat.name}
              </h2>
            </div>

            <ul className="mt-3 space-y-2.5">
              {cat.items.map((item) => (
                <li key={item.id}>
                  <button
                    className="card-lift group flex w-full items-center gap-4 rounded-2xl border border-line bg-white p-3 text-left shadow-sm disabled:pointer-events-none disabled:opacity-55"
                    disabled={!item.isAvailable}
                    onClick={() => setActiveItem(item)}
                  >
                    <span className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-ink-2 sm:h-24 sm:w-24">
                      <DishMedia
                        kind={item.art}
                        photo={item.photo}
                        name={item.nameEn}
                        variant="thumb"
                        tint={item.tint}
                        className="art-zoom h-full w-full object-cover"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-semibold leading-snug">{item.nameEn}</span>
                        {item.nameZh && (
                          <span lang="zh" className="text-sm font-normal text-stone-400">
                            {item.nameZh}
                          </span>
                        )}
                        {item.tags.includes('spicy') && (
                          <span className="inline-flex items-center gap-1 rounded bg-brand/10 px-1.5 py-0.5 text-xs font-semibold text-brand">
                            <ChiliIcon className="h-3 w-3" />
                            Spicy
                          </span>
                        )}
                        {!item.isAvailable && (
                          <span className="rounded bg-stone-200 px-1.5 py-0.5 text-xs font-semibold text-stone-700">
                            Sold out
                          </span>
                        )}
                      </span>
                      {item.description && (
                        <span className="mt-1 block text-sm leading-snug text-stone-600">{item.description}</span>
                      )}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-2 self-stretch">
                      <span className="font-display font-bold">
                        {item.basePriceCents > 0 ? dollars(item.basePriceCents) : (
                          <span className="text-sm font-medium text-stone-500">options</span>
                        )}
                      </span>
                      <span
                        aria-hidden="true"
                        className="mt-auto grid h-9 w-9 place-items-center rounded-full bg-cream-2 text-lg font-bold text-ink transition-colors group-hover:bg-gold"
                      >
                        +
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {activeItem && (
        <ItemSheet
          item={activeItem}
          onClose={() => setActiveItem(null)}
          onAdd={(line) => {
            setCart((c) => {
              if (c.length === 0) localStorage.setItem(STARTED_KEY, String(Date.now()));
              const existing = c.find((l) => lineKey(l) === lineKey(line));
              return existing
                ? c.map((l) => (l === existing ? { ...l, qty: l.qty + line.qty } : l))
                : [...c, line];
            });
            setActiveItem(null);
          }}
        />
      )}

      {cart.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3 sm:p-4">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-2xl bg-ink px-5 py-3.5 text-cream shadow-2xl shadow-black/40 ring-1 ring-gold/25">
            <p className="text-sm">
              <span className="font-display text-lg font-bold">{dollars(subtotal)}</span>
              <span className="ml-2 text-cream/60">
                {count} {count === 1 ? 'item' : 'items'}
              </span>
            </p>
            <button
              className="min-h-11 rounded-xl bg-gradient-to-b from-gold to-gold-deep px-6 font-bold text-ink transition-transform duration-300 hover:-translate-y-0.5"
              onClick={() => setReviewing(true)}
            >
              Review &amp; call
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Sticky jump bar. Highlights whichever section is currently on screen. */
function CategoryTabs({ categories }: { categories: Category[] }) {
  const [active, setActive] = useState<number | null>(null);
  const bar = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (visible.length) setActive(Number(visible[0].target.id.replace('order-cat-', '')));
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    categories.forEach((c) => {
      const el = document.getElementById(`order-cat-${c.id}`);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [categories]);

  // Keep the active chip in view as the page scrolls past sections.
  useEffect(() => {
    if (active == null) return;
    bar.current?.querySelector(`[data-cat="${active}"]`)?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <nav
      className="sticky top-16 z-30 border-b border-line/70 bg-cream/85 backdrop-blur-lg"
      aria-label="Menu sections"
    >
      <div ref={bar} className="hide-scrollbar mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
        {categories.map((c) => (
          <a
            key={c.id}
            data-cat={c.id}
            href={`#order-cat-${c.id}`}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium transition-colors ${
              active === c.id
                ? 'border-ink bg-ink text-cream'
                : 'border-line bg-white text-stone-700 hover:border-gold hover:bg-gold/10'
            }`}
          >
            {c.name.replace(/\s*\(.*\)$/, '')}
          </a>
        ))}
      </div>
    </nav>
  );
}

function MenuSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10" aria-busy="true">
      <p className="sr-only">Loading menu…</p>
      <div className="h-12 w-2/3 animate-pulse rounded-2xl bg-cream-2" />
      <ul className="mt-6 space-y-2.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3">
            <span className="h-20 w-20 animate-pulse rounded-xl bg-cream-2" />
            <span className="flex-1 space-y-2">
              <span className="block h-4 w-1/2 animate-pulse rounded bg-cream-2" />
              <span className="block h-3 w-4/5 animate-pulse rounded bg-cream-2" />
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemSheet({ item, onClose, onAdd }: { item: Item; onClose: () => void; onAdd: (l: CartLine) => void }) {
  const [selected, setSelected] = useState<Record<number, number[]>>({}); // groupId -> modifierIds
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Modal manners (same as CallWindow): focus lands inside, Escape closes,
  // the page behind holds still, and Tab cannot wander into the menu under
  // the aria-modal sheet.
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      previous?.focus();
    };
  }, [onClose]);

  const chosen = Object.values(selected).flat();
  const chosenMods = item.groups.flatMap((g) => g.modifiers.filter((m) => chosen.includes(m.id)));
  const override = chosenMods.find((m) => m.priceOverrideCents != null);
  const unitPrice =
    (override ? override.priceOverrideCents! : item.basePriceCents) +
    chosenMods.filter((m) => m.priceOverrideCents == null).reduce((s, m) => s + m.priceDeltaCents, 0);

  const toggle = (group: Group, mod: Modifier) => {
    setError(null);
    setSelected((prev) => {
      const current = prev[group.id] ?? [];
      if (group.maxSelect === 1) {
        // An optional single-choice group must be un-checkable — otherwise a
        // tapped upcharge can never be removed without rebuilding the dish.
        if (current.includes(mod.id) && !group.required) return { ...prev, [group.id]: [] };
        return { ...prev, [group.id]: [mod.id] };
      }
      if (current.includes(mod.id)) return { ...prev, [group.id]: current.filter((id) => id !== mod.id) };
      if (current.length >= group.maxSelect) return prev;
      return { ...prev, [group.id]: [...current, mod.id] };
    });
  };

  const add = () => {
    for (const g of item.groups) {
      const count = (selected[g.id] ?? []).length;
      const min = g.required ? Math.max(1, g.minSelect) : g.minSelect;
      if (count < min) {
        setError(`Please choose ${g.name.toLowerCase()}`);
        return;
      }
    }
    onAdd({
      itemId: item.id,
      itemName: item.nameEn,
      qty,
      modifierIds: chosen,
      modifierNames: chosenMods.map((m) => m.name),
      unitPriceCents: unitPrice,
      note: note.trim() || undefined,
      art: item.art,
      photo: item.photo,
      tint: item.tint,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label={item.nameEn}
    >
      {/* Backdrop click closes; the panel stops the bubble. */}
      <button className="absolute inset-0 cursor-default" aria-hidden="true" tabIndex={-1} onClick={onClose} />
      <div
        ref={panel}
        tabIndex={-1}
        className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl"
      >
        <div className="relative aspect-[16/9] overflow-hidden bg-ink-2">
          <DishMedia
            kind={item.art}
            photo={item.photo}
            name={item.nameEn}
            tint={item.tint}
            eager
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/20 to-transparent" />
          <button
            onClick={onClose}
            className="absolute right-3 top-3 grid h-11 w-11 place-items-center rounded-full bg-ink/70 text-lg text-cream backdrop-blur transition-colors hover:bg-ink"
            aria-label="Close"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
          <div className="absolute inset-x-0 bottom-0 p-5">
            <h2 className="font-display text-2xl font-bold text-cream">
              {item.nameEn}
              {item.nameZh && (
                <span lang="zh" className="ml-2 text-lg font-normal text-cream/70">
                  {item.nameZh}
                </span>
              )}
            </h2>
          </div>
        </div>

        <div className="p-6">
          {item.description && <p className="text-stone-600">{item.description}</p>}

          {item.groups.map((g) => (
            <fieldset key={g.id} className="mt-4 rounded-2xl border border-line p-3">
              <legend className="px-1 font-semibold">
                {g.name}
                {g.required && <span className="ml-1 text-sm font-normal text-stone-500">(required)</span>}
                {g.maxSelect > 1 && (
                  <span className="ml-1 text-sm font-normal text-stone-500">(up to {g.maxSelect})</span>
                )}
              </legend>
              {g.modifiers.map((m) => (
                <label
                  key={m.id}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-2 transition-colors hover:bg-cream-2 ${
                    !m.isAvailable ? 'opacity-40' : ''
                  }`}
                >
                  <input
                    type={g.maxSelect === 1 ? 'radio' : 'checkbox'}
                    name={`group-${g.id}`}
                    className="h-5 w-5 accent-[#b31f26]"
                    disabled={!m.isAvailable}
                    checked={(selected[g.id] ?? []).includes(m.id)}
                    // A radio fires no change event when it's already checked,
                    // so deselecting an optional single-choice needs onClick.
                    onChange={g.maxSelect === 1 ? () => {} : () => toggle(g, m)}
                    onClick={g.maxSelect === 1 ? () => toggle(g, m) : undefined}
                  />
                  <span className="flex-1">
                    {m.name}
                    {!m.isAvailable && <span className="ml-2 text-sm text-brand">unavailable</span>}
                  </span>
                  <span className="text-sm text-stone-600">
                    {m.priceOverrideCents != null
                      ? dollars(m.priceOverrideCents)
                      : m.priceDeltaCents !== 0
                        ? `+${dollars(m.priceDeltaCents)}`
                        : ''}
                  </span>
                </label>
              ))}
            </fieldset>
          ))}

          <label className="mt-4 block">
            <span className="text-sm font-medium">Anything to mention on the phone?</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 120))}
              placeholder='e.g. "extra spicy" or "no onions"'
              className="mt-1 w-full rounded-xl border border-line bg-cream/40 px-3 py-3 focus:border-gold"
            />
          </label>

          {error && (
            <p className="mt-3 rounded-xl bg-brand/10 px-3 py-2 font-medium text-brand" role="alert">
              {error}
            </p>
          )}

          <div className="mt-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-1 rounded-xl border border-line p-1" role="group" aria-label="Quantity">
              <button
                className="grid h-10 w-10 place-items-center rounded-lg text-xl transition-colors hover:bg-cream-2"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-8 text-center font-semibold" aria-live="polite">
                {qty}
              </span>
              <button
                className="grid h-10 w-10 place-items-center rounded-lg text-xl transition-colors hover:bg-cream-2"
                onClick={() => setQty((q) => Math.min(20, q + 1))}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <button
              className="min-h-12 flex-1 rounded-xl bg-gradient-to-b from-brand to-brand-dark px-6 font-bold text-white transition-transform duration-300 hover:-translate-y-0.5"
              onClick={add}
            >
              Add {qty > 1 ? `${qty} ` : ''}— {dollars(unitPrice * qty)}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* The final screen: the order, priced, plus how to phone it in.             */
/* ------------------------------------------------------------------------ */

interface Submission {
  reference: string;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
  droppedLines: number;
}

function OrderSummary({
  cart,
  subtotal,
  store,
  open,
  readyMinutes,
  onBack,
  onSetQty,
  onClear,
}: {
  cart: CartLine[];
  subtotal: number;
  store: MenuPayload['store'];
  open: MenuPayload['open'];
  readyMinutes: number;
  onBack: () => void;
  onSetQty: (key: string, qty: number) => void;
  onClear: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);
  const [submitted, setSubmitted] = useState<Submission | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const phone = store?.phone ?? '';
  const telHref = `tel:${phone.replace(/[^\d+]/g, '')}`;
  const taxRateBps = store?.taxRateBps ?? 0;
  const tax = Math.round((subtotal * taxRateBps) / 10_000);
  const total = subtotal + tax;
  const count = cart.reduce((n, l) => n + l.qty, 0);

  /** Plain text of the order — readable down the phone, pasteable into a text. */
  const asText = useMemo(
    () =>
      [
        `${store?.name ?? 'Pickup'} order`,
        '',
        ...cart.flatMap((l) => [
          `${l.qty}x ${l.itemName}`,
          ...(l.modifierNames.length ? [`   - ${l.modifierNames.join(', ')}`] : []),
          ...(l.note ? [`   - ${l.note}`] : []),
        ]),
        '',
        `Estimated total: ${dollars(total)} (incl. tax)`,
      ].join('\n'),
    [cart, total, store?.name]
  );

  /**
   * Confirm: record what was built so the owner can see demand, then show the
   * call-it-in window. The server re-prices everything, so the totals that come
   * back are the ones that get displayed from here on.
   */
  const confirm = async () => {
    // State alone can't stop a double-tap: both taps land before React
    // re-renders the disabled buttons (there are two confirm buttons), and
    // each POST would mint a different reference. The ref is synchronous.
    if (inFlight.current) return;
    inFlight.current = true;
    setSubmitting(true);
    setSubmitError(null);
    const startedAt = Number(localStorage.getItem(STARTED_KEY) ?? 0);
    try {
      const res = await fetch(withBase('/api/order-submissions'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: cart.map((l) => ({
            itemId: l.itemId,
            qty: l.qty,
            modifierIds: l.modifierIds,
            note: l.note,
          })),
          buildSeconds: startedAt ? Math.round((Date.now() - startedAt) / 1000) : null,
          viewportWidth: window.innerWidth,
          referrer: document.referrer || null,
          sessionId: sessionId(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error ?? `Something went wrong. Just call us at ${phone}.`);
        return;
      }
      setSubmitted(data as Submission);
    } catch {
      setSubmitError(`We couldn't save your order — no matter, just call us at ${phone}.`);
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  /** Fire-and-forget outcome ping; must never delay opening the dialler. */
  const ping = (event: 'called' | 'copied') => {
    if (!submitted) return;
    const payload = JSON.stringify({ reference: submitted.reference, event });
    try {
      fetch(withBase('/api/order-submissions'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    } catch {
      /* analytics is never worth breaking a phone call over */
    }
  };

  /** Clipboard API first, then the legacy path, then just show them the text
   *  to select by hand. Three fallbacks because a phone browser denying
   *  clipboard access should not leave the button doing nothing. */
  const copy = async () => {
    const legacy = () => {
      const el = document.createElement('textarea');
      el.value = asText;
      el.setAttribute('readonly', '');
      el.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(el);
      el.select();
      const ok = document.execCommand?.('copy') ?? false;
      el.remove();
      return ok;
    };

    let ok = false;
    try {
      await navigator.clipboard.writeText(asText);
      ok = true;
    } catch {
      try {
        ok = legacy();
      } catch {
        ok = false;
      }
    }

    if (ok) {
      setCopied(true);
      setCopyFailed(false);
      ping('copied');
      setTimeout(() => setCopied(false), 2500);
    } else {
      setCopyFailed(true);
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-36">
      <button onClick={onBack} className="min-h-11 font-medium underline underline-offset-4">
        ← Add more items
      </button>

      <h1 className="mt-2 text-3xl font-bold sm:text-4xl">Your order</h1>
      <p className="mt-2 text-stone-600">
        {count} {count === 1 ? 'item' : 'items'} — check it over, then call it in. Nothing is sent to
        the restaurant until you do.
      </p>

      {/* ---------------------------------------------------------- lines */}
      <ul className="mt-6 space-y-2.5">
        {cart.map((l) => {
          const key = lineKey(l);
          return (
            <li key={key} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-3 shadow-sm">
              <span className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-ink-2">
                <DishMedia
                  kind={l.art}
                  photo={l.photo}
                  name={l.itemName}
                  variant="thumb"
                  tint={l.tint}
                  className="h-full w-full object-cover"
                />
              </span>

              <span className="min-w-0 flex-1">
                <span className="block font-semibold leading-snug">{l.itemName}</span>
                {l.modifierNames.length > 0 && (
                  <span className="mt-0.5 block text-sm text-stone-600">{l.modifierNames.join(', ')}</span>
                )}
                {l.note && <span className="mt-0.5 block text-sm font-medium text-stone-800">“{l.note}”</span>}
              </span>

              <span className="flex shrink-0 flex-col items-end gap-2">
                <span className="font-display font-bold">{dollars(l.unitPriceCents * l.qty)}</span>
                <span className="flex items-center gap-0.5 rounded-lg border border-line p-0.5" role="group">
                  <button
                    onClick={() => onSetQty(key, l.qty - 1)}
                    className="grid h-9 w-9 place-items-center rounded-md text-lg transition-colors hover:bg-cream-2"
                    aria-label={l.qty === 1 ? `Remove ${l.itemName}` : `One less ${l.itemName}`}
                  >
                    {l.qty === 1 ? <TrashIcon className="h-4 w-4" /> : '−'}
                  </button>
                  <span className="w-7 text-center text-sm font-semibold tabular-nums" aria-live="polite">
                    {l.qty}
                  </span>
                  <button
                    onClick={() => onSetQty(key, l.qty + 1)}
                    className="grid h-9 w-9 place-items-center rounded-md text-lg transition-colors hover:bg-cream-2"
                    aria-label={`One more ${l.itemName}`}
                  >
                    +
                  </button>
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {/* --------------------------------------------------------- totals */}
      <div className="mt-4 rounded-2xl border border-line bg-cream-2/60 p-5">
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd className="tabular-nums">{dollars(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>
              Sales tax
              <span className="ml-1 text-stone-500">
                ({(taxRateBps / 100).toFixed(taxRateBps % 100 === 0 ? 0 : 2)}% — Miramar, Broward County)
              </span>
            </dt>
            <dd className="tabular-nums">{dollars(tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2.5 font-display text-xl font-bold">
            <dt>Total</dt>
            <dd className="tabular-nums">{dollars(total)}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-stone-500">
          An estimate from the printed menu. The restaurant confirms your total on the phone, and you
          pay at the counter when you pick up.
        </p>
      </div>

      {/* ------------------------------------------------------- confirm */}
      <section className="relative mt-6 overflow-hidden rounded-[1.25rem] bg-ink p-6 text-cream grain sm:p-7">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_90%_at_15%_0%,rgba(179,31,38,0.55),transparent),radial-gradient(50%_80%_at_95%_100%,rgba(226,180,85,0.18),transparent)]" />
        <div className="relative sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">Last step</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Ready to order?</h2>
            <p className="mt-2 max-w-sm leading-relaxed text-cream/65">
              Confirm it and we&rsquo;ll give you an order number plus the four steps to call it in.
            </p>
          </div>
          <button
            onClick={confirm}
            disabled={submitting}
            className="sheen mt-6 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold to-gold-deep px-8 text-lg font-bold text-ink shadow-xl shadow-black/30 transition-transform duration-300 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-60 sm:mt-0 sm:w-auto sm:shrink-0"
          >
            {submitting ? 'Confirming…' : 'Confirm order'}
            {!submitting && <ArrowRightIcon className="h-5 w-5" />}
          </button>
        </div>

        {!open.acceptingOrders && (
          <p className="relative mt-5 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm" role="status">
            {open.reason ?? "We're closed right now"}. Confirm it anyway — your order is saved on this
            device, and the number is there when we open.
          </p>
        )}

        {submitError && (
          <p className="relative mt-5 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-sm" role="alert">
            {submitError}{' '}
            <a href={telHref} className="font-semibold text-gold underline underline-offset-4">
              Call {phone}
            </a>
          </p>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="min-h-11 font-medium underline underline-offset-4">
          ← Add more items
        </button>
        <button
          onClick={() => {
            if (window.confirm('Clear this order and start over?')) onClear();
          }}
          className="min-h-11 text-sm text-stone-500 underline underline-offset-4 hover:text-brand"
        >
          Start over
        </button>
      </div>

      {submitted && (
        <CallWindow
          submission={submitted}
          store={store}
          open={open}
          readyMinutes={readyMinutes}
          asText={asText}
          copied={copied}
          copyFailed={copyFailed}
          onCopy={copy}
          onCall={() => ping('called')}
          onClose={() => setSubmitted(null)}
          onStartOver={onClear}
        />
      )}

      {/* Always-reachable confirm button while scrolling a long order. */}
      {!submitted && (
        <div className="fixed inset-x-0 bottom-0 z-20 p-3 sm:hidden">
          <button
            onClick={confirm}
            disabled={submitting}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-gold to-gold-deep text-lg font-bold text-ink shadow-2xl shadow-black/40 disabled:opacity-60"
          >
            {submitting ? 'Confirming…' : `Confirm order — ${dollars(total)}`}
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Confirmation window: the order is on record, here is how to call it in.   */
/* ------------------------------------------------------------------------ */

function CallWindow({
  submission,
  store,
  open,
  readyMinutes,
  asText,
  copied,
  copyFailed,
  onCopy,
  onCall,
  onClose,
  onStartOver,
}: {
  submission: Submission;
  store: MenuPayload['store'];
  open: MenuPayload['open'];
  readyMinutes: number;
  asText: string;
  copied: boolean;
  copyFailed: boolean;
  onCopy: () => void;
  onCall: () => void;
  onClose: () => void;
  onStartOver: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const phone = store?.phone ?? '';
  const telHref = `tel:${phone.replace(/[^\d+]/g, '')}`;

  // Modal manners: focus lands inside, Escape closes, the page behind holds
  // still, and Tab cannot wander out into the order underneath.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus();
    };
  }, [onClose]);

  const steps = [
    <>
      Tap <span className="font-semibold text-cream">Call {phone}</span>.
    </>,
    <>
      Say <span className="font-semibold text-cream">pickup</span>, give your name, and read your
      list out — or quote order <span className="font-semibold text-cream">{submission.reference}</span>.
    </>,
    <>
      They&rsquo;ll tell you when it&rsquo;s ready — usually about{' '}
      <span className="font-semibold text-cream">{readyMinutes} minutes</span>.
    </>,
    <>Drive over and pay at the counter — cash, card, Apple Pay, Zelle or Cash App.</>,
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-ink/80 p-0 backdrop-blur-md sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="callwindow-title"
    >
      <div
        ref={panel}
        tabIndex={-1}
        /* Caps itself and scrolls internally, like the dish modal above. Without
           the cap the sheet grows past the viewport, and because the overlay is
           bottom-anchored on phones it opens showing the sheet's bottom — the
           order number scrolls off the top. svh, not vh, so the Call button
           clears the mobile browser's toolbar. */
        className="pop-in relative max-h-[92svh] w-full max-w-xl overflow-y-auto rounded-t-[1.75rem] bg-ink text-cream shadow-2xl outline-none ring-1 ring-gold/25 grain sm:rounded-[1.75rem]"
      >
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(75%_60%_at_20%_0%,rgba(179,31,38,0.6),transparent),radial-gradient(60%_60%_at_95%_100%,rgba(226,180,85,0.2),transparent)]" />

        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-white/5 text-cream transition-colors hover:bg-white/15"
          aria-label="Close"
        >
          <CloseIcon className="h-5 w-5" />
        </button>

        <div className="relative px-6 pb-8 pt-9 sm:px-9">
          {/* ------------------------------------------------ confirmation */}
          <div className="flex items-center gap-3">
            <span className="check-pop grid h-11 w-11 shrink-0 place-items-center rounded-full bg-jade/15 text-jade ring-1 ring-jade/40">
              <CheckIcon className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold">Order saved</p>
              <h2 id="callwindow-title" className="font-display text-2xl font-bold sm:text-3xl">
                Now call it in.
              </h2>
            </div>
          </div>

          {/* ---------------------------------------------------- receipt */}
          <div className="mt-7 rounded-2xl border border-white/12 bg-black/25 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.22em] text-cream/50">Your order number</p>
                <p className="mt-1 font-display text-3xl font-bold tracking-wide text-gold">
                  {submission.reference}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-[0.22em] text-cream/50">Estimated total</p>
                <p className="mt-1 font-display text-3xl font-bold tabular-nums">
                  {dollars(submission.totalCents)}
                </p>
              </div>
            </div>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-relaxed text-cream/50">
              {dollars(submission.subtotalCents)} plus {dollars(submission.taxCents)} tax. The
              restaurant confirms the total on the phone; you pay at the counter.
            </p>
            {submission.droppedLines > 0 && (
              <p className="mt-3 rounded-lg bg-gold/10 px-3 py-2 text-xs text-gold" role="status">
                {submission.droppedLines} item{submission.droppedLines === 1 ? ' was' : 's were'} taken
                off the menu since you added {submission.droppedLines === 1 ? 'it' : 'them'} — mention
                it when you call.
              </p>
            )}
          </div>

          {!open.acceptingOrders && (
            <p className="mt-4 rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-sm" role="status">
              {open.reason ?? "We're closed right now"} — call when we open and quote this number.
            </p>
          )}

          {/* ------------------------------------------------------ steps */}
          <ol className="mt-7 space-y-3.5">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3.5">
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/10 font-display text-xs font-bold text-gold"
                >
                  {i + 1}
                </span>
                <span className="pt-0.5 text-[15px] leading-relaxed text-cream/70">{step}</span>
              </li>
            ))}
          </ol>

          {/* ----------------------------------------------------- actions */}
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={telHref}
              onClick={onCall}
              className="sheen inline-flex min-h-14 flex-1 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-b from-gold to-gold-deep px-8 text-lg font-bold text-ink shadow-xl shadow-black/40 transition-transform duration-300 hover:-translate-y-0.5"
            >
              <PhoneIcon className="h-5 w-5" />
              Call {phone}
            </a>
            <button
              onClick={onCopy}
              className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl border border-white/25 bg-white/5 px-6 font-semibold text-cream transition-colors hover:border-gold/60 hover:bg-white/10"
            >
              {copied ? <CheckIcon className="h-5 w-5 text-jade" /> : null}
              {copied ? 'Copied' : 'Copy my order'}
            </button>
          </div>

          {copyFailed && (
            <div className="mt-4">
              <p className="text-sm text-cream/70">
                Your browser blocked the copy. Select this and copy it by hand:
              </p>
              <textarea
                readOnly
                rows={Math.min(12, asText.split('\n').length)}
                value={asText}
                onFocus={(e) => e.currentTarget.select()}
                aria-label="Your order as text"
                className="mt-2 w-full rounded-xl border border-white/20 bg-black/30 p-3 font-mono text-sm text-cream"
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-sm">
            <p className="text-cream/50">
              Line busy?{' '}
              <a href="tel:9549661216" className="underline underline-offset-4 hover:text-gold">
                (954) 966-1216
              </a>
            </p>
            <div className="flex gap-4">
              <button onClick={onClose} className="min-h-11 text-cream/70 underline underline-offset-4 hover:text-cream">
                Change my order
              </button>
              <button
                onClick={() => {
                  onStartOver();
                  onClose();
                }}
                className="min-h-11 text-cream/50 underline underline-offset-4 hover:text-gold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
