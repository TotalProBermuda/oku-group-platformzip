import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const [asParent, asChild] = await Promise.all([
      prisma.profileRelationship.findMany({
        where: { parentProfileId: id },
        include: { childProfile: { select: { id: true, displayName: true, profileType: true, primaryCategory: true, avatarUrl: true, status: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.profileRelationship.findMany({
        where: { childProfileId: id },
        include: { parentProfile: { select: { id: true, displayName: true, profileType: true, primaryCategory: true, avatarUrl: true, status: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ asParent, asChild });
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
    const { childProfileId, relationshipType, metadata } = await req.json();

    if (!childProfileId || !relationshipType) {
      return NextResponse.json({ error: "childProfileId and relationshipType required" }, { status: 400 });
    }

    const relationship = await prisma.profileRelationship.create({
      data: { parentProfileId: id, childProfileId, relationshipType, metadata: metadata ?? {} },
    });

    return NextResponse.json({ relationship }, { status: 201 });
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
    const { relationshipId } = await req.json();

    await prisma.profileRelationship.delete({
      where: { id: relationshipId, parentProfileId: id },
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
