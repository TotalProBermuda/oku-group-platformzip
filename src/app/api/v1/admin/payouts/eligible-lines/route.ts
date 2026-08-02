import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { previewBatch } from "@/server/payouts/payoutBatchService";

export async function GET(req: NextRequest) {
  try {
    const { roles } = await requireSession();
    requirePermission(roles, "admin:audit:read");

    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from");
    const toStr = url.searchParams.get("to");
    if (!fromStr || !toStr) {
      return NextResponse.json({ error: "from and to query parameters are required" }, { status: 400 });
    }
    const from = new Date(fromStr);
    const to = new Date(toStr);
    if (Number.isNaN(from.valueOf()) || Number.isNaN(to.valueOf())) {
      return NextResponse.json({ error: "from and to must be valid ISO dates" }, { status: 400 });
    }
    const preview = await previewBatch({ from, to });
    return NextResponse.json({ preview });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
