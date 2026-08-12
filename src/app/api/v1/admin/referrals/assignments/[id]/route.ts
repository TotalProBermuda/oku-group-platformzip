// CRUD: GET (read), PATCH (update), DELETE (soft-delete = RETIRED) for a
// single ReferralAssignment. SUPERADMIN only.
// All writes audited under `referrer.assignment.*`.

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { ReferralCompensationMode, OfferType } from "@prisma/client";
import { logReferrerAssignmentAction } from "@/server/referrals/referrerAssignmentAudit";

const ADMIN_ROLES = new Set(["SUPERADMIN"]);

async function authorize() {
  let userId: string;
  let roles: string[];
  try {
    ({ userId, roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return { error: NextResponse.json({ error: "Unauthorized" }, { status }) };
  }
  if (!roles.some((r) => ADMIN_ROLES.has(r))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId };
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;
  const row = await prisma.referralAssignment.findUnique({
    where: { id },
    include: { links: true },
  });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ assignment: row });
}

const PatchBody = z.object({
  offerType: z.nativeEnum(OfferType).optional(),
  offerId: z.string().nullable().optional(),
  offerLabel: z.string().max(200).nullable().optional(),
  offerStartAt: z.string().datetime().nullable().optional(),
  offerEndAt: z.string().datetime().nullable().optional(),
  isCommissionEligible: z.boolean().optional(),
  compensationMode: z.nativeEnum(ReferralCompensationMode).optional(),
  rateBps: z.number().int().min(0).max(10000).nullable().optional(),
  flatAmountCents: z.number().int().min(0).nullable().optional(),
  commissionPlanId: z.string().nullable().optional(),
  qrPayload: z.string().max(4096).nullable().optional(),
}).refine(
  (b) =>
    !b.offerStartAt ||
    !b.offerEndAt ||
    new Date(b.offerEndAt) > new Date(b.offerStartAt),
  { message: "offerEndAt must be after offerStartAt", path: ["offerEndAt"] },
);

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body", issues: parsed.error.issues }, { status: 400 });
  }

  const before = await prisma.referralAssignment.findUnique({ where: { id } });
  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Translate ISO strings → Date and only set keys that were actually
  // sent (parity with CommerceSettings PATCH gotcha — never wipe).
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(parsed.data)) {
    if (v === undefined) continue;
    if ((k === "offerStartAt" || k === "offerEndAt") && typeof v === "string") {
      data[k] = new Date(v);
    } else {
      data[k] = v;
    }
  }

  const updated = await prisma.referralAssignment.update({ where: { id }, data });

  await logReferrerAssignmentAction({
    actorId: auth.userId,
    action: "assignment.updated",
    referralActorId: before.referralActorId,
    referralAssignmentId: id,
    before: {
      offerLabel: before.offerLabel,
      offerEndAt: before.offerEndAt?.toISOString() ?? null,
      isCommissionEligible: before.isCommissionEligible,
      compensationMode: before.compensationMode,
    },
    after: parsed.data as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true, assignment: updated });
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorize();
  if ("error" in auth) return auth.error;
  const { id } = await ctx.params;

  const existing = await prisma.referralAssignment.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Soft-delete: flip to RETIRED + isActive=false. Preserves attribution
  // history on past Orders. We never hard-delete because Orders FK in.
  const updated = await prisma.referralAssignment.update({
    where: { id },
    data: { status: "RETIRED", isActive: false },
  });
  await logReferrerAssignmentAction({
    actorId: auth.userId,
    action: "assignment.deactivated",
    referralActorId: existing.referralActorId,
    referralAssignmentId: id,
    before: { status: existing.status, isActive: existing.isActive },
    after: { status: "RETIRED", isActive: false },
  });
  return NextResponse.json({ ok: true, assignment: updated });
}
