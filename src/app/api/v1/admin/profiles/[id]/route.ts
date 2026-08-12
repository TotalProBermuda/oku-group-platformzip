import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(_req, ["SUPERADMIN"]);
    const { id } = await params;

    const profile = await prisma.profile.findUnique({
      where: { id },
      include: {
        accountLinks: {
          include: { user: { select: { id: true, name: true, email: true, status: true, roles: { select: { roleKey: true } } } } },
          orderBy: { createdAt: "desc" },
        },
        childRelationships: {
          include: { childProfile: { select: { id: true, displayName: true, profileType: true, primaryCategory: true, avatarUrl: true, status: true } } },
        },
        parentRelationships: {
          include: { parentProfile: { select: { id: true, displayName: true, profileType: true, primaryCategory: true, avatarUrl: true, status: true } } },
        },
        seriesAssignments: {
          include: { series: { select: { id: true, title: true, status: true, startsAt: true } } },
          orderBy: { createdAt: "desc" },
        },
        sessionAssignments: {
          include: { session: { select: { id: true, title: true, status: true, startsAt: true } } },
          orderBy: { createdAt: "desc" },
        },
        compensationSettings: true,
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    return NextResponse.json({ profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { session } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const body = await req.json();

    const dbUser = session?.user?.email
      ? await prisma.user.findUnique({ where: { email: session.user.email }, select: { id: true } })
      : null;

    const profile = await prisma.profile.update({
      where: { id },
      data: {
        ...body,
        updatedByUserId: dbUser?.id ?? null,
        updatedAt: new Date(),
      },
    });

    return NextResponse.json({ profile });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(_req, ["SUPERADMIN"]);
    const { id } = await params;

    await prisma.profile.update({ where: { id }, data: { status: "ARCHIVED" } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
