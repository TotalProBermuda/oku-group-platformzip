import { NextRequest, NextResponse } from "next/server";
import { requireSession } from "@/server/auth/session";
import { requirePermission } from "@/lib/rbac";
import { markExported } from "@/server/payouts/payoutBatchService";
import {
  PAYOUT_EXPORT_FORMATS,
  normalisePayoutExportFormat,
} from "@/server/payouts/exportFormats";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { userId, roles } = await requireSession();
    requirePermission(roles, "admin:payouts:write");
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    // The format is a required, validated workflow input — no implicit
    // bank assumed. Reject up-front with a 400 so callers see the
    // problem without entering the markExported transaction.
    const rawFormat = body?.format;
    if (typeof rawFormat !== "string" || !rawFormat.trim()) {
      return NextResponse.json(
        {
          error: "Missing required field: format",
          supportedFormats: PAYOUT_EXPORT_FORMATS,
        },
        { status: 400 },
      );
    }
    const normalised = normalisePayoutExportFormat(rawFormat);
    if (!normalised) {
      return NextResponse.json(
        {
          error: `Unsupported export format: ${rawFormat}`,
          supportedFormats: PAYOUT_EXPORT_FORMATS,
        },
        { status: 400 },
      );
    }

    await markExported({ batchId: id, userId, format: normalised });
    return NextResponse.json({ ok: true, exportFormat: normalised });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    const status = msg.includes("Forbidden") ? 403
      : msg.includes("Unauthorized") ? 401
      : msg.includes("not found") ? 404
      : msg.includes("Cannot") || msg.includes("must be") ? 409
      : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
