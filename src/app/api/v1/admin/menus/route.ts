import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/adminAudit";
import { listMenuHeadersForAdmin, assertNoConflictingHouseMenu } from "@/server/menus/menuService";

// Collection-level menu API.
//   GET  /api/v1/admin/menus           → header listing (also used by SeriesMenusPanel picker)
//   POST /api/v1/admin/menus           → create a new (empty) menu shell

const CreateBody = z.object({
  venueSlug:   z.enum(["oku", "catch", "terrace"]),
  menuType:    z.enum(["FOOD", "DRINKS"]),
  menuTitle:   z.union([z.string(), z.record(z.string(), z.string())]),
  intro:       z.union([z.string(), z.record(z.string(), z.string()), z.null()]).optional(),
  pdfUrl:      z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  isHouseMenu: z.boolean().optional(),  // defaults to true; forced false when linkToSeriesId is set
  // Optional: link the new menu to a series immediately after creation
  // (used by the inline "Create new menu for this event" flow).
  linkToSeriesId: z.string().min(1).optional(),
});

export async function GET() {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:menus:read");
    const data = await listMenuHeadersForAdmin();
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:menus:edit");
    const body = CreateBody.parse(await req.json());

    // Force the invariant server-side: a menu attached to a series at
    // creation time can never be a house menu, regardless of what the
    // client sent.
    const isHouse = body.linkToSeriesId ? false : (body.isHouseMenu ?? true);

    if (isHouse) {
      // Pre-check inside the transaction below would be ideal, but the same
      // check is repeated post-create as a tighter race guard.
      await assertNoConflictingHouseMenu(body.venueSlug, body.menuType);
    }

    // If a series link is requested, validate the series exists *before*
    // creating anything so we never produce an orphaned menu on a typo'd id.
    if (body.linkToSeriesId) {
      const series = await prisma.series.findUnique({
        where:  { id: body.linkToSeriesId },
        select: { id: true },
      });
      if (!series) {
        return NextResponse.json({ ok: false, error: "Series not found" }, { status: 404 });
      }
    }

    // One transaction for create + (optional) re-check + link, so a failure
    // anywhere rolls back the menu and we never strand a partial record.
    const { created, eventLinkId } = await prisma.$transaction(async (tx) => {
      if (isHouse) {
        // Re-check inside the transaction to narrow the race window with
        // concurrent creates. Two parallel requests can still both pass
        // the outer check; the inner one fails the second writer.
        const conflict = await tx.venueMenuRecord.findFirst({
          where:  { venueSlug: body.venueSlug, menuType: body.menuType, isHouseMenu: true },
          select: { id: true },
        });
        if (conflict) {
          throw Object.assign(
            new Error(`A house menu for ${body.venueSlug}/${body.menuType} already exists`),
            { status: 409 },
          );
        }
      }

      const createdMenu = await tx.venueMenuRecord.create({
        data: {
          venueSlug:   body.venueSlug,
          menuType:    body.menuType,
          menuTitle:   body.menuTitle as any,
          intro:       (body.intro ?? null) as any,
          pdfUrl:      body.pdfUrl ?? null,
          isPublished: body.isPublished ?? true,
          isHouseMenu: isHouse,
        },
        select: { id: true, venueSlug: true, menuType: true, isHouseMenu: true },
      });

      let linkId: string | null = null;
      if (body.linkToSeriesId) {
        const existingCount = await tx.eventMenuLink.count({ where: { seriesId: body.linkToSeriesId } });
        const link = await tx.eventMenuLink.create({
          data: { seriesId: body.linkToSeriesId, menuId: createdMenu.id, sortOrder: existingCount },
        });
        linkId = link.id;
      }

      return { created: createdMenu, eventLinkId: linkId };
    });

    await logAdminAction({
      targetUserId:      userId,
      performedByUserId: userId,
      action:            "USER_UPDATED",
      summary:           `Created ${isHouse ? "house" : "event-only"} menu for ${created.venueSlug}/${created.menuType}` +
                         (eventLinkId ? ` (linked to series ${body.linkToSeriesId})` : ""),
      newValue:          {
        menuId: created.id, venueSlug: created.venueSlug, menuType: created.menuType,
        isHouseMenu: created.isHouseMenu, eventMenuLinkId: eventLinkId,
        seriesId: body.linkToSeriesId ?? null, op: "menu_created",
      },
    });

    return NextResponse.json({ ok: true, data: { ...created, eventMenuLinkId: eventLinkId } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Failed" }, { status: e.status || 500 });
  }
}
