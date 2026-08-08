import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { prisma } from "@/lib/prisma";
import {
  createEventReferrer,
  listReferrersForInfluencer,
  getInfluencerReferrerDashboardMetrics,
} from "@/server/events/eventReferrerService";
import { EventReferrerScopeType, EventReferrerCommissionMode } from "@prisma/client";

const CreateBody = z.object({
  seriesId: z.string().optional(),
  scopeType: z.nativeEnum(EventReferrerScopeType).default("SERIES"),
  assignedUserId: z.string().optional(),
  inviteEmail: z.string().email().optional(),
  displayName: z.string().min(1),
  isCommissionEligible: z.boolean().default(false),
  commissionMode: z.nativeEnum(EventReferrerCommissionMode).default("NONE"),
  commissionShareBps: z.number().int().min(0).max(10000).optional(),
});

export async function POST(req: Request) {
  const { userId } = await requireSession();

  const influencer = await prisma.influencerProfile.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!influencer) {
    return NextResponse.json(
      { ok: false, error: "Not an influencer" },
      { status: 403 }
    );
  }

  const body = CreateBody.parse(await req.json());

  const result = await createEventReferrer({
    parentInfluencerId: influencer.id,
    createdByInfluencerId: influencer.id,
    seriesId: body.seriesId,
    scopeType: body.scopeType,
    assignedUserId: body.assignedUserId,
    inviteEmail: body.inviteEmail,
    displayName: body.displayName,
    isCommissionEligible: body.isCommissionEligible,
    commissionMode: body.commissionMode,
    commissionShareBps: body.commissionShareBps,
  });

  if (!result.ok) {
    if ("blocked" in result) {
      return NextResponse.json(
        { ok: false, code: "blocked", reason: result.reason },
        { status: 409 },
      );
    }
    // Canonical merge_required shape — matches /api/v1/operators/create and
    // referrer-resolution/resolve so admin merge UI needs no route-specific parsing.
    return NextResponse.json(
      {
        ok: false,
        code: "merge_required",
        candidateActorId: result.candidateActorId,
        candidateActorUserId: result.candidateActorUserId,
        matchField: result.matchField,
      },
      { status: 409 },
    );
  }

  return NextResponse.json({ ok: true, data: result.assignment }, { status: 201 });
}

export async function GET(req: Request) {
  const { userId } = await requireSession();

  const influencer = await prisma.influencerProfile.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (!influencer) {
    return NextResponse.json(
      { ok: false, error: "Not an influencer" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const includeDashboard = searchParams.get("dashboard") === "true";

  if (includeDashboard) {
    const metrics = await getInfluencerReferrerDashboardMetrics(influencer.id);
    return NextResponse.json({ ok: true, data: metrics });
  }

  const referrers = await listReferrersForInfluencer(influencer.id);
  return NextResponse.json({ ok: true, data: referrers });
}
