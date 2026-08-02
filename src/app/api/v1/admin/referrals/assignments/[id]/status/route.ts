// Lifecycle status transitions for a ReferralAssignment.
// DRAFT → ACTIVE → PAUSED → ACTIVE → RETIRED. Each transition is audited
// under `referrer.assignment.status.changed` for full lifecycle reconstruction.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { ReferralAssignmentStatus } from "@prisma/client";
import { logReferrerAssignmentAction } from "@/server/referrals/referrerAssignmentAudit";

const ADMIN_ROLES = new Set(["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_FINANCE"]);

const Body = z.object({
  status: z.nativeEnum(ReferralAssignmentStatus),
  reason: z.string().max(500).optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => ADMIN_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const existing = await prisma.referralAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const before = { status: existing.status, isActive: existing.isActive };
  const newStatus = parsed.data.status;
  // Keep boolean isActive coherent with status for backward-compat readers.
  const newIsActive = newStatus === "ACTIVE";

  const updated = await prisma.referralAssignment.update({
    where: { id },
    data: { status: newStatus, isActive: newIsActive },
  });

  await logReferrerAssignmentAction({
    actorId: userId,
    action: "status.changed",
    referralActorId: existing.referralActorId,
    referralAssignmentId: id,
    before,
    after: { status: newStatus, isActive: newIsActive, reason: parsed.data.reason ?? null },
  });

  return NextResponse.json({ ok: true, assignment: updated });
}
