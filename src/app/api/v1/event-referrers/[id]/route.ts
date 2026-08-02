import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  revokeEventReferrer,
  activateEventReferrer,
  archiveEventReferrer,
} from "@/server/events/eventReferrerService";

const UpdateBody = z.object({
  action: z.enum(["activate", "revoke", "archive"]),
  displayName: z.string().min(1).optional(),
  isCommissionEligible: z.boolean().optional(),
  commissionShareBps: z.number().int().min(0).max(10000).optional(),
});

async function getInfluencerOwnerOfAssignment(assignmentId: string, userId: string) {
  const influencer = await prisma.influencerProfile.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!influencer) return null;

  const assignment = await prisma.eventReferrerAssignment.findFirst({
    where: { id: assignmentId, parentInfluencerId: influencer.id },
    select: { id: true },
  });
  return assignment ? influencer : null;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await requireSession();
  const influencer = await getInfluencerOwnerOfAssignment(id, userId);
  if (!influencer) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const body = UpdateBody.parse(await req.json());

  if (body.action === "revoke") await revokeEventReferrer(id);
  else if (body.action === "activate") await activateEventReferrer(id);
  else if (body.action === "archive") await archiveEventReferrer(id);

  const updateData: Record<string, unknown> = {};
  if (body.displayName !== undefined) updateData.displayName = body.displayName;
  if (body.isCommissionEligible !== undefined) updateData.isCommissionEligible = body.isCommissionEligible;
  if (body.commissionShareBps !== undefined) updateData.commissionShareBps = body.commissionShareBps;

  if (Object.keys(updateData).length > 0) {
    await prisma.eventReferrerAssignment.update({
      where: { id },
      data: updateData,
    });
  }

  const updated = await prisma.eventReferrerAssignment.findUnique({
    where: { id },
    include: {
      series: { select: { id: true, slug: true, title: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
    },
  });

  return NextResponse.json({ ok: true, data: updated });
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await requireSession();

  const assignment = await prisma.eventReferrerAssignment.findUnique({
    where: { id },
    include: {
      series: { select: { id: true, slug: true, title: true } },
      parentInfluencer: { select: { id: true, userId: true } },
      parentPartner: { select: { id: true, userId: true } },
      assignedUser: { select: { id: true, name: true, email: true } },
      orders: { where: { status: "PAID" }, select: { id: true, subtotalCents: true } },
      subCommissionLedger: { select: { referrerShareCents: true, payoutStatus: true } },
    },
  });

  if (!assignment) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  const isInfluencerOwner = assignment.parentInfluencer?.userId === userId;
  const isPartnerOwner = assignment.parentPartner?.userId === userId;
  const isAssignee = assignment.assignedUser?.id === userId;
  if (!isInfluencerOwner && !isPartnerOwner && !isAssignee) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json({ ok: true, data: assignment });
}
