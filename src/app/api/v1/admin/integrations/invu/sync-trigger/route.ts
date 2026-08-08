import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { triggerManualInvuSync } from "@/server/services/invu/invuIntegrationService";
import type { SyncScopeType } from "@prisma/client";

const VALID_SCOPE_TYPES: string[] = ["ALL", "CLOSED_ORDERS", "INVOICE_TOTALS", "PAYMENTS", "CLIENTS", "CREDIT_NOTES", "REVERSALS", "ORDER_TOTALS"];

function isSuperadmin(session: any) {
  return session?.user?.roles?.some((r: string) => r === "SUPERADMIN");
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!isSuperadmin(session)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { credentialId, scopeType, venueId, branchMappingId } = body;

  if (!credentialId) {
    return NextResponse.json({ error: "credentialId required" }, { status: 400 });
  }

  const rawScope = scopeType ?? "ALL";
  if (!VALID_SCOPE_TYPES.includes(rawScope)) {
    return NextResponse.json(
      { error: `Invalid scopeType. Must be one of: ${VALID_SCOPE_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  try {
    const syncRunId = await triggerManualInvuSync(
      credentialId,
      rawScope as SyncScopeType,
      session.user?.id as string,
      venueId,
      branchMappingId
    );
    return NextResponse.json({ success: true, syncRunId });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 422 });
  }
}
