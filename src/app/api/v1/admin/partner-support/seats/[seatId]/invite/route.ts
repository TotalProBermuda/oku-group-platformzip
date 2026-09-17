import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { invitePartnerCommerceSeat } from "@/server/partnerCommerce/signinInvite";

export async function POST(request: NextRequest, context: { params: Promise<{ seatId: string }> }) {
  try {
    const auth = await requireAdminRoles(request, ["SUPERADMIN"]);
    const { seatId } = await context.params;
    return NextResponse.json({ ok: true, result: await invitePartnerCommerceSeat({ seatId, invitedByUserId: auth.userId }) });
  } catch (error) {
    const status = (error as { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to issue invitation" }, { status });
  }
}
