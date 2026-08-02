import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const body = await req.json();
    const { status, hostUserId } = body;

    const session = await prisma.hostChatSession.update({
      where: { id },
      data: {
        ...(status ? { status } : {}),
        ...(hostUserId ? { hostUserId } : {}),
      },
    });

    return NextResponse.json({ ok: true, data: session });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
