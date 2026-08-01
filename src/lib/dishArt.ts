/**
 * Picks the artwork archetype for a dish from its name, description and
 * category. Keyword rules, most specific first — a menu of 150 items does not
 * need 150 illustrations, it needs the right 16 used consistently.
 *
 * Adding a dish to the menu never requires touching this file: an unmatched
 * dish falls back to its category, and an unmatched category falls back to the
 * wok. Nothing renders blank.
 */
import type { ArtKind } from '@/components/DishArt';

export type { ArtKind };

const RULES: [RegExp, ArtKind][] = [
  // Order matters. "BBQ Spareribs" must beat "BBQ" → wings.
  [/spare\s?rib|sparerib|\brib\b/, 'ribs'],
  [/\bwing/, 'wings'],
  [/plantain|french fr|\bfries\b/, 'fries'],
  [/egg roll|spring roll|\broll\b/, 'rolls'],
  [/rangoon|dumpling|pot ?sticker/, 'dumpling'],
  [/soup/, 'soup'],
  [/fried rice/, 'rice'],
  [/egg foo|foo young/, 'eggfoo'],
  [/lo mein|chow mein|chow fun|mei fun|rice noodle|noodle|yat ?ka|yatka/, 'noodles'],
  [/tofu|bean curd/, 'tofu'],
  // Two looks for the battered-and-sauced family: deep red vs. golden glaze.
  [/orange|sesame|honey|mandarin|mongolian|lemon|teriyaki/, 'glazed'],
  [/general tso|sweet\s*&?\s*(and\s*)?sour|bourbon|crispy|boneless|fantail|szechuan|hunan|kung pao/, 'crispy'],
  [/shrimp|lobster sauce|prawn/, 'shrimp'],
  [/wonton/, 'dumpling'],
  [/broccoli|snow pea|chop suey|garlic sauce|moo goo|pepper steak|oyster sauce|bean sprout|mushroom/, 'broccoli'],
  [/vegetab|veg delight|mixed veg|garden/, 'veg'],
  [/party tray|half tray|super special|combination|platter|\bcombo\b|dinner box/, 'platter'],
  [/curry|szechuan|hunan|kung pao|garlic|teriyaki|beef|pork|chicken|steak|duck|spare/, 'broccoli'],
];

/** Category-level fallback, used for the section headers too. */
const CATEGORY_RULES: [RegExp, ArtKind][] = [
  [/lunch|combination|platter|party/, 'platter'],
  [/appetizer/, 'rolls'],
  [/soup/, 'soup'],
  [/fried rice/, 'rice'],
  [/chow mein|lo mein|noodle/, 'noodles'],
  [/chop suey/, 'broccoli'],
  [/egg foo/, 'eggfoo'],
  [/sweet/, 'crispy'],
  [/vegetarian|vegetable/, 'veg'],
  [/shrimp|seafood/, 'shrimp'],
  [/suggestion|special/, 'crispy'],
  [/beef|pork|chicken/, 'broccoli'],
];

const match = (haystack: string, rules: [RegExp, ArtKind][]): ArtKind | null => {
  for (const [re, kind] of rules) if (re.test(haystack)) return kind;
  return null;
};

export function artForCategory(categoryName: string): ArtKind {
  return match(categoryName.toLowerCase(), CATEGORY_RULES) ?? 'wok';
}

export function artForDish(name: string, description?: string | null, categoryName?: string): ArtKind {
  // The dish's own name wins; only then the description (which often names the
  // side — "served w. pork fried rice" — and would otherwise hijack the match).
  return (
    match(name.toLowerCase(), RULES) ??
    match((description ?? '').toLowerCase(), RULES) ??
    (categoryName ? artForCategory(categoryName) : 'wok')
  );
}

/**
 * Two dishes sharing an archetype should not look like the same photograph
 * pasted twice. A stable hash of the name nudges hue, saturation and
 * brightness a few percent — enough to read as different food, small enough
 * that the set still looks designed.
 */
export function artTint(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (Math.imul(h, 31) + name.charCodeAt(i)) >>> 0;
  const hue = (h % 19) - 9; // -9…9 degrees
  const sat = 0.9 + ((h >>> 5) % 21) / 100; // 0.90…1.10
  const bri = 0.95 + ((h >>> 10) % 13) / 100; // 0.95…1.07
  return `hue-rotate(${hue}deg) saturate(${sat.toFixed(2)}) brightness(${bri.toFixed(2)})`;
}

/**
 * Filename-safe slug for the photo drop-in system. Strips the menu code
 * prefix so `L1. BBQ Spare Ribs (3)` and `BBQ Spare Ribs` land on the same
 * photo: `bbq-spare-ribs`.
 */
export function dishSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/^[a-z]?\d+[a-z]?\.\s*/, '') // "L1. ", "C7a. "
    .replace(/\(\d+\)/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
