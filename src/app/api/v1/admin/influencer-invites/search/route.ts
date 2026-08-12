import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

export async function GET(req: NextRequest) {
  await requireAdminRoles(req, ["SUPERADMIN"]);

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q") ?? "";

  const users = await prisma.user.findMany({
    where: {
      roles: { some: { roleKey: "INFLUENCER" } },
      ...(q ? {
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { email: { contains: q, mode: "insensitive" } },
          { influencer: { handle: { contains: q, mode: "insensitive" } } },
        ],
      } : {}),
    },
    take: 20,
    include: {
      influencer: {
        select: {
          id: true,
          handle: true,
          displayName: true,
          profileImageUrl: true,
          commissionRateBps: true,
          refCode: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ ok: true, users });
}
