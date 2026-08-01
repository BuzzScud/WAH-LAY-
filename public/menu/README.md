# Dish photos

Drop a photo in this folder and it replaces that dish's illustration everywhere
— home page, order page, item sheet. No code change, no database edit, no
restart in production beyond the usual deploy.

## Naming

The filename is the dish name, lowercased, with punctuation turned into
hyphens. Menu codes (`L1.`, `C7a.`) and counts (`(3)`) are stripped, so one
photo covers the lunch, combo and à-la-carte versions of the same dish.

| Menu name                   | Filename                    |
| --------------------------- | --------------------------- |
| `L17. General Tso's Chicken` | `general-tso-s-chicken.jpg` |
| `Beef with Broccoli`         | `beef-with-broccoli.jpg`    |
| `Sweet & Sour Chicken`       | `sweet-and-sour-chicken.jpg` (`&` becomes `and`) |
| `C5. BBQ Spareribs (4)`      | `bbq-spareribs.jpg`         |

Accepted extensions, in priority order: `.webp`, `.jpg`, `.jpeg`, `.png`,
`.avif`.

Category banners go in `categories/` using the same rule on the category name —
e.g. `categories/appetizers.jpg`, `categories/vegetarian-dishes-w-white-rice.jpg`.

If you are unsure of the exact filename, open the site, find the dish, and check
the name it is listed under; the slug follows from that mechanically. Getting it
wrong is harmless — the dish just keeps its illustration.

## Shooting the photos

- Shoot straight down or at ~30°, in daylight near a window. No flash.
- Fill the frame with the dish. Anything roughly square to 4:3 crops well;
  the site crops to fit.
- 1200–1600 px on the long edge is plenty. Bigger files only slow the page down.
- One dish per photo, on a plain plate or in the takeout container.

## What's here now

The current photos were cut out of Wah Lay's own printed take-out menu (the
four phone photos in `WAHLAY/`), sharpened and colour-corrected. They are small
and a little soft because the source was a print halftone. Replacing them with
real photos of the food as it leaves the kitchen today is the single biggest
visual upgrade left for this site.

Dishes with no photo fall back to a hand-drawn illustration picked from the dish
name — see `src/lib/dishArt.ts` and `src/components/DishArt.tsx`.
