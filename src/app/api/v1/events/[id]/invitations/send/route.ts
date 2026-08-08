import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createInvitationsForSegment, sendInvitationEmails } from "@/server/invitation/invitationService";
import { InviteAudienceMode } from "@prisma/client";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  const roles: string[] = (session?.user as any)?.roles ?? [];
  const isAdmin = roles.some((r) => ["SUPERADMIN", "FB_DIRECTOR", "ADMIN_IR", "ADMIN_HR"].includes(r));
  if (!isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const { audienceMode, resendToNonResponders, emailConfig } = body;

  if (!audienceMode || !Object.values(InviteAudienceMode).includes(audienceMode)) {
    return NextResponse.json({ error: "Invalid audienceMode" }, { status: 400 });
  }

  const series = await prisma.series.findUnique({ where: { id } });
  if (!series) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  const { created, invitations } = await createInvitationsForSegment(
    id,
    audienceMode,
    session.user.id,
    { resendToNonResponders: !!resendToNonResponders }
  );

  const sendResult = await sendInvitationEmails(
    id,
    invitations.map((i) => i.id),
    emailConfig ?? {}
  );

  return NextResponse.json({ created, ...sendResult });
}
