/**
 * Seed script — loads data/menu-seed.json (exported from the owner's menu
 * spreadsheet) and creates the single owner account. Idempotent-ish: it
 * wipes and reloads menu/config tables so you can reset to a known-good
 * state in one command while developing. It never touches orders.
 *
 *   npm run db:push   # create tables (dev) — use generated migrations in prod
 *   npm run db:seed
 */
import { readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { db, schema } from './client';

const seed = JSON.parse(readFileSync(new URL('../../data/menu-seed.json', import.meta.url), 'utf8'));

async function main() {
  // --- wipe menu/config (not orders) ---
  await db.delete(schema.itemModifierGroups);
  await db.delete(schema.modifiers);
  await db.delete(schema.modifierGroups);
  await db.delete(schema.menuItems);
  await db.delete(schema.categories);
  await db.delete(schema.businessHours);
  await db.delete(schema.storeSettings);

  // --- settings singleton ---
  await db.insert(schema.storeSettings).values({ id: 1, ...seed.settings });

  // --- hours ---
  for (const h of seed.hours) {
    await db.insert(schema.businessHours).values(h);
  }

  // --- modifier groups (defined once, reused across items) ---
  const groupIdByKey = new Map<string, number>();
  for (const [i, g] of seed.modifierGroups.entries()) {
    const [row] = await db
      .insert(schema.modifierGroups)
      .values({
        name: g.name,
        minSelect: g.minSelect,
        maxSelect: g.maxSelect,
        required: g.required,
        sortOrder: i,
      })
      .returning();
    groupIdByKey.set(g.key, row.id);
    for (const [j, m] of g.modifiers.entries()) {
      await db.insert(schema.modifiers).values({
        groupId: row.id,
        name: m.name,
        priceDeltaCents: m.priceDeltaCents ?? 0,
        priceOverrideCents: m.priceOverrideCents ?? null,
        sortOrder: j,
      });
    }
  }

  // --- categories + items ---
  for (const [ci, cat] of seed.categories.entries()) {
    const [catRow] = await db
      .insert(schema.categories)
      .values({ name: cat.name, sortOrder: ci })
      .returning();
    for (const [ii, item] of cat.items.entries()) {
      const [itemRow] = await db
        .insert(schema.menuItems)
        .values({
          categoryId: catRow.id,
          nameEn: item.nameEn,
          nameZh: item.nameZh ?? null,
          description: item.description ?? null,
          basePriceCents: item.basePriceCents,
          tags: item.tags ?? [],
          sortOrder: ii,
        })
        .returning();
      for (const [gi, key] of (item.groups ?? []).entries()) {
        const groupId = groupIdByKey.get(key);
        if (!groupId) throw new Error(`Unknown modifier group key "${key}" on ${item.nameEn}`);
        await db.insert(schema.itemModifierGroups).values({
          itemId: itemRow.id,
          groupId,
          sortOrder: gi,
        });
      }
    }
  }

  // --- owner account (no public signup route exists) ---
  const username = process.env.ADMIN_USERNAME ?? 'owner';
  const password = process.env.ADMIN_PASSWORD ?? 'change-me-now';
  const hash = await bcrypt.hash(password, 12);
  const existing = await db.query.users.findFirst();
  if (!existing) {
    await db.insert(schema.users).values({ username, passwordHash: hash });
    console.log(`Created owner account "${username}".`);
  } else {
    console.log('Owner account already exists — not touching it.');
  }

  console.log('Seed complete.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
