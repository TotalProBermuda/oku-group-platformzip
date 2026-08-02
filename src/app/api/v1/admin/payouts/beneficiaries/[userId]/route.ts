import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission, RBACError } from "@/lib/rbac";
import { adminGetProfile, adminUpsertProfile } from "@/server/beneficiaries/beneficiaryService";
import {
  BENEFICIARY_AUDIT_ACTIONS,
  buildBeneficiaryAuditMetadata,
} from "@/server/audit/buildBeneficiaryAuditMetadata";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  banescoAccountNumber: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  accountHolderName: z.string().nullable().optional(),
  accountType: z.enum(["CHECKING", "SAVINGS"]).nullable().optional(),
  currency: z.string().nullable().optional(),
  swiftBic: z.string().nullable().optional(),

  proofOfAddressStatus: z.enum(["NOT_REQUIRED", "MISSING", "RECEIVED", "VERIFIED", "REJECTED"]).optional(),
  identificationStatus: z.enum(["NOT_REQUIRED", "MISSING", "RECEIVED", "VERIFIED", "REJECTED"]).optional(),
  taxOrRucStatus:       z.enum(["NOT_REQUIRED", "MISSING", "RECEIVED", "VERIFIED", "REJECTED"]).optional(),
  sourceOfFundsStatus:  z.enum(["NOT_REQUIRED", "MISSING", "RECEIVED", "VERIFIED", "REJECTED"]).optional(),

  incomeCertificationRequired: z.boolean().optional(),
  incomeCertificationExpiresAt: z.string().nullable().optional(),
  adminVerificationNotes: z.string().nullable().optional(),
});

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const { userId } = await ctx.params;
  let actorId: string | null = null;
  try {
    const session = await requireSession();
    actorId = session.userId;
    try {
      requirePermission(session.roles, "admin:beneficiaries:detail");
    } catch (rbac) {
      // Forbidden read: write an access_denied audit row before bubbling
      // the 403 so we have an auditable trail of *attempted* sensitive
      // access — Panama Law 81 readiness requires this, not just
      // successful reads.
      await prisma.auditLog.create({
        data: {
          actorId,
          action: BENEFICIARY_AUDIT_ACTIONS.detailAccessDenied,
          metadata: buildBeneficiaryAuditMetadata({
            targetUserId: userId,
            source: "admin_drawer",
            permissionMissing: "admin:beneficiaries:detail",
            method: "GET",
            route: "/api/v1/admin/payouts/beneficiaries/[userId]",
          }),
        },
      });
      throw rbac;
    }
    const view = await adminGetProfile(userId);
    // Successful read of restricted bank/document detail — always audited.
    await prisma.auditLog.create({
      data: {
        actorId,
        action: BENEFICIARY_AUDIT_ACTIONS.detailViewed,
        metadata: buildBeneficiaryAuditMetadata({
          targetUserId: userId,
          source: "admin_drawer",
        }),
      },
    });
    return NextResponse.json({ ok: true, data: view });
  } catch (e: any) {
    const status = e instanceof RBACError ? 403 : (e.status || 500);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { roles, userId: actorId } = await requireSession();
    requirePermission(roles, "admin:beneficiaries:write");
    const { userId } = await ctx.params;
    const body = PatchBody.parse(await req.json());
    const view = await adminUpsertProfile(userId, actorId, body);
    return NextResponse.json({ ok: true, data: view });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status: e.status || 500 });
  }
}
