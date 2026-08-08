import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission, RBACError } from "@/lib/rbac";
import {
  adminGetDocumentSignedUrl,
  DocumentError,
} from "@/server/beneficiaries/beneficiaryDocumentService";
import {
  BENEFICIARY_AUDIT_ACTIONS,
  buildBeneficiaryAuditMetadata,
} from "@/server/audit/buildBeneficiaryAuditMetadata";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ userId: string; id: string }> },
) {
  const { userId, id } = await ctx.params;
  let actorId: string | null = null;
  try {
    const session = await requireSession();
    actorId = session.userId;
    try {
      requirePermission(session.roles, "admin:beneficiaries:detail");
    } catch (rbac) {
      // Forbidden signed-URL request — record an access_denied row so a
      // probe of someone else's document is auditable, then bubble 403.
      await prisma.auditLog.create({
        data: {
          actorId,
          action: BENEFICIARY_AUDIT_ACTIONS.documentAccessDenied,
          metadata: buildBeneficiaryAuditMetadata({
            targetUserId: userId,
            docId: id,
            source: "document_url",
            permissionMissing: "admin:beneficiaries:detail",
            method: "GET",
            route: "/api/v1/admin/payouts/beneficiaries/[userId]/documents/[id]/url",
          }),
        },
      });
      throw rbac;
    }
    // adminGetDocumentSignedUrl writes its own success audit row using
    // the same allowlist helper.
    const out = await adminGetDocumentSignedUrl(userId, id, actorId);
    return NextResponse.json({ ok: true, data: out });
  } catch (e: any) {
    const status =
      e instanceof RBACError ? 403 :
      e instanceof DocumentError ? e.status :
      (e.status || 500);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}
