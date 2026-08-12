import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { logAdminAction } from "@/lib/adminAudit";

const VALID_CYCLES = ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId: actorId } = await requireAdminRoles(req, ["SUPERADMIN"]);
    const { id } = await params;

    const body = await req.json();
    const { payoutCycle, minPayoutThresholdCents } = body;

    if (payoutCycle !== undefined && !VALID_CYCLES.includes(payoutCycle)) {
      return NextResponse.json({ ok: false, error: "Invalid payoutCycle" }, { status: 400 });
    }

    const prev = await prisma.influencerProfile.findUniqueOrThrow({ where: { id } });

    const data: Record<string, unknown> = {};
    if (payoutCycle !== undefined) data.payoutCycle = payoutCycle;
    if (minPayoutThresholdCents !== undefined) {
      const val = Number(minPayoutThresholdCents);
      if (isNaN(val) || val < 0) return NextResponse.json({ ok: false, error: "Invalid threshold" }, { status: 400 });
      data.minPayoutThresholdCents = val;
    }

    const updated = await prisma.influencerProfile.update({
      where: { id },
      data,
      select: { id: true, payoutCycle: true, minPayoutThresholdCents: true },
    });

    await logAdminAction({
      targetUserId:      prev.userId,
      performedByUserId: actorId,
      action:            "USER_UPDATED",
      summary:           `Influencer payout settings updated`,
      previousValue:     { payoutCycle: prev.payoutCycle, minPayoutThresholdCents: prev.minPayoutThresholdCents },
      newValue:          data,
    });

    return NextResponse.json({ ok: true, data: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: e.status || 500 });
  }
}
