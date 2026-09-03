import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";

export async function GET() {
  try {
    const { userId } = await requireSession();
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { email: true },
    });
    const normalizedEmail = user.email.trim().toLowerCase();

    const orders = await prisma.order.findMany({
      where: { userId },
      include: {
        series: { select: { id: true, title: true, slug: true, venue: true } },
        session: { select: { id: true, title: true, startsAt: true } },
        lineItems: {
          include: { ticketType: { select: { name: true, priceCents: true } } },
        },
        tickets: {
          where: { attendeeEmailNormalized: normalizedEmail },
          select: { id: true, code: true, checkedInAt: true },
        },
        payment: { select: { status: true, provider: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ ok: true, data: orders });
  } catch (err: any) {
    if (err.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: "Internal server error" }, { status: 500 });
  }
}
