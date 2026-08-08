import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "FB_DIRECTOR"].includes(r)
  );
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

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
