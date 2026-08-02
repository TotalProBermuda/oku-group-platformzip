import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import {
  ReferralCompensationMode,
  ReferralScopeType,
  OfferType,
} from "@prisma/client";
import { logReferrerAssignmentAction } from "@/server/referrals/referrerAssignmentAudit";
import { generateReferralLink } from "@/server/referrals/referralLinkService";

const ADMIN_ROLES = new Set(["SUPERADMIN", "ADMIN_COMMERCIAL", "ADMIN_FINANCE"]);

const Body = z.object({
  referralActorId: z.string().min(1),
  scopeType: z.nativeEnum(ReferralScopeType).default(ReferralScopeType.GLOBAL),
  scopeId: z.string().optional(),
  offerType: z.nativeEnum(OfferType),
  offerId: z.string().optional(),
  offerLabel: z.string().max(200).optional(),
  offerStartAt: z.string().datetime().optional(),
  offerEndAt: z.string().datetime().optional(),
  isCommissionEligible: z.boolean().default(false),
  compensationMode: z.nativeEnum(ReferralCompensationMode).default(ReferralCompensationMode.NONE),
  rateBps: z.number().int().min(0).max(10000).optional(),
  flatAmountCents: z.number().int().min(0).optional(),
  commissionPlanId: z.string().optional(),
  qrPayload: z.string().max(4096).optional(),
  /** When true, also generate a brand-new ReferralLink scoped to this assignment. */
  generateLink: z.boolean().default(true),
}).refine(
  (b) => !b.offerStartAt || !b.offerEndAt || new Date(b.offerEndAt) > new Date(b.offerStartAt),
  { message: "offerEndAt must be after offerStartAt", path: ["offerEndAt"] },
);

/**
 * POST /api/v1/admin/referrals/assignments
 *
 * Creates a ReferralAssignment with an offerType (RESTAURANT/EVENT/...) and
 * optionally a fresh ReferralLink. Admin-only. Audited under
 * `referrer.assignment.assignment.created` and (if a link is generated)
 * `referrer.assignment.link.generated`.
 */
/**
 * GET — paginated list of all ReferralAssignments. Filter by referralActorId,
 * offerType, status. Read-only; admin-scoped (same role gate as POST).
 */
export async function GET(req: Request) {
  let roles: string[];
  try {
    ({ roles } = await requireSession());
  } catch (e) {
    const status = (e as { status?: number }).status ?? 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
  if (!roles.some((r) => ADMIN_ROLES.has(r))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const where: Record<string, unknown> = {};
  const referralActorId = url.searchParams.get("referralActorId");
  if (referralActorId) where.referralActorId = referralActorId;
  const offerType = url.searchParams.get("offerType");
  if (offerType) where.offerType = offerType;
  const status = url.searchParams.get("status");
  if (status) where.status = status;
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "25", 10)));

  const [rows, total] = await Promise.all([
    prisma.referralAssignment.findMany({
      where,
      include: { links: { select: { id: true, code: true, url: true, isActive: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.referralAssignment.count({ where }),
  ]);
  return NextResponse.json({ rows, total, page, limit });
}

export async function POST(req: Request) {
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
  const input = parsed.data;

  // Cross-field validation matching the service layer
  if (input.compensationMode === ReferralCompensationMode.PERCENT_OF_TRANSACTION && !input.rateBps) {
    return NextResponse.json({ error: "rateBps required for PERCENT_OF_TRANSACTION" }, { status: 400 });
  }
  if (
    (input.compensationMode === ReferralCompensationMode.FLAT_PER_COVER ||
      input.compensationMode === ReferralCompensationMode.FLAT_PER_PARTY) &&
    !input.flatAmountCents
  ) {
    return NextResponse.json(
      { error: "flatAmountCents required for flat compensation modes" },
      { status: 400 },
    );
  }

  const actor = await prisma.referralActor.findUnique({ where: { id: input.referralActorId } });
  if (!actor) {
    return NextResponse.json({ error: "ReferralActor not found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.referralAssignment.create({
      data: {
        referralActorId: input.referralActorId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        offerType: input.offerType,
        offerId: input.offerId,
        offerLabel: input.offerLabel,
        offerStartAt: input.offerStartAt ? new Date(input.offerStartAt) : null,
        offerEndAt: input.offerEndAt ? new Date(input.offerEndAt) : null,
        isCommissionEligible: input.isCommissionEligible,
        compensationMode: input.compensationMode,
        rateBps: input.rateBps ?? null,
        flatAmountCents: input.flatAmountCents ?? null,
        commissionPlanId: input.commissionPlanId ?? null,
        qrPayload: input.qrPayload ?? null,
        // Provenance: who created this assignment and from which surface.
        // Stored as plain columns (no FK) to avoid cascade complexity across
        // admin/partner roles.
        createdByUserId: userId,
        creatorRole: roles.find((r) => ADMIN_ROLES.has(r)) ?? "ADMIN",
      },
    });

    await logReferrerAssignmentAction(
      {
        actorId: userId,
        action: "assignment.created",
        referralActorId: input.referralActorId,
        referralAssignmentId: assignment.id,
        after: {
          offerType: input.offerType,
          offerLabel: input.offerLabel,
          isCommissionEligible: input.isCommissionEligible,
          compensationMode: input.compensationMode,
        },
      },
      tx,
    );

    return { assignment };
  });

  let link = null;
  if (input.generateLink) {
    link = await generateReferralLink({
      referralActorId: input.referralActorId,
      referralAssignmentId: result.assignment.id,
    });
    // Mirror the new link's code onto the assignment as `canonicalCode` so
    // the share surface and `/r/[code]` shortcuts can render without a join.
    await prisma.referralAssignment.update({
      where: { id: result.assignment.id },
      data: { canonicalCode: link.code },
    });
    await logReferrerAssignmentAction({
      actorId: userId,
      action: "link.generated",
      referralActorId: input.referralActorId,
      referralAssignmentId: result.assignment.id,
      referralLinkId: link.id,
      after: { code: link.code },
    });
  }

  return NextResponse.json({ ok: true, assignment: result.assignment, link });
}
