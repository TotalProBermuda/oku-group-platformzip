import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { submitForApproval } from "@/server/payouts/payoutBatchService";
import { prisma } from "@/lib/prisma";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:payouts:write");
    const { id } = await params;

    await submitForApproval({ batchId: id, userId: userId });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403
      : msg.includes("Unauthorized") ? 401
      : msg.includes("not found") ? 404
      : msg.includes("Cannot") || msg.includes("empty") ? 409
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
