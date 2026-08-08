import { prisma } from "@/lib/prisma";
import type { VenueMenu, MenuSection, MenuItem } from "@/data/venues/menus";
import type { LocalizedText } from "@/types/i18n";

type LocalizedOrString = string | LocalizedText | null;

function asLocalized(v: unknown): LocalizedOrString {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "object") return v as LocalizedText;
  return null;
}

function shapeMenu(
  record: {
    id: string;
    venueSlug: string;
    menuType: "FOOD" | "DRINKS";
    menuTitle: unknown;
    intro: unknown;
    pdfUrl: string | null;
    sortOrder: number;
    sections: Array<{
      id: string;
      title: unknown;
      subtitle: unknown;
      description: unknown;
      sortOrder: number;
      items: Array<{
        id: string;
        name: unknown;
        description: unknown;
        price: string | null;
        dietary: string[];
        tags: string[];
        sortOrder: number;
        isAvailable: boolean;
      }>;
    }>;
  },
): VenueMenu {
  return {
    venueSlug: record.venueSlug as VenueMenu["venueSlug"],
    venueName: record.venueSlug.toUpperCase(),
    menuTitle: (asLocalized(record.menuTitle) ?? "") as string | LocalizedText,
    menuType: record.menuType === "DRINKS" ? "drinks" : "food",
    intro: (asLocalized(record.intro) ?? undefined) as string | LocalizedText | undefined,
    pdfUrl: record.pdfUrl ?? undefined,
    order: record.sortOrder,
    sections: record.sections
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map<MenuSection>((s) => ({
        id: s.id,
        title: (asLocalized(s.title) ?? "") as string | LocalizedText,
        subtitle: (asLocalized(s.subtitle) ?? undefined) as string | LocalizedText | undefined,
        description: (asLocalized(s.description) ?? undefined) as string | LocalizedText | undefined,
        order: s.sortOrder,
        items: s.items
          .filter((it) => it.isAvailable)
          .slice()
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map<MenuItem>((it) => ({
            id: it.id,
            name: (asLocalized(it.name) ?? "") as string | LocalizedText,
            description: (asLocalized(it.description) ?? undefined) as string | LocalizedText | undefined,
            price: it.price ?? undefined,
            dietary: it.dietary,
            tags: it.tags,
            order: it.sortOrder,
            isAvailable: it.isAvailable,
          })),
      })),
  };
}

