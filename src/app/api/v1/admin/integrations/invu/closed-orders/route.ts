import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getClosedOrdersOverview } from "@/server/services/invu/invuClosedOrdersService";

function isSuperadmin(session: unknown): boolean {
  const s = session as { user?: { roles?: string[] } } | null;
  return !!s?.user?.roles?.some((r) => r === "SUPERADMIN");
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const venueId = searchParams.get("venueId");
  const days = Number(searchParams.get("days") ?? 7);
  if (!venueId) {
    return NextResponse.json({ error: "venueId required" }, { status: 400 });
  }

  try {
    const overview = await getClosedOrdersOverview({ venueId, days });
    return NextResponse.json(overview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load overview" },
      { status: 422 }
    );
  }
}
