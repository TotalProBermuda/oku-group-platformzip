// Partner-scoped read + soft-archive for a single ReferralAssignment.
// PATCH supports limited updates (offerLabel, offerEndAt, status).
// DELETE soft-archives by flipping status=RETIRED + isActive=false so
// historical attribution on Orders is preserved.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { ReferralAssignmentStatus } from "@prisma/client";
import { logReferrerAssignmentAction } from "@/server/referrals/referrerAssignmentAudit";

const PARTNER_ROLES = new Set(["PARTNER", "PARTNER_OWNER"]);

/**
 * Authorise that the caller is the PartnerProfile that owns the Series
 * the assignment is scoped to. Single source of truth for partner write
 * authz on a specific assignment id.
 */
async function authorizePartnerOnAssignment(userId: string, assignmentId: string) {
  const partnerProfile = await prisma.partnerProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!partnerProfile) return { error: NextResponse.json({ error: "No partner profile" }, { status: 403 }) };
  const assignment = await prisma.referralAssignment.findUnique({ where: { id: assignmentId } });
  if (!assignment) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (assignment.scopeType !== "SERIES" || !assignment.scopeId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  const series = await prisma.series.findUnique({
    where: { id: assignment.scopeId },
    select: { partnerId: true },
  });
  if (!series || series.partnerId !== partnerProfile.id) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { assignment };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => PARTNER_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const authz = await authorizePartnerOnAssignment(userId, id);
  if ("error" in authz) return authz.error;
  const full = await prisma.referralAssignment.findUnique({
    where: { id },
    include: { links: true },
  });
  return NextResponse.json({ assignment: full });
}

const PatchBody = z.object({
  offerLabel: z.string().max(200).nullable().optional(),
  offerEndAt: z.string().datetime().nullable().optional(),
  status: z.nativeEnum(ReferralAssignmentStatus).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => PARTNER_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const authz = await authorizePartnerOnAssignment(userId, id);
  if ("error" in authz) return authz.error;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if (k === "offerEndAt" && typeof v === "string") data[k] = new Date(v);
    else data[k] = v;
  }
  if (parsed.data.status) {
    // Keep boolean isActive coherent with status for legacy readers.
    data.isActive = parsed.data.status === "ACTIVE";
  }

  const updated = await prisma.referralAssignment.update({ where: { id }, data });
  await logReferrerAssignmentAction({
    actorId: userId,
    action: parsed.data.status ? "status.changed" : "assignment.updated",
    referralActorId: authz.assignment.referralActorId,
    referralAssignmentId: id,
    before: { status: authz.assignment.status, offerLabel: authz.assignment.offerLabel },
    after: parsed.data as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true, assignment: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => PARTNER_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const authz = await authorizePartnerOnAssignment(userId, id);
  if ("error" in authz) return authz.error;

  // Soft-archive: never hard-delete because Orders FK to this row.
  const updated = await prisma.referralAssignment.update({
    where: { id },
    data: { status: "RETIRED", isActive: false },
  });
  await logReferrerAssignmentAction({
    actorId: userId,
    action: "assignment.deactivated",
    referralActorId: authz.assignment.referralActorId,
    referralAssignmentId: id,
    before: { status: authz.assignment.status, isActive: authz.assignment.isActive },
    after: { status: "RETIRED", isActive: false },
  });
  return NextResponse.json({ ok: true, assignment: updated });
}
