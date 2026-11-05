import { NextRequest, NextResponse } from "next/server";
import { getServerSession, type Session } from "next-auth";
import { MembershipStatus, MembershipTier, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAdmin(session: Session | null) {
  return session?.user?.roles?.includes("SUPERADMIN") ?? false;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const tier = searchParams.get("tier");
  const status = searchParams.get("status");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = 50;

  const parsedTier = tier ? Object.values(MembershipTier).find((value) => value === tier) : undefined;
  const parsedStatus = status ? Object.values(MembershipStatus).find((value) => value === status) : undefined;
  if ((tier && !parsedTier) || (status && !parsedStatus)) return NextResponse.json({ error: "Invalid membership filter" }, { status: 400 });
  const where: Prisma.MembershipWhereInput = {};
  if (parsedTier) where.tier = parsedTier;
  if (parsedStatus) where.status = parsedStatus;

  const [total, memberships] = await Promise.all([
    prisma.membership.count({ where }),
    prisma.membership.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return NextResponse.json({ memberships, total, page, limit });
}
