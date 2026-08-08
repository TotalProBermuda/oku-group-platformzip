import { NextResponse } from "next/server";
import { stringify } from "csv-stringify/sync";
import { prisma } from "@/lib/prisma";
import { requireSession } from "@/server/auth/session";
import { requirePermission, RBACError } from "@/lib/rbac";
import {
  adminListProfiles,
  type BankReadinessStatusValue,
} from "@/server/beneficiaries/beneficiaryService";
import {
  BENEFICIARY_AUDIT_ACTIONS,
  buildBeneficiaryAuditMetadata,
} from "@/server/audit/buildBeneficiaryAuditMetadata";
import { scrubErrorMessage } from "@/server/security/logScrub";

export const dynamic = "force-dynamic";

const ALLOWED: BankReadinessStatusValue[] = [
  "MISSING_INFO", "READY_FOR_REVIEW", "OKU_APPROVED",
  "AWAITING_BANK_CONFIRMATION", "BANK_READY", "REJECTED", "ON_HOLD",
];

/** Sanitize CSV cells against formula-injection (matches /admin/tickets export). */
function sanitizeCell(v: string | number | null | undefined): string {
  if (v == null) return "";
  const s = String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

// Single source of truth for the columns this export produces. Used both
// to shape the CSV records and to record the field allowlist on the
// `compliance.export.beneficiary_queue` audit row — so a row-dump
// regression would change this list and immediately show up in the audit
// trail. Order matters: it determines CSV column order.
const EXPORT_FIELDS = [
  "userId",
  "name",
  "email",
  "bankName",
  "accountHolderName",
  "accountType",
  "accountLast4",
  "currency",
  "bankReadinessStatus",
  "okuApprovedAt",
  "bankReadyAt",
  "payoutEligible",
  "updatedAt",
] as const;

/**
 * GET /api/v1/admin/payouts/beneficiaries/export — CSV export of the
 * beneficiary queue. Restricted to ADMIN_FINANCE / SUPERADMIN. Every
 * successful export writes a `compliance.export.beneficiary_queue`
 * audit row; RBAC denials write the matching `*.access_denied` row so
 * a probe of the export endpoint is still auditable.
 *
 * Bank account numbers are NEVER included — only the last4 hint.
 * Banesco caveat: any new column required by Banesco must go through
 * privacy review before being added (see docs/privacy/...).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const statusParam = url.searchParams.get("status") as BankReadinessStatusValue | null;
  const q = url.searchParams.get("q") || undefined;
  const status = statusParam && ALLOWED.includes(statusParam) ? statusParam : undefined;

  let actorId: string | null = null;
  try {
    const session = await requireSession();
    actorId = session.userId;
    try {
      requirePermission(session.roles, "admin:beneficiaries:detail");
    } catch (rbac) {
      await prisma.auditLog.create({
        data: {
          actorId,
          action: BENEFICIARY_AUDIT_ACTIONS.queueExportDenied,
          metadata: buildBeneficiaryAuditMetadata({
            targetUserId: "*",
            source: "queue_export",
            permissionMissing: "admin:beneficiaries:detail",
            method: "GET",
            route: "/api/v1/admin/payouts/beneficiaries/export",
          }),
        },
      });
      throw rbac;
    }

    const rows = await adminListProfiles({ status, q, take: 500 });

    const records = rows.map(r => ({
      userId: sanitizeCell(r.userId),
      name: sanitizeCell(r.user.name),
      email: sanitizeCell(r.user.email),
      bankName: sanitizeCell(r.bank.bankName),
      accountHolderName: sanitizeCell(r.bank.accountHolderName),
      accountType: sanitizeCell(r.bank.accountType),
      accountLast4: sanitizeCell(r.bank.accountLast4),
      currency: sanitizeCell(r.bank.currency),
      bankReadinessStatus: sanitizeCell(r.status.bankReadinessStatus),
      okuApprovedAt: sanitizeCell(r.status.okuApprovedAt),
      bankReadyAt: sanitizeCell(r.status.bankReadyAt),
      payoutEligible: r.status.payoutEligible ? "yes" : "no",
      updatedAt: sanitizeCell(r.updatedAt),
    }));

    const csv = stringify(records, { header: true });

    await prisma.auditLog.create({
      data: {
        actorId,
        action: BENEFICIARY_AUDIT_ACTIONS.queueExport,
        metadata: buildBeneficiaryAuditMetadata({
          // Queue exports are not scoped to a single user — use a
          // sentinel so the typed allowlist still validates the row.
          targetUserId: "*",
          source: "queue_export",
          // Evidence of what was exported. Values are NEVER recorded —
          // only counts, filters, and the field allowlist — so this
          // audit row stays safe to forward to a SIEM.
          rowCount: rows.length,
          fields: EXPORT_FIELDS,
          filterStatus: status ?? undefined,
          queryLength: q ? q.length : 0,
        }),
      },
    });

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": 'attachment; filename="beneficiary-queue.csv"',
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    const status = e instanceof RBACError ? 403 : (e.status || 500);
    return NextResponse.json({ ok: false, error: scrubErrorMessage(e) }, { status });
  }
}
