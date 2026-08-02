import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOptionalSession } from "@/server/auth/session";

export async function GET(_req: NextRequest) {
  const auth = await getOptionalSession();
  if (!auth) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const tickets = await prisma.ticket.findMany({
    where: { userId: auth.userId, ticketStatus: { in: ["ISSUED", "CHECKED_IN"] } },
    orderBy: { createdAt: "desc" },
    include: {
      session: {
        include: {
          series: { select: { title: true, slug: true, venue: true, category: true } },
        },
      },
      ticketType: { select: { name: true, tierCode: true } },
      order: { select: { status: true, totalCents: true } },
    },
  });

  return NextResponse.json({ tickets });
}
