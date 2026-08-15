import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { assertHostChatVenue, requireHostChatAccess } from "@/server/auth/hostChatGuard";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await requireHostChatAccess();
    const { id } = await params;
    const body = await req.json();
    const { status, hostUserId } = body;
    if (status !== undefined && !["OPEN", "WAITING", "CLOSED"].includes(status)) {
      return NextResponse.json({ ok: false, error: "Invalid status" }, { status: 400 });
    }
    if (hostUserId !== undefined && typeof hostUserId !== "string") {
      return NextResponse.json({ ok: false, error: "Invalid host user" }, { status: 400 });
    }
    if (!access.isSuperadmin && hostUserId !== undefined && hostUserId !== access.userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const existing = await prisma.hostChatSession.findUnique({ where: { id }, select: { venueId: true } });
    if (!existing) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    assertHostChatVenue(access, existing.venueId);

    const session = await prisma.hostChatSession.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(hostUserId !== undefined ? { hostUserId } : {}),
      },
    });

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
