/**
 * Server-side re-pricing (plan §6.1 rule 3): the cart in the browser is a
 * suggestion; the database is the truth. Every price, availability flag, and
 * min/max rule is re-validated here at submit time.
 */
import { inArray } from 'drizzle-orm';
import { db, schema } from '@/db/client';

export interface CartLineInput {
  itemId: number;
  qty: number;
  modifierIds: number[];
  note?: string;
}

export interface PricedLine {
  itemId: number;
  nameSnapshot: string;
  qty: number;
  unitPriceCents: number;
  note: string | null;
  modifiers: { modifierId: number; nameSnapshot: string; priceDeltaCents: number }[];
}

export class PricingError extends Error {}

const MAX_NOTE_LEN = 120; // must physically fit on a kitchen ticket
const MAX_LINES = 30;
const MAX_QTY = 20;

export async function priceCart(lines: CartLineInput[]): Promise<{
  lines: PricedLine[];
  subtotalCents: number;
}> {
  if (!Array.isArray(lines) || lines.length === 0) throw new PricingError('Cart is empty');
  if (lines.length > MAX_LINES) throw new PricingError('Too many lines in the cart');

  const itemIds = [...new Set(lines.map((l) => l.itemId))];
  const items = await db.query.menuItems.findMany({ where: inArray(schema.menuItems.id, itemIds) });
  const itemById = new Map(items.map((i) => [i.id, i]));

  const links = await db.query.itemModifierGroups.findMany({
    where: inArray(schema.itemModifierGroups.itemId, itemIds),
  });
  const groupIds = [...new Set(links.map((l) => l.groupId))];
  const groups = groupIds.length
    ? await db.query.modifierGroups.findMany({ where: inArray(schema.modifierGroups.id, groupIds) })
    : [];
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const mods = groupIds.length
    ? await db.query.modifiers.findMany({ where: inArray(schema.modifiers.groupId, groupIds) })
    : [];
  const modById = new Map(mods.map((m) => [m.id, m]));

  // Merge identical lines, keep different ones separate (plan §7.2):
  // hash = item + sorted modifier ids + note.
  const merged = new Map<string, CartLineInput>();
  for (const line of lines) {
    const qty = Math.floor(Number(line.qty));
    if (!Number.isFinite(qty) || qty < 1 || qty > MAX_QTY) throw new PricingError('Invalid quantity');
    const note = (line.note ?? '').trim().slice(0, MAX_NOTE_LEN) || undefined;
    const key = `${line.itemId}|${[...line.modifierIds].sort((a, b) => a - b).join(',')}|${note ?? ''}`;
    const existing = merged.get(key);
    if (existing) existing.qty += qty;
    else merged.set(key, { itemId: line.itemId, qty, modifierIds: [...line.modifierIds], note });
  }

  const priced: PricedLine[] = [];
  let subtotal = 0;

  for (const line of merged.values()) {
    const item = itemById.get(line.itemId);
    if (!item) throw new PricingError('An item in your cart no longer exists');
    if (!item.isAvailable) throw new PricingError(`"${item.nameEn}" is sold out right now`);

    const itemGroupLinks = links.filter((l) => l.itemId === item.id);
    const chosen = line.modifierIds.map((id) => {
      const m = modById.get(id);
      if (!m) throw new PricingError('A selected option no longer exists');
      return m;
    });

    // Every chosen modifier must belong to a group attached to this item.
    const allowedGroupIds = new Set(itemGroupLinks.map((l) => l.groupId));
    for (const m of chosen) {
      if (!allowedGroupIds.has(m.groupId))
        throw new PricingError(`Invalid option for "${item.nameEn}"`);
      // A sold-out modifier disables that option, not the whole dish (§7.2).
      if (!m.isAvailable) throw new PricingError(`"${m.name}" is unavailable right now`);
    }

    // Enforce min/max per attached group — server-side, because the UI can
    // be bypassed (§7.2).
    for (const link of itemGroupLinks) {
      const group = groupById.get(link.groupId)!;
      const count = chosen.filter((m) => m.groupId === group.id).length;
      const min = group.required ? Math.max(1, group.minSelect) : group.minSelect;
      if (count < min)
        throw new PricingError(`"${item.nameEn}": please choose ${group.name.toLowerCase()}`);
      if (count > group.maxSelect)
        throw new PricingError(`"${item.nameEn}": too many selections for ${group.name}`);
    }

    // Price = base + sum(deltas), or the override if one is set (§7.2).
    const override = chosen.find((m) => m.priceOverrideCents != null);
    const base = override ? override.priceOverrideCents! : item.basePriceCents;
    const deltas = chosen
      .filter((m) => m.priceOverrideCents == null)
      .reduce((sum, m) => sum + m.priceDeltaCents, 0);
    const unitPrice = base + deltas;
    if (unitPrice < 0) throw new PricingError('Invalid price');

    subtotal += unitPrice * line.qty;
    priced.push({
      itemId: item.id,
      nameSnapshot: item.nameEn,
      qty: line.qty,
      unitPriceCents: unitPrice,
      note: line.note ?? null,
      modifiers: chosen.map((m) => ({
        modifierId: m.id,
        nameSnapshot: m.name,
        priceDeltaCents: m.priceOverrideCents != null ? 0 : m.priceDeltaCents,
      })),
    });
  }

  return { lines: priced, subtotalCents: subtotal };
}

/** Money is always integer cents; tax computed server-side from basis points. */
export function computeTaxCents(subtotalCents: number, taxRateBps: number): number {
  return Math.round((subtotalCents * taxRateBps) / 10_000);
}
