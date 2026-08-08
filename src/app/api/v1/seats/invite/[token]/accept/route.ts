import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { acceptInvite, getInviteByToken } from "@/server/partnerSeats/service";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await ctx.params;
    const session = await requireSession();
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true },
    });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 401 });

    const lookup = await getInviteByToken(token);
    if (lookup.status !== "valid" || !lookup.seat) {
      return NextResponse.json({ error: lookup.status }, { status: 400 });
    }
    if (lookup.seat.invitedEmail.toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json(
        { error: "email_mismatch", invitedEmail: lookup.seat.invitedEmail },
        { status: 403 }
      );
    }
    const result = await acceptInvite(token, { id: user.id, email: user.email });
    return NextResponse.json(result);
  } catch (e) {
    const status = (e as { status?: number })?.status;
    if (status === 401) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Internal error" },
      { status: 500 }
    );
  }
}
