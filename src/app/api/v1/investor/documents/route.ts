import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const { userId, roles } = await requireSession();

    const investor = await prisma.investorProfile.findUnique({
      where: { userId },
    });

    if (!investor?.approved && !roles.includes("SUPERADMIN")) {
      return NextResponse.json({ ok: false, error: "Not an approved investor" }, { status: 403 });
    }

    const isSuperAdmin = roles.includes("SUPERADMIN");

    const visibilityFilter: Prisma.IRDocumentWhereInput[] = [{ visibility: "APPROVED_INVESTORS" }];
    if (isSuperAdmin) {
      visibilityFilter.push({ visibility: "PRIVATE" });
    }

    const documents = await prisma.iRDocument.findMany({
      where: { OR: visibilityFilter },
      include: {
        versions: {
          orderBy: { version: "desc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      data: {
        investorName: investor?.id ? (await prisma.user.findUnique({ where: { id: userId } }))?.name : null,
        documents,
      },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Internal server error" }, { status: 500 });
  }
}
