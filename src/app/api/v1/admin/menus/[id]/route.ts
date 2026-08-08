import { NextResponse } from "next/server";
import { z } from "zod";
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

export async function GET(_req: Request, ctx: any) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:menus:read");
    const id = ctx?.params?.id ?? (await ctx.params).id;
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function PUT(req: Request, ctx: any) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:menus:edit");
    const id = ctx?.params?.id ?? (await ctx.params).id;
    const body = Body.parse(await req.json());

    const before = await prisma.venueMenuRecord.findUnique({ where: { id } });
    if (!before) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.venueMenuRecord.update({
        where: { id },
        data: {
          menuTitle: body.menuTitle as any,
          intro: (body.intro ?? null) as any,
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
            title: s.title as any,
            subtitle: (s.subtitle ?? null) as any,
            description: (s.description ?? null) as any,
            sortOrder: s.sortOrder,
          },
        });
        for (const it of s.items) {
          await tx.menuItemRecord.create({
            data: {
              sectionId: section.id,
              name: it.name as any,
              description: (it.description ?? null) as any,
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
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
