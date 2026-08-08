/**
 * One-shot seed: import the static menu file into the DB.
 * Idempotent — keyed by venueSlug+menuType, sections/items reset on each run
 * (intentional: keeps the DB in sync with the static file until the static
 * file is removed).
 */

import { PrismaClient, VenueMenuType } from "@prisma/client";
import { venueMenus } from "../src/data/venues/menus";

const prisma = new PrismaClient();

function toJson(v: unknown): any {
  return v ?? null;
}

async function main() {
  console.log("🌱  Menu seed starting…\n");

  for (const menu of venueMenus) {
    const menuType: VenueMenuType = menu.menuType === "drinks" ? "DRINKS" : "FOOD";

    // Each menu rebuild runs in a single transaction so an interruption can't
    // leave a menu in a half-rebuilt (e.g., empty sections) state.
    await prisma.$transaction(async (tx) => {
      const record = await tx.venueMenuRecord.upsert({
        where: { venueSlug_menuType: { venueSlug: menu.venueSlug, menuType } },
        create: {
          venueSlug: menu.venueSlug,
          menuType,
          menuTitle: toJson(menu.menuTitle),
          intro: toJson(menu.intro),
          pdfUrl: menu.pdfUrl ?? null,
          sortOrder: menu.order ?? 0,
          isPublished: true,
        },
        update: {
          menuTitle: toJson(menu.menuTitle),
          intro: toJson(menu.intro),
          pdfUrl: menu.pdfUrl ?? null,
          sortOrder: menu.order ?? 0,
        },
      });

      await tx.menuSectionRecord.deleteMany({ where: { menuId: record.id } });

      for (const section of menu.sections) {
        const sectionRow = await tx.menuSectionRecord.create({
          data: {
            menuId: record.id,
            title: toJson(section.title),
            subtitle: toJson(section.subtitle),
            description: toJson(section.description),
            sortOrder: section.order ?? 0,
          },
        });

        for (const item of section.items) {
          await tx.menuItemRecord.create({
            data: {
              sectionId: sectionRow.id,
              name: toJson(item.name),
              description: toJson(item.description),
              price: item.price ?? null,
              dietary: item.dietary ?? [],
              tags: item.tags ?? [],
              sortOrder: item.order ?? 0,
              isAvailable: item.isAvailable ?? true,
            },
          });
        }
      }
    }, { timeout: 30000 });

    console.log(
      `   ✓ ${menu.venueSlug}/${menuType.toLowerCase()} — ${menu.sections.length} sections, ${menu.sections.reduce((s, x) => s + x.items.length, 0)} items`,
    );
  }

  const totals = await Promise.all([
    prisma.venueMenuRecord.count(),
    prisma.menuSectionRecord.count(),
    prisma.menuItemRecord.count(),
  ]);
  console.log(`\n✅  Menu seed complete. Menus: ${totals[0]}, sections: ${totals[1]}, items: ${totals[2]}`);
}

main()
  .catch((e) => {
    console.error("❌  Menu seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
