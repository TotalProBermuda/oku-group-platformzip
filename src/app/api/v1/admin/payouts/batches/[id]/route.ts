import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { getBatchDetail } from "@/server/payouts/payoutBatchService";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminRoles(_req, ["SUPERADMIN", "ADMIN_FINANCE"]);
    const { id } = await params;
    const batch = await getBatchDetail(id);
    if (!batch) return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    return NextResponse.json({ batch });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