async function fetchMenu(venueSlug: string, menuType: "FOOD" | "DRINKS"): Promise<VenueMenu | null> {
  // Public venue pages must always pull the *house* menu, never an
  // event-specific duplicate. We filter to published rows and order by
  // sortOrder/createdAt so the result is deterministic even if the
  // application-layer house-uniqueness guard is ever bypassed.
  const record = await prisma.venueMenuRecord.findFirst({
    where:   { venueSlug, menuType, isHouseMenu: true, isPublished: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: { sections: { include: { items: true } } },
  });
  if (!record) return null;
  return shapeMenu(record);
}

// Throws if a published house menu already exists for (venueSlug, menuType).
// Call this from any code path that creates or flips a row to isHouseMenu=true,
// since Prisma can't express this as a partial unique index portably.
export async function assertNoConflictingHouseMenu(
  venueSlug: string,
  menuType: "FOOD" | "DRINKS",
  excludeMenuId?: string,
): Promise<void> {
  const existing = await prisma.venueMenuRecord.findFirst({
    where: {
      venueSlug, menuType, isHouseMenu: true,
      ...(excludeMenuId ? { NOT: { id: excludeMenuId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw Object.assign(
      new Error(`A house menu for ${venueSlug}/${menuType} already exists (id=${existing.id})`),
      { status: 409 },
    );
  }
}

export function getFoodMenuByVenueDb(venueSlug: "oku" | "catch" | "terrace") {
  return fetchMenu(venueSlug, "FOOD");
}

export function getDrinksMenuByVenueDb(venueSlug: "oku" | "catch" | "terrace") {
  return fetchMenu(venueSlug, "DRINKS");
}

export async function getMenusByVenueDb(venueSlug: "oku" | "catch" | "terrace"): Promise<VenueMenu[]> {
  // Venue-page lists exclude event-specific menus so a private tasting menu
  // never leaks to walk-in guests browsing the restaurant page.
  const records = await prisma.venueMenuRecord.findMany({
    where: { venueSlug, isPublished: true, isHouseMenu: true },
    include: { sections: { include: { items: true } } },
    orderBy: { sortOrder: "asc" },
  });
  return records.map(shapeMenu);
}

export async function listAllMenusForAdmin() {
  const records = await prisma.venueMenuRecord.findMany({
    include: {
      sections: {
        include: { items: { orderBy: { sortOrder: "asc" } } },
        orderBy: { sortOrder: "asc" },
      },
    },
    orderBy: [{ venueSlug: "asc" }, { sortOrder: "asc" }],
  });
  return records.map((r) => ({ ...shapeMenu(r), id: r.id, isPublished: r.isPublished, isHouseMenu: r.isHouseMenu, parentMenuId: r.parentMenuId }));
}

// ─── Event-specific menu helpers (Task #69) ───────────────────────────────
// Returns the menus attached to a Series, in EventMenuLink.sortOrder order.
// Falls back to an empty array (callers decide whether to show the venue's
// house menu instead).
export async function getMenusForSeries(seriesId: string): Promise<VenueMenu[]> {
  const links = await prisma.eventMenuLink.findMany({
    where:   { seriesId },
    include: { menu: { include: { sections: { include: { items: true } } } } },
    orderBy: { sortOrder: "asc" },
  });
  return links
    .filter((l) => l.menu.isPublished)
    .map((l) => shapeMenu(l.menu));
}

// Light-weight listing for admin pickers — no sections/items, just headers.
export async function listMenuHeadersForAdmin() {
  return prisma.venueMenuRecord.findMany({
    select: {
      id: true, venueSlug: true, menuType: true, menuTitle: true,
      isHouseMenu: true, isPublished: true, parentMenuId: true,
      _count: { select: { sections: true, eventLinks: true } },
    },
    orderBy: [{ venueSlug: "asc" }, { isHouseMenu: "desc" }, { sortOrder: "asc" }],
  });
}

// Duplicates a source menu (deep clone of sections + items) and marks the
// new record as event-only (isHouseMenu=false). Caller is responsible for
// linking the result to a series via EventMenuLink.
export async function duplicateMenuRecord(sourceMenuId: string, opts?: { newTitle?: unknown }) {
  const source = await prisma.venueMenuRecord.findUnique({
    where:   { id: sourceMenuId },
    include: { sections: { include: { items: true }, orderBy: { sortOrder: "asc" } } },
  });
  if (!source) throw new Error("Source menu not found");

  return prisma.venueMenuRecord.create({
    data: {
      venueSlug:    source.venueSlug,
      menuType:     source.menuType,
      menuTitle:    (opts?.newTitle ?? source.menuTitle) as any,
      intro:        source.intro as any,
      pdfUrl:       source.pdfUrl,
      sortOrder:    source.sortOrder,
      isPublished:  source.isPublished,
      isHouseMenu:  false,
      parentMenuId: source.id,
      sections: {
        create: source.sections.map((s) => ({
          title:       s.title as any,
          subtitle:    s.subtitle as any,
          description: s.description as any,
          sortOrder:   s.sortOrder,
          items: {
            create: s.items.map((it) => ({
              name:        it.name as any,
              description: it.description as any,
              price:       it.price,
              dietary:     it.dietary,
              tags:        it.tags,
              sortOrder:   it.sortOrder,
              isAvailable: it.isAvailable,
            })),
          },
        })),
      },
    },
  });
}
