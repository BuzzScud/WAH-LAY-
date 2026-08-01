/** Full menu as JSON for the interactive order page. */
import type { APIRoute } from 'astro';
import { asc } from 'drizzle-orm';
import { db, schema } from '@/db/client';
import { getOpenState } from '@/lib/hours';
import { artForCategory, artForDish, artTint } from '@/lib/dishArt';
import { categoryPhoto, dishPhoto } from '@/lib/dishPhotos';

export const GET: APIRoute = async () => {
  const [cats, items, links, groups, mods, settings, open] = await Promise.all([
    db.query.categories.findMany({ orderBy: asc(schema.categories.sortOrder) }),
    db.query.menuItems.findMany({ orderBy: asc(schema.menuItems.sortOrder) }),
    db.query.itemModifierGroups.findMany(),
    db.query.modifierGroups.findMany(),
    db.query.modifiers.findMany({ orderBy: asc(schema.modifiers.sortOrder) }),
    db.query.storeSettings.findFirst(),
    getOpenState(),
  ]);

  const groupsById = new Map(
    groups.map((g) => [
      g.id,
      { ...g, modifiers: mods.filter((m) => m.groupId === g.id) },
    ])
  );

  const payload = {
    store: settings
      ? { name: settings.name, phone: settings.phone, address: settings.address, prepTimeMinutes: settings.prepTimeMinutes, taxRateBps: settings.taxRateBps }
      : null,
    open,
    categories: cats
      .filter((c) => c.active)
      .map((c) => ({
        id: c.id,
        name: c.name,
        art: artForCategory(c.name),
        photo: categoryPhoto(c.name),
        items: items
          .filter((i) => i.categoryId === c.id)
          .map((i) => ({
            id: i.id,
            nameEn: i.nameEn,
            nameZh: i.nameZh,
            description: i.description,
            basePriceCents: i.basePriceCents,
            isAvailable: i.isAvailable,
            tags: i.tags,
            // Picture for the order UI: the owner's photo when one has been
            // dropped into public/menu/, otherwise the illustration key.
            art: artForDish(i.nameEn, i.description, c.name),
            photo: dishPhoto(i.nameEn),
            tint: artTint(i.nameEn),
            groups: links
              .filter((l) => l.itemId === i.id)
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map((l) => groupsById.get(l.groupId))
              .filter(Boolean),
          })),
      })),
  };

  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
};
