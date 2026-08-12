import { NextRequest, NextResponse } from "next/server";
import { requireAdminRoles } from "@/server/auth/adminGuard";
import { listBatches, createDraft } from "@/server/payouts/payoutBatchService";

export async function GET(req: NextRequest) {
  try {
    await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_FINANCE"]);

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? undefined;
    const batches = await listBatches({ status });
    return NextResponse.json({ batches });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403 : msg.includes("Unauthorized") ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await requireAdminRoles(req, ["SUPERADMIN", "ADMIN_FINANCE"]);

    const body = await req.json();
    const { name, notes, from, to, ledgerEntryIds, currency } = body ?? {};
    if (!name || !from || !to || !Array.isArray(ledgerEntryIds) || ledgerEntryIds.length === 0) {
      return NextResponse.json(
        { error: "name, from, to, and non-empty ledgerEntryIds are required" },
        { status: 400 },
      );
    }

    const result = await createDraft({
      name: String(name),
      notes: notes ? String(notes) : null,
      from: new Date(from),
      to: new Date(to),
      ledgerEntryIds: ledgerEntryIds.map(String),
      createdById: userId,
      currency: currency ? String(currency) : "USD",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403
      : msg.includes("Unauthorized") ? 401
      : msg.includes("eligible") || msg.includes("currencies") || msg.includes("required") ? 400
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
