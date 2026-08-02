import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const account = await prisma.user.findUnique({
      where: { id },
      include: {
        roles: { select: { roleKey: true } },
        accountProfileLinks: {
          include: {
            profile: {
              select: {
                id: true, displayName: true, profileType: true, primaryCategory: true,
                avatarUrl: true, logoUrl: true, status: true, publicVisible: true, compensationEligible: true,
              },
            },
          },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
        },
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { performedBy: { select: { id: true, name: true, email: true } } },
        },
        influencer: { select: { id: true, handle: true, approvalStatus: true } },
        partner: { select: { id: true, name: true } },
        referrer: { select: { id: true, fullName: true, referralCode: true, referrerType: true } },
        _count: { select: { orders: true, tickets: true, accountProfileLinks: true } },
      },
    });

    if (!account) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    return NextResponse.json({ account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:users:edit");
    const { id } = await params;
    const body = await req.json();

    const { name, email, phone, imageUrl, internalNotes, tags } = body;
    const account = await prisma.user.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(internalNotes !== undefined && { internalNotes }),
        ...(tags !== undefined && { tags }),
      },
      select: { id: true, name: true, email: true, status: true, updatedAt: true },
    });

    return NextResponse.json({ account });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
