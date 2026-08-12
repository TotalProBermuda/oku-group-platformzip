import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);

    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? "";
    const role = searchParams.get("role");
    const status = searchParams.get("status");
    const linked = searchParams.get("linked");
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, parseInt(searchParams.get("pageSize") ?? "50", 10));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    if (status) where.status = status;
    if (role) {
      where.roles = { some: { roleKey: role } };
    }
    if (linked === "true") {
      where.accountProfileLinks = { some: {} };
    } else if (linked === "false") {
      where.accountProfileLinks = { none: {} };
    }

    const [total, accounts] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
          lastLoginAt: true,
          imageUrl: true,
          roles: { select: { roleKey: true } },
          accountProfileLinks: {
            select: {
              id: true, relationshipType: true, isPrimary: true,
              profile: { select: { id: true, displayName: true, profileType: true, primaryCategory: true, avatarUrl: true } },
            },
          },
          _count: { select: { accountProfileLinks: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
    ]);

    const [totalCount, activeCount, suspendedCount, linkedCount, unlinkedCount] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: "ACTIVE" } }),
      prisma.user.count({ where: { status: "SUSPENDED" } }),
      prisma.user.count({ where: { accountProfileLinks: { some: {} } } }),
      prisma.user.count({ where: { accountProfileLinks: { none: {} } } }),
    ]);

    return NextResponse.json({
      accounts,
      total,
      page,
      pageSize,
      pageCount: Math.ceil(total / pageSize),
      summary: { totalCount, activeCount, suspendedCount, linkedCount, unlinkedCount, pendingCount: 0 },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
