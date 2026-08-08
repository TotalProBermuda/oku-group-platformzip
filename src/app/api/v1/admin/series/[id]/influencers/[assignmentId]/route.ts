import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) =>
    ["SUPERADMIN", "FB_DIRECTOR"].includes(r)
  );
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assignmentId: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: seriesId, assignmentId } = await params;
  const assignment = await prisma.experienceInfluencer.findUnique({ where: { id: assignmentId } });
  if (!assignment || assignment.seriesId !== seriesId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.experienceInfluencer.delete({ where: { id: assignmentId } });
  return NextResponse.json({ ok: true });
}
