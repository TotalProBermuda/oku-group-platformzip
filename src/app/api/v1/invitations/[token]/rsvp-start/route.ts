import { NextRequest, NextResponse } from "next/server";
import { validateToken, markRsvpStarted } from "@/server/invitation/tokenService";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await validateToken(token);
  if (!result.valid) {
    return NextResponse.json({ error: result.reason }, { status: 404 });
  }
  await markRsvpStarted(token, "WEB");
  const series = result.invitation.series;
  return NextResponse.json({
    ok: true,
    status: "RSVP_STARTED",
    invitationId: result.invitation.id,
    seriesSlug: series.slug,
    requiresRegistration: series.inviteRequiresRegistration,
  });
}
