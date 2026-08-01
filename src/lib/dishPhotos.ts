/**
 * Real-photo drop-in. Put `general-tso-s-chicken.jpg` in `public/menu/` and it
 * replaces that dish's illustration everywhere — home page, order page, item
 * sheet — with no code change and no database edit.
 *
 * Server-only (reads the filesystem). The order island gets its photo URLs
 * through /api/menu instead.
 */
import fs from 'node:fs';
import path from 'node:path';
import { dishSlug } from './dishArt';

const EXTENSIONS = ['webp', 'jpg', 'jpeg', 'png', 'avif'];

/** Where `public/` ends up: source tree in dev, `client/` beside the server
 *  bundle in the built container. Probe both rather than guessing. */
const ROOTS = [
  path.join(process.cwd(), 'public'),
  path.join(process.cwd(), 'dist', 'client'),
  path.join(process.cwd(), 'client'),
];

interface Index {
  files: Set<string>;
  at: number;
}
let cache: Index | null = null;
const TTL = import.meta.env.DEV ? 2_000 : 5 * 60_000;

function index(): Set<string> {
  if (cache && Date.now() - cache.at < TTL) return cache.files;
  const files = new Set<string>();
  for (const root of ROOTS) {
    for (const sub of ['menu', path.join('menu', 'categories')]) {
      const dir = path.join(root, sub);
      try {
        for (const f of fs.readdirSync(dir)) {
          files.add(`${sub.split(path.sep).join('/')}/${f}`.toLowerCase());
        }
      } catch {
        /* directory absent — that is the normal state before photos exist */
      }
    }
  }
  cache = { files, at: Date.now() };
  return files;
}

function lookup(dir: string, slug: string): string | null {
  if (!slug) return null;
  const files = index();
  for (const ext of EXTENSIONS) {
    const rel = `${dir}/${slug}.${ext}`;
    if (files.has(rel)) return `/${rel}`;
  }
  return null;
}

/** `/menu/orange-chicken.jpg` if the owner has uploaded one, else null. */
export function dishPhoto(name: string): string | null {
  return lookup('menu', dishSlug(name));
}

/** `/menu/categories/appetizers.jpg` if uploaded, else null. */
export function categoryPhoto(name: string): string | null {
  return lookup('menu/categories', dishSlug(name));
}
