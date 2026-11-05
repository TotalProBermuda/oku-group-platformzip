import { NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { getDocStatusSources } from "@/server/beneficiaries/beneficiaryService";
import { scrubErrorMessage } from "@/server/security/logScrub";
import { getBeneficiaryApiErrorStatus } from "@/app/api/v1/me/beneficiary/errorDetails";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:beneficiaries:detail");
    const { userId } = await ctx.params;
    const sources = await getDocStatusSources(userId);
    return NextResponse.json({ ok: true, data: sources });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status: getBeneficiaryApiErrorStatus(e) });
  }
}
