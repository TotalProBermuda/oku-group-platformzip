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
      where: { userId: id },
      include: {
        profile: {
          select: {
            id: true, displayName: true, profileType: true, primaryCategory: true,
            avatarUrl: true, logoUrl: true, status: true, publicVisible: true,
            _count: { select: { seriesAssignments: true, accountLinks: true } },
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
    const { profileId, relationshipType, canManage, isPrimary, isPublicRepresentative } = await req.json();

    if (!profileId || !relationshipType) {
      return NextResponse.json({ error: "profileId and relationshipType required" }, { status: 400 });
    }

    const link = await prisma.accountProfileLink.create({
      data: {
        userId: id, profileId, relationshipType,
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

    await prisma.accountProfileLink.delete({ where: { id: linkId, userId: id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
