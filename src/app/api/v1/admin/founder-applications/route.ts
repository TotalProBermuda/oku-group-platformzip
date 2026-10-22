import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { FounderApplicationStatus, Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function isAdmin(roles: string[] = []) {
  return roles.includes("SUPERADMIN");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const roles = session.user?.roles ?? [];
  if (!isAdmin(roles)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const validStatuses = Object.values(FounderApplicationStatus);
  const where: Prisma.FounderMembershipApplicationWhereInput = {};
  if (status && validStatuses.includes(status as FounderApplicationStatus)) {
    where.status = status as FounderApplicationStatus;
  }

  const applications = await prisma.founderMembershipApplication.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ applications });
}
