import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { manualMatchTableSession } from "@/server/services/invu/invuClosedOrdersService";

function isSuperadmin(session: unknown): boolean {
  const s = session as { user?: { roles?: string[] } } | null;
  return !!s?.user?.roles?.some((r) => r === "SUPERADMIN");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const tableSessionId = body?.tableSessionId as string | undefined;
  const reservationId = body?.reservationId as string | undefined;
  if (!tableSessionId || !reservationId) {
    return NextResponse.json(
      { error: "tableSessionId and reservationId required" },
      { status: 400 }
    );
  }

  try {
    const userId = (session as { user?: { id?: string } } | null)?.user?.id;
    const result = await manualMatchTableSession({
      tableSessionId,
      reservationId,
      resolvedByUserId: userId,
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Match failed" },
      { status: 422 }
    );
  }
}
