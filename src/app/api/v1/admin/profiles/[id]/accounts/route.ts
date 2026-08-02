import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const links = await prisma.accountProfileLink.findMany({
      where: { profileId: id },
      include: {
        user: {
          select: {
            id: true, name: true, email: true, status: true, lastLoginAt: true,
            roles: { select: { roleKey: true } },
          },
        },
      },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ links });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await params;
    const { userId, relationshipType, canManage, isPrimary, isPublicRepresentative } = await req.json();

    if (!userId || !relationshipType) {
      return NextResponse.json({ error: "userId and relationshipType required" }, { status: 400 });
    }

    const link = await prisma.accountProfileLink.create({
      data: {
        profileId: id, userId, relationshipType,
        canManage: canManage ?? false,
        isPrimary: isPrimary ?? false,
        isPublicRepresentative: isPublicRepresentative ?? false,
      },
    });

    return NextResponse.json({ link }, { status: 201 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await params;
    const { linkId } = await req.json();

    await prisma.accountProfileLink.delete({ where: { id: linkId, profileId: id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
