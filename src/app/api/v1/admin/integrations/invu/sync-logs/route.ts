import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getSyncLogs } from "@/server/services/invu/invuIntegrationService";

function isSuperadmin(session: any) {
  return session?.user?.roles?.some((r: string) => r === "SUPERADMIN");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const venueId = req.nextUrl.searchParams.get("venueId");
  if (!venueId) return NextResponse.json({ error: "venueId is required" }, { status: 400 });

  const page = parseInt(req.nextUrl.searchParams.get("page") ?? "1", 10);
  const limit = parseInt(req.nextUrl.searchParams.get("limit") ?? "10", 10);

  const result = await getSyncLogs(venueId, page, Math.min(limit, 50));
  return NextResponse.json(result);
}
