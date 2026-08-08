import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

function isAdmin(session: any) {
  return session?.user?.roles?.some((r: string) => ["SUPERADMIN", "FB_DIRECTOR"].includes(r));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!isAdmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: sessionId } = await params;
  const { overridesSeriesHost } = await req.json().catch(() => ({}));

  const updated = await prisma.session.update({
    where: { id: sessionId },
    data: { overridesSeriesHost: Boolean(overridesSeriesHost) },
    select: { id: true, overridesSeriesHost: true },
  });
  return NextResponse.json({ ok: true, session: updated });
}
