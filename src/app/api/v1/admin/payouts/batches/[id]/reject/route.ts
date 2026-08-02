import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { reject } from "@/server/payouts/payoutBatchService";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:payouts:write");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason ? String(body.reason) : "";
    if (!reason.trim()) {
      return NextResponse.json({ error: "Rejection reason is required" }, { status: 400 });
    }

    await reject({ batchId: id, userId: userId, reason });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403
      : msg.includes("Unauthorized") ? 401
      : msg.includes("not found") ? 404
      : msg.includes("Cannot") || msg.includes("required") ? 409
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
