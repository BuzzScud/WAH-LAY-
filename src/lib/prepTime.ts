/**
 * How long this particular order will take, instead of one flat number for
 * everyone. Two soups and a Peking-style duck are not the same 15 minutes.
 *
 * There is deliberately no `prep_minutes` column on menu_items: that would mean
 * the owner keying in 159 numbers before any of this does anything. A dish's
 * cook time is derived from its category, with name overrides for the handful
 * that break their category's pattern — a whole duck is not a stir-fry, and a
 * tray of fried rice is not a side of it.
 *
 * Everything here is pure and deterministic. The same cart always quotes the
 * same number: a quote that reshuffles itself while the customer is reading it
 * looks broken, and this number gets read aloud on the phone.
 */

export interface PrepLine {
  itemName: string;
  categoryName: string;
  qty: number;
}

/** Minutes of kitchen time for one portion, by category. */
const BY_CATEGORY: [test: RegExp, minutes: number][] = [
  [/party tray|super special/i, 20], // half-trays; a different job entirely
  [/suggestions/i, 9], // chef dishes, cooked to order
  [/combination platter/i, 8], // entree + rice + egg roll to plate
  [/egg foo young/i, 7], // pan-fried patties, not a wok toss
  [/appetizer/i, 7], // fryer
  [/lunch special/i, 6],
  [/chow mein|lo mein|chop suey/i, 6],
  [/beef|pork|shrimp|chicken|sweet & sour|vegetarian/i, 6],
  [/fried rice/i, 5],
  [/soup/i, 2], // ladled from a pot that is already hot
];

/**
 * Categories that outrank a dish's own name. A lunch plate of wings is
 * portioned and timed for the lunch rush; it is not the appetizer basket of
 * wings, even though both are called wings.
 */
const CATEGORY_WINS = /lunch special/i;

/** Dishes whose own name overrides whatever their category implies. */
const BY_NAME: [test: RegExp, minutes: number][] = [
  [/duck/i, 14],
  [/seafood delight|happy family/i, 12],
  [/triple delight/i, 11],
  // "BBQ Spareribs" and "BBQ Spare Ribs (3)" are the same trip to the oven.
  [/bbq spare\s?ribs|boneless ribs/i, 11],
  [/wings/i, 10],
  [/fantail shrimp/i, 9],
  [/house special soup/i, 5], // built to order, unlike the other soups
  [/egg roll|spring roll|krab rangoon|fried wonton|french fries|sugar donuts|plantains/i, 5],
  [/soda|coke|sprite|can |bottled/i, 0], // handed over, not cooked
];

const DEFAULT_MINUTES = 6;

/** Kitchen minutes for a single portion of one dish. */
export function dishCookMinutes(itemName: string, categoryName: string): number {
  const nameFirst = !CATEGORY_WINS.test(categoryName);
  if (nameFirst) for (const [test, minutes] of BY_NAME) if (test.test(itemName)) return minutes;
  for (const [test, minutes] of BY_CATEGORY) if (test.test(categoryName)) return minutes;
  return DEFAULT_MINUTES;
}

/**
 * A second portion of the same dish is close to free — it goes in the same wok.
 * Additional ones cost about a third each rather than doubling the pass.
 */
function lineMinutes(line: PrepLine): number {
  const one = dishCookMinutes(line.itemName, line.categoryName);
  return one * (1 + 0.35 * Math.max(0, line.qty - 1));
}

/**
 * A single entree is what the owner's "current wait" setting already assumes,
 * so an order of exactly that size quotes the setting unchanged. Anything
 * bigger or slower is what pushes the number up.
 */
const TYPICAL_ORDER_MINUTES = 7;

/** How far above the base setting the busiest order is allowed to quote. */
const MAX_MINUTES_OVER_BASE = 15;

/**
 * Stable pseudo-variation in [-2, +2], derived from the order itself. Two
 * different orders of similar size shouldn't both quote a suspiciously round
 * number, but re-rendering the same cart must never change the answer — hence
 * a hash of the contents rather than Math.random().
 */
function jitter(lines: PrepLine[]): number {
  let h = 2166136261;
  for (const l of lines) {
    const key = `${l.itemName}:${l.qty}`;
    for (let i = 0; i < key.length; i++) {
      h ^= key.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return ((h >>> 0) % 5) - 2;
}

/**
 * Minutes to quote for this order.
 *
 * `basePrepMinutes` is the owner's live "current wait" from the admin — the
 * kitchen's backlog. It is the floor: the quote never dips below what the owner
 * says the wait already is, and never runs more than 15 minutes past it. At the
 * default base of 15 that puts every quote in the 15–30 range.
 */
export function estimateReadyMinutes(lines: PrepLine[], basePrepMinutes: number): number {
  const base = Math.max(1, Math.round(basePrepMinutes));
  if (lines.length === 0) return base;

  const each = lines.map(lineMinutes);
  // Several woks run at once, so the order is not the sum of its dishes: the
  // slowest one sets the floor and the rest overlap behind it.
  const slowest = Math.max(...each);
  const rest = each.reduce((sum, m) => sum + m, 0) - slowest;
  const cook = slowest + rest * 0.4;

  const raw = base + (cook - TYPICAL_ORDER_MINUTES) + jitter(lines);
  return Math.min(base + MAX_MINUTES_OVER_BASE, Math.max(base, Math.round(raw)));
}
