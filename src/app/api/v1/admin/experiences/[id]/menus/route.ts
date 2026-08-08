import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { logAdminAction } from "@/lib/adminAudit";
import { duplicateMenuRecord } from "@/server/menus/menuService";

// GET  → list EventMenuLink rows for the series with menu headers.
// POST → attach existing menu OR duplicate a source menu and attach it.

const PostBody = z.union([
  z.object({ menuId: z.string().min(1) }),
  z.object({ duplicateFromMenuId: z.string().min(1), newTitle: z.unknown().optional() }),
]);

async function ensureSeries(id: string) {
  const series = await prisma.series.findUnique({ where: { id }, select: { id: true, title: true } });
  if (!series) throw Object.assign(new Error("Series not found"), { status: 404 });
  return series;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:menus:read");
    const { id } = await ctx.params;
    await ensureSeries(id);

    const links = await prisma.eventMenuLink.findMany({
      where: { seriesId: id },
      include: {
        menu: {
          select: {
            id: true, venueSlug: true, menuType: true, menuTitle: true,
            isHouseMenu: true, isPublished: true, parentMenuId: true,
            _count: { select: { sections: true } },
          },
        },
      },
      orderBy: { sortOrder: "asc" },
    });
    return NextResponse.json({ ok: true, data: links });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:menus:edit");
    const { id } = await ctx.params;
    const series = await ensureSeries(id);
    const body = PostBody.parse(await req.json());

    let targetMenuId: string;
    let auditSummary: string;
    let auditAction: "linked" | "duplicated";

    if ("duplicateFromMenuId" in body) {
      const created = await duplicateMenuRecord(body.duplicateFromMenuId, { newTitle: body.newTitle });
      targetMenuId = created.id;
      auditSummary = `Duplicated menu ${body.duplicateFromMenuId} → ${created.id} for event "${series.title}"`;
      auditAction = "duplicated";
    } else {
      // Verify the menu exists before linking so we surface a 404 rather
      // than letting the unique-key error bubble up as a generic 500.
      const exists = await prisma.venueMenuRecord.findUnique({ where: { id: body.menuId }, select: { id: true } });
      if (!exists) return NextResponse.json({ ok: false, error: "Menu not found" }, { status: 404 });
      targetMenuId = body.menuId;
      auditSummary = `Linked menu ${body.menuId} to event "${series.title}"`;
      auditAction = "linked";
    }

    // sortOrder = current count so the new attachment shows up at the end.
    const existingCount = await prisma.eventMenuLink.count({ where: { seriesId: id } });

    const link = await prisma.eventMenuLink.upsert({
      where: { seriesId_menuId: { seriesId: id, menuId: targetMenuId } },
      update: {},
      create: { seriesId: id, menuId: targetMenuId, sortOrder: existingCount },
    });

    // Best-effort audit. The User audit log is keyed by targetUserId; we use
    // the actor as both target and performer so the row appears in the
    // actor's own action history. Series id lives in newValue.
    await logAdminAction({
      targetUserId:      userId,
      performedByUserId: userId,
      action:            "USER_UPDATED",
      summary:           auditSummary,
      newValue:          { eventMenuLinkId: link.id, seriesId: id, menuId: targetMenuId, op: auditAction },
    });

    return NextResponse.json({ ok: true, data: link });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Failed" }, { status: e.status || 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:menus:edit");
    const { id } = await ctx.params;
    const series = await ensureSeries(id);

    const linkId = req.nextUrl.searchParams.get("linkId");
    if (!linkId) return NextResponse.json({ ok: false, error: "linkId required" }, { status: 400 });

    const link = await prisma.eventMenuLink.findUnique({ where: { id: linkId } });
    if (!link || link.seriesId !== id) {
      return NextResponse.json({ ok: false, error: "Link not found for this event" }, { status: 404 });
    }

    await prisma.eventMenuLink.delete({ where: { id: linkId } });

    await logAdminAction({
      targetUserId:      userId,
      performedByUserId: userId,
      action:            "USER_UPDATED",
      summary:           `Unlinked menu ${link.menuId} from event "${series.title}"`,
      previousValue:     { eventMenuLinkId: linkId, seriesId: id, menuId: link.menuId },
      newValue:          { eventMenuLinkId: null },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message ?? "Failed" }, { status: e.status || 500 });
  }
}
