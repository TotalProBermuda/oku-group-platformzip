import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { transitionStatus, TransitionError } from "@/server/beneficiaries/beneficiaryService";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  to: z.enum([
    "MISSING_INFO", "READY_FOR_REVIEW", "OKU_APPROVED",
    "AWAITING_BANK_CONFIRMATION", "BANK_READY", "REJECTED", "ON_HOLD",
  ]),
  reason: z.string().nullable().optional(),
});

export async function POST(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  try {
    const { roles, userId: actorId } = await requireSession();
    requirePermission(roles, "admin:beneficiaries:write");
    const { userId } = await ctx.params;
    const body = PostBody.parse(await req.json());
    const view = await transitionStatus({
      targetUserId: userId,
      actorId,
      to: body.to,
      reason: body.reason ?? null,
    });
    return NextResponse.json({ ok: true, data: view });
  } catch (e: any) {
    const status = e instanceof TransitionError ? 400 : (e.status || 500);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}
