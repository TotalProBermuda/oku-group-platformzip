import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  assertHostCanManageChatSession,
  assertHostChatVenue,
  requireHostChatAccess,
} from "@/server/auth/hostChatGuard";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const access = await requireHostChatAccess();
    const session = await prisma.hostChatSession.findUnique({ where: { id }, select: { venueId: true } });
    if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    assertHostChatVenue(access, session.venueId);
    const { searchParams } = new URL(req.url);
    const after = searchParams.get("after");

    const messages = await prisma.hostChatMessage.findMany({
      where: {
        sessionId: id,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    return NextResponse.json({ ok: true, data: messages });
  } catch (e: any) {
    const statusCode = e.status ?? 500;
    return NextResponse.json({ ok: false, error: statusCode >= 500 ? "Internal error" : e.message }, { status: statusCode });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { content } = await req.json();

    if (typeof content !== "string" || !content.trim() || content.trim().length > 2_000) {
      return NextResponse.json({ ok: false, error: "content required" }, { status: 400 });
    }

    const access = await requireHostChatAccess();
    const session = await prisma.hostChatSession.findUnique({
      where: { id },
      select: { venueId: true, hostUserId: true },
    });
    if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
    assertHostChatVenue(access, session.venueId);
    assertHostCanManageChatSession(access, session.hostUserId);

    const message = await prisma.hostChatMessage.create({
      data: { sessionId: id, senderRole: "HOST", content: content.trim() },
    });

    await prisma.hostChatSession.update({
      where: { id },
      data: {
        updatedAt: new Date(),
        status: "OPEN",
        ...(session.hostUserId ? {} : { hostUserId: access.userId }),
      },
    });

    return NextResponse.json({ ok: true, data: message }, { status: 201 });
  } catch (e: any) {
    const statusCode = e.status ?? 500;
    return NextResponse.json({ ok: false, error: statusCode >= 500 ? "Internal error" : e.message }, { status: statusCode });
  }
}
