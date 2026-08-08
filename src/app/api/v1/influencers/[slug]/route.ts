import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  // slug = handle (e.g. "@sophia_laurent") or refCode
  const decoded = decodeURIComponent(slug);
  const profile = await prisma.influencerProfile.findFirst({
    where: {
      OR: [{ handle: decoded }, { handle: `@${decoded}` }, { handle: decoded.replace(/^@/, "") }, { refCode: decoded }],
      isPublic: true,
      approvalStatus: "APPROVED",
    },
    include: {
      user: { select: { name: true, imageUrl: true } },
      series: {
        where: { status: { in: ["PUBLISHED", "SOLD_OUT"] } },
        orderBy: { startsAt: "asc" },
        include: { ticketTypes: { where: { ticketStatus: "ACTIVE" }, orderBy: { displayOrder: "asc" } } },
      },
    },
  });
  if (!profile) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ profile });
}
