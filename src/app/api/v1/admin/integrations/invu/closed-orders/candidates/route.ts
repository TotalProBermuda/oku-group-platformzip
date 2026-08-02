import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { listCandidateReservations } from "@/server/services/invu/invuClosedOrdersService";

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
  const tableSessionId = searchParams.get("tableSessionId");
  if (!tableSessionId) {
    return NextResponse.json({ error: "tableSessionId required" }, { status: 400 });
  }

  try {
    const candidates = await listCandidateReservations({ tableSessionId });
    return NextResponse.json({ candidates });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed" },
      { status: 422 }
    );
  }
}
