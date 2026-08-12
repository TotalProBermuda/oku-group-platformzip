import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(_req, ["SUPERADMIN"]);
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
    await requireAdminRoles(req, ["SUPERADMIN"]);
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
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const { linkId } = await req.json();

    await prisma.accountProfileLink.delete({ where: { id: linkId, userId: id } });
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
