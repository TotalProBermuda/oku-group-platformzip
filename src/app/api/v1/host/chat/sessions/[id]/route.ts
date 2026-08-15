import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertHostCanManageChatSession,
  assertHostChatVenue,
  requireHostChatAccess,
} from "@/server/auth/hostChatGuard";

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
    if (!access.canManageAllVenueChats && hostUserId !== undefined && hostUserId !== access.userId) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    const existing = await prisma.hostChatSession.findUnique({
      where: { id },
      select: { venueId: true, hostUserId: true },
    });
    if (!existing) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    assertHostChatVenue(access, existing.venueId);
    assertHostCanManageChatSession(access, existing.hostUserId);

    if (hostUserId !== undefined && hostUserId !== existing.hostUserId) {
      const assignee = await prisma.restaurantHostProfile.findUnique({
        where: { userId: hostUserId },
        select: { venueId: true },
      });
      if (assignee?.venueId !== existing.venueId) {
        return NextResponse.json({ ok: false, error: "Assigned host must belong to this venue" }, { status: 400 });
      }
    }

    const session = await prisma.hostChatSession.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        // A regular host who changes an unclaimed conversation becomes its
        // owner. This prevents concurrent work; supervisors retain queue-wide control.
        ...(hostUserId !== undefined
          ? { hostUserId }
          : !access.canManageAllVenueChats && !existing.hostUserId
            ? { hostUserId: access.userId }
            : {}),
      },
    });

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    const statusCode = e.status ?? 500;
    return NextResponse.json(
      { ok: false, error: statusCode >= 500 ? "Internal error" : e.message },
      { status: statusCode },
    );
  }
}
