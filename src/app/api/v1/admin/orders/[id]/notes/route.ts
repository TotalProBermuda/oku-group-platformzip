import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { roles, userId } = await requireSession();
    requirePermission(roles, "admin:audit:read");
    const { id } = await params;

    const body = await req.json();
    const { body: noteBody } = body;

    if (!noteBody?.trim()) {
      return NextResponse.json({ ok: false, error: "Note body is required" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const note = await prisma.orderNote.create({
      data: {
        orderId: id,
        body: noteBody.trim(),
        authorId: userId,
        authorName: user?.name || user?.email || "Admin",
      },
    });

    await prisma.orderEvent.create({
      data: {
        orderId: id,
        eventType: "NOTE_ADDED",
        eventLabel: "Note added",
        performedBy: user?.name || user?.email || "Admin",
      },
    });

    return NextResponse.json({ ok: true, data: note });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
