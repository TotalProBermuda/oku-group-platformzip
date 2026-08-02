import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const opportunityId = searchParams.get("opportunityId");

  const rows = await prisma.applicationSubmission.findMany({
    where: {
      ...(status ? { status: status as never } : {}),
      ...(opportunityId ? { opportunityId } : {}),
    },
    orderBy: { submittedAt: "desc" },
    include: {
      applicantProfile: { select: { fullName: true, email: true } },
      opportunity: { select: { title: true, slug: true } },
    },
  });

  return NextResponse.json(rows);
}
