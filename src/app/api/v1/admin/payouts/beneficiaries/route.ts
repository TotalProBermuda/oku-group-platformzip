import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminPermission } from "@/server/auth/adminGuard";
import { adminListProfileSummaries, type BankReadinessStatusValue } from "@/server/beneficiaries/beneficiaryService";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

const ALLOWED: BankReadinessStatusValue[] = [
  "MISSING_INFO", "READY_FOR_REVIEW", "OKU_APPROVED",
  "AWAITING_BANK_CONFIRMATION", "BANK_READY", "REJECTED", "ON_HOLD",
];

export async function GET(req: Request) {
  try {
    const { userId } = await requireAdminPermission(req, "admin:beneficiaries:summary");
    const url = new URL(req.url);
    const statusParam = url.searchParams.get("status") as BankReadinessStatusValue | null;
    const q = url.searchParams.get("q") || undefined;
    const status = statusParam && ALLOWED.includes(statusParam) ? statusParam : undefined;
    const rows = await adminListProfileSummaries({ status, q });

    // Pattern E (audit-anomaly RUNBOOK §1.2): record every beneficiary
    // search. The summary view intentionally exposes no bank fields, so
    // `matchedBankField` is structurally false here — kept as a sentinel
    // so any future regression that re-introduces bank fields to the
    // queue payload would have to re-introduce a `last4` accessor and
    // immediately trip the detector.
    const matchedBankField = false;
    await prisma.auditLog
      .create({
        data: {
          actorId: userId,
          action: "admin.beneficiary.search",
          metadata: {
            q: q ? `len:${q.length}` : null,
            status: status ?? null,
            resultCount: rows.length,
            matchedBankField,
          },
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, data: rows });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status: e.status || 500 });
  }
}
