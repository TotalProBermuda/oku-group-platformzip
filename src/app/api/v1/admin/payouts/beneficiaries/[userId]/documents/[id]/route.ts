import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import {
  adminDeleteDocument,
  DocumentError,
} from "@/server/beneficiaries/beneficiaryDocumentService";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ userId: string; id: string }> },
) {
  try {
    const { roles, userId: actorId } = await requireSession();
    requirePermission(roles, "admin:beneficiaries:write");
    const { userId, id } = await ctx.params;
    await adminDeleteDocument(actorId, userId, id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    const status = e instanceof DocumentError ? e.status : (e.status || 500);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}
