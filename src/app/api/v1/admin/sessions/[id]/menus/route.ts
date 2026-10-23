import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

type Context = { params: Promise<{ id: string }> };

async function authorize(edit: boolean) {
  const auth = await requireSession();
  requirePermission(auth.roles, "admin:experiences:write");
  requirePermission(auth.roles, edit ? "admin:menus:edit" : "admin:menus:read");
  return auth;
}

function failure(error: unknown) {
  if (error instanceof z.ZodError) {
    return NextResponse.json({ ok: false, error: error.issues.map((issue) => issue.message).join("; ") }, { status: 400 });
  }
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    return NextResponse.json({ ok: false, error: "That menu is already assigned to this session." }, { status: 409 });
  }
  console.error("Session menu assignment failed", error);
  return NextResponse.json({ ok: false, error: "Session menus are unavailable." }, { status: 500 });
}

export async function GET(_request: Request, context: Context) {
  try {
    await authorize(false);
    const { id: sessionId } = await context.params;
    const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } });
    if (!session) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });

    const [links, available] = await Promise.all([
      prisma.sessionMenuLink.findMany({
        where: { sessionId },
        include: { menu: { select: { id: true, menuTitle: true, venueSlug: true, menuType: true, isPublished: true } } },
        orderBy: { sortOrder: "asc" },
      }),
      prisma.venueMenuRecord.findMany({
        where: { isPublished: true },
        select: { id: true, menuTitle: true, venueSlug: true, menuType: true },
        orderBy: [{ venueSlug: "asc" }, { sortOrder: "asc" }],
      }),
    ]);
    return NextResponse.json({ ok: true, data: {
      linked: links.filter((link) => link.menu.isPublished).map((link) => ({ ...link.menu, sortOrder: link.sortOrder })),
      available,
    } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request, context: Context) {
  try {
    await authorize(true);
    const { id: sessionId } = await context.params;
    const body = z.object({ menuId: z.string().min(1) }).parse(await request.json());
    const [session, menu, existingCount] = await Promise.all([
      prisma.session.findUnique({ where: { id: sessionId }, select: { id: true } }),
      prisma.venueMenuRecord.findFirst({ where: { id: body.menuId, isPublished: true }, select: { id: true } }),
      prisma.sessionMenuLink.count({ where: { sessionId } }),
    ]);
    if (!session) return NextResponse.json({ ok: false, error: "Session not found." }, { status: 404 });
    if (!menu) return NextResponse.json({ ok: false, error: "Choose a published menu." }, { status: 400 });

    await prisma.sessionMenuLink.create({ data: { sessionId, menuId: menu.id, sortOrder: existingCount } });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    await authorize(true);
    const { id: sessionId } = await context.params;
    const menuId = new URL(request.url).searchParams.get("menuId");
    if (!menuId) return NextResponse.json({ ok: false, error: "Menu ID is required." }, { status: 400 });
    const result = await prisma.sessionMenuLink.deleteMany({ where: { sessionId, menuId } });
    if (result.count === 0) return NextResponse.json({ ok: false, error: "Assignment not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
