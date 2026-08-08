import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;
  const { inheritsSeriesSponsors } = await req.json();

  const updated = await prisma.session.update({
    where: { id },
    data: { inheritsSeriesSponsors: Boolean(inheritsSeriesSponsors) },
    select: { id: true, inheritsSeriesSponsors: true },
  });
  return NextResponse.json({ session: updated });
}
