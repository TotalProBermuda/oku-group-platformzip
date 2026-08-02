import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user?.isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const registrants = await prisma.eventRegistrant.findMany({
    where: { seriesId: id },
    include: {
      user: { select: { id: true, name: true, email: true, membership: { select: { tier: true, status: true } } } },
      invitation: { select: { status: true, audienceSegment: true, sentAt: true } },
      ticket: { select: { code: true, ticketStatus: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(registrants);
}
