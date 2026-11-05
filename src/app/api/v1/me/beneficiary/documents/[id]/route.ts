import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import {
  deleteOwnDocument,
  DocumentError,
} from "@/server/beneficiaries/beneficiaryDocumentService";
import { scrubErrorMessage } from "@/server/security/logScrub";
import { getBeneficiaryApiErrorStatus } from "@/app/api/v1/me/beneficiary/errorDetails";

export const dynamic = "force-dynamic";

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSession();
    const { id } = await ctx.params;
    await deleteOwnDocument(userId, id);
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const status = e instanceof DocumentError ? e.status : getBeneficiaryApiErrorStatus(e);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}
