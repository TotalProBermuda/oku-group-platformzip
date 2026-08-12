import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";

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

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;
    const { seriesId, sessionId, assignmentRole, displayOrder, isPrimary } = await req.json();

    if (!assignmentRole) {
      return NextResponse.json({ error: "assignmentRole required" }, { status: 400 });
    }

    if (seriesId) {
      const assignment = await prisma.seriesProfileAssignment.create({
        data: { seriesId, profileId: id, assignmentRole, displayOrder: displayOrder ?? 0, isPrimary: isPrimary ?? false },
      });
      return NextResponse.json({ assignment }, { status: 201 });
    }

    if (sessionId) {
      const assignment = await prisma.sessionProfileAssignment.create({
        data: { sessionId, profileId: id, assignmentRole, displayOrder: displayOrder ?? 0, isPrimary: isPrimary ?? false },
      });
      return NextResponse.json({ assignment }, { status: 201 });
    }

    return NextResponse.json({ error: "Either seriesId or sessionId required" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
