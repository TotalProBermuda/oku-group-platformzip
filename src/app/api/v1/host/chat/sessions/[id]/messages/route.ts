import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
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
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { content, senderRole, token } = await req.json();

    if (!content || !senderRole) {
      return NextResponse.json({ ok: false, error: "content and senderRole required" }, { status: 400 });
    }

    const session = await prisma.hostChatSession.findUnique({ where: { id } });
    if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });

    if (senderRole === "GUEST" && session.guestToken !== token) {
      return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 403 });
    }

    const message = await prisma.hostChatMessage.create({
      data: { sessionId: id, senderRole, content },
    });

    await prisma.hostChatSession.update({
      where: { id },
      data: { updatedAt: new Date(), status: senderRole === "GUEST" ? "WAITING" : "OPEN" },
    });

    return NextResponse.json({ ok: true, data: message }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
