import { NextRequest, NextResponse } from "next/server";
import { getInviteByToken } from "@/server/partnerSeats/service";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ token: string }> }
) {
  const { token } = await ctx.params;
  const lookup = await getInviteByToken(token);
  if (lookup.status === "not_found") {
    return NextResponse.json({ status: lookup.status }, { status: 404 });
  }
  return NextResponse.json(lookup);
}
