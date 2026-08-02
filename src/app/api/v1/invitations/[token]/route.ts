import { NextRequest, NextResponse } from "next/server";
import { validateToken, markOpened } from "@/server/invitation/tokenService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  await markOpened(token);
  return NextResponse.json({
    invitation: {
      id: result.invitation.id,
      status: result.invitation.status,
      audienceSegment: result.invitation.audienceSegment,
      recipientName: result.invitation.recipientName,
    },
    series: result.invitation.series,
  });
}
