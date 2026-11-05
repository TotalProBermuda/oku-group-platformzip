import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
export { requireUnifiedAssignmentPreview as POST } from "@/server/series/legacySessionGuard";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    const [seriesAssignments, sessionAssignments] = await Promise.all([
      prisma.seriesProfileAssignment.findMany({
        where: { profileId: id },
        include: { series: { select: { id: true, title: true, slug: true, status: true, startsAt: true, endsAt: true } } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.sessionProfileAssignment.findMany({
        where: { profileId: id },
        include: { session: { select: { id: true, title: true, status: true, startsAt: true, endsAt: true } } },
        orderBy: { createdAt: "desc" },
      }),
    ]);

    return NextResponse.json({ seriesAssignments, sessionAssignments });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
