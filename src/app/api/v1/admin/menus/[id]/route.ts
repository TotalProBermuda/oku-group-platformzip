import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

// PUT /api/v1/admin/menus/[id]
// Replaces sections + items for a menu in one transaction (simpler editor UX).
// Updates the menu shell fields too.

const ItemSchema = z.object({
  id: z.string().optional(), // present if existing; absent for new rows
  name: z.union([z.string(), z.record(z.string(), z.string())]),
  description: z.union([z.string(), z.record(z.string(), z.string()), z.null()]).optional(),
  price: z.string().nullable().optional(),
  dietary: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  sortOrder: z.number().int().default(0),
  isAvailable: z.boolean().default(true),
});

const SectionSchema = z.object({
  id: z.string().optional(),
  title: z.union([z.string(), z.record(z.string(), z.string())]),
  subtitle: z.union([z.string(), z.record(z.string(), z.string()), z.null()]).optional(),
  description: z.union([z.string(), z.record(z.string(), z.string()), z.null()]).optional(),
  sortOrder: z.number().int().default(0),
  items: z.array(ItemSchema).default([]),
});

const Body = z.object({
  menuTitle: z.union([z.string(), z.record(z.string(), z.string())]),
  intro: z.union([z.string(), z.record(z.string(), z.string()), z.null()]).optional(),
  pdfUrl: z.string().nullable().optional(),
  isPublished: z.boolean().optional(),
  sections: z.array(SectionSchema).default([]),
});

type RouteContext = { params: Promise<{ id: string }> };

function errorResponse(error: unknown) {
  const details = typeof error === "object" && error !== null
    ? error as { message?: unknown; status?: unknown }
    : undefined;
  const status = typeof details?.status === "number" && details.status >= 400 && details.status <= 599
    ? details.status
    : 500;
  const message = typeof details?.message === "string" ? details.message : "Internal server error";
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function GET(_req: Request, ctx: RouteContext) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:menus:read");
    const { id } = await ctx.params;
    const menu = await prisma.venueMenuRecord.findUnique({
      where: { id },
      include: {
        sections: {
          include: { items: { orderBy: { sortOrder: "asc" } } },
          orderBy: { sortOrder: "asc" },
        },
      },
    });
    if (!menu) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: menu });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}

export async function PUT(req: Request, ctx: RouteContext) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:menus:edit");
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());

    const before = await prisma.venueMenuRecord.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.venueMenuRecord.update({
        where: { id },
        data: {
          menuTitle: body.menuTitle as Prisma.InputJsonValue,
          intro: body.intro == null ? Prisma.DbNull : body.intro as Prisma.InputJsonValue,
          pdfUrl: body.pdfUrl ?? null,
          isPublished: body.isPublished ?? before.isPublished,
        },
      });
      // Reset all sections (cascade deletes items) — simple and safe for MVP.
      await tx.menuSectionRecord.deleteMany({ where: { menuId: id } });
      for (const s of body.sections) {
        const section = await tx.menuSectionRecord.create({
          data: {
            menuId: id,
            title: s.title as Prisma.InputJsonValue,
            subtitle: s.subtitle == null ? Prisma.DbNull : s.subtitle as Prisma.InputJsonValue,
            description: s.description == null ? Prisma.DbNull : s.description as Prisma.InputJsonValue,
            sortOrder: s.sortOrder,
          },
        });
        for (const it of s.items) {
          await tx.menuItemRecord.create({
            data: {
              sectionId: section.id,
              name: it.name as Prisma.InputJsonValue,
              description: it.description == null ? Prisma.DbNull : it.description as Prisma.InputJsonValue,
              price: it.price ?? null,
              dietary: it.dietary,
              tags: it.tags,
              sortOrder: it.sortOrder,
              isAvailable: it.isAvailable,
            },
          });
        }
      }
    });

    console.log(`[admin:menus:edit] user=${userId} updated menu=${id} venue=${before.venueSlug} type=${before.menuType} sections=${body.sections.length}`);

    return NextResponse.json({ ok: true });
  } catch (error: unknown) {
    return errorResponse(error);
  }
}
