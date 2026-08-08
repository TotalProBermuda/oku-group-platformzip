import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getInvuConnectionStatus } from "@/server/services/invu/invuAuthService";

function isSuperadmin(session: any) {
  return session?.user?.roles?.some((r: string) => r === "SUPERADMIN");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const venueId = req.nextUrl.searchParams.get("venueId");
  if (!venueId) return NextResponse.json({ error: "venueId is required" }, { status: 400 });

  const status = await getInvuConnectionStatus(venueId);
  if (!status) {
    return NextResponse.json({ status: "DISCONNECTED", venueId });
  }

  return NextResponse.json(status);
}
