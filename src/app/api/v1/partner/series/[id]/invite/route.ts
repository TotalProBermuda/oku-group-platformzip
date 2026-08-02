import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requirePartnerForSeries, PartnerAuthError } from "@/lib/partnerAuth";
import { sendInvitationEmails } from "@/server/invitation/invitationService";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await requirePartnerForSeries(id);

    const body = await req.json().catch(() => ({}));
    const recipientEmail = String(body.recipientEmail ?? "").trim().toLowerCase();
    const recipientName: string | null = body.recipientName ? String(body.recipientName).trim() : null;
    const isCompInvite: boolean = Boolean(body.isCompInvite);
    const intendedTicketTypeId: string | null = body.intendedTicketTypeId ?? null;

    if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
      return NextResponse.json({ error: "Valid recipientEmail required" }, { status: 400 });
    }

    if (intendedTicketTypeId) {
      const tt = await prisma.ticketType.findFirst({
        where: { id: intendedTicketTypeId, seriesId: id },
        select: { id: true },
      });
      if (!tt) return NextResponse.json({ error: "intendedTicketTypeId does not belong to series" }, { status: 400 });
    }

    // Try to resolve to an existing user
    const recipientUser = await prisma.user.findUnique({
      where: { email: recipientEmail },
      select: { id: true, name: true },
    });

    const invitation = await prisma.eventInvitation.create({
      data: {
        seriesId: id,
        recipientEmail,
        recipientName: recipientName ?? recipientUser?.name ?? null,
        recipientUserId: recipientUser?.id ?? null,
        audienceSegment: "INDIVIDUAL",
        status: "SENT",
        createdByUserId: auth.userId,
        isCompInvite,
        intendedTicketTypeId: intendedTicketTypeId,
      },
      select: {
        id: true, recipientEmail: true, recipientName: true, status: true,
        inviteToken: true, isCompInvite: true, intendedTicketTypeId: true, createdAt: true,
      },
    });

    // Send the email through the existing pipeline (best-effort).
    let sendResult: any = { sent: 0, failed: 0 };
    try {
      sendResult = await sendInvitationEmails(id, [invitation.id], {});
    } catch (err) {
      console.error("[partner/invite] send failed", err);
    }

    return NextResponse.json({ ok: true, invitation, send: sendResult }, { status: 201 });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/invite] POST", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    await requirePartnerForSeries(id);

    const invitations = await prisma.eventInvitation.findMany({
      where: { seriesId: id, audienceSegment: "INDIVIDUAL" },
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true, recipientEmail: true, recipientName: true, status: true,
        sentAt: true, openedAt: true, respondedAt: true, rsvpConfirmedAt: true,
        isCompInvite: true,
        intendedTicketType: { select: { id: true, name: true } },
        createdBy: { select: { name: true, email: true } },
      },
    });

    return NextResponse.json({ ok: true, invitations });
  } catch (e: any) {
    if (e instanceof PartnerAuthError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e.message === "Unauthorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    console.error("[partner/invite] GET", e);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
