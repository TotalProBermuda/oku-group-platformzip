import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  checkRateLimitAsync,
  clientIp,
  gatePublicPostAsync,
  rateLimitedResponse,
} from "@/server/rateLimit";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const limit = await checkRateLimitAsync({
    key: `public-host-chat-read:${clientIp(req)}`,
    limit: 60,
    windowMs: 60_000,
    requireDistributed: true,
  });
  if (!limit.ok) return rateLimitedResponse(limit);
  const { token } = await params;
  const session = await prisma.hostChatSession.findUnique({
    where: { guestToken: token },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      venue: { select: { name: true } },
    },
  });
  if (!session) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, data: session });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { content } = await req.json().catch(() => ({}));
  const gate = await gatePublicPostAsync(req, { content }, "public-host-chat-message", {
    limit: 20,
    windowMs: 10 * 60_000,
    requireDistributed: true,
  });
  if (!gate.ok) return gate.response;
  if (typeof content !== "string" || !content.trim() || content.trim().length > 2_000) {
    return NextResponse.json({ ok: false, error: "content required" }, { status: 400 });
  }

  const session = await prisma.hostChatSession.findUnique({ where: { guestToken: token } });
  if (!session) return NextResponse.json({ ok: false, error: "Session not found" }, { status: 404 });
  if (session.status === "CLOSED") return NextResponse.json({ ok: false, error: "Session closed" }, { status: 410 });

  const msg = await prisma.hostChatMessage.create({
    data: { sessionId: session.id, senderRole: "GUEST", content: content.trim() },
  });
  await prisma.hostChatSession.update({
    where: { id: session.id },
    data: { status: "WAITING", updatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, data: msg }, { status: 201 });
}
