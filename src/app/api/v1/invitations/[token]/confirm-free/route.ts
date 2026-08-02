import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateToken, markRsvpConfirmed } from "@/server/invitation/tokenService";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const result = await validateToken(token);
  if (!result.valid) return NextResponse.json({ error: result.reason }, { status: 404 });

  const inv = result.invitation;

  const registrant = await prisma.eventRegistrant.upsert({
    where: { seriesId_userId: { seriesId: inv.seriesId, userId: session.user.id } },
    create: {
      seriesId: inv.seriesId,
      userId: session.user.id,
      invitationId: inv.id,
      registrationStatus: "REGISTERED",
      sourceType: "INVITATION",
    },
    update: {
      registrationStatus: "REGISTERED",
      invitationId: inv.id,
    },
  });

  await markRsvpConfirmed(inv.id);

  return NextResponse.json({ ok: true, registrantId: registrant.id, status: "REGISTERED" });
}
