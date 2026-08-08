import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type PayoutBatchAuditAction =
  | "CREATE_DRAFT"
  | "ADD_LINES"
  | "REMOVE_LINES"
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "EXPORT"
  | "DISCARD"
  | "ATTACH_SUB_COMMISSIONS"
  | "DETACH_SUB_COMMISSIONS";

export interface PayoutBatchAuditEntry {
  actorId: string;
  action: PayoutBatchAuditAction;
  payoutBatchId: string;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

type TxClient = Prisma.TransactionClient;

/**
 * Single-source audit writer for the Payout Verification Layer. Mirrors the
 * pattern in src/server/referrals/organizationAudit.ts and
 * src/server/revenue/revenueAudit.ts so all batch-lifecycle actions are
 * searchable via `action LIKE 'PAYOUT_BATCH_%'`.
 *
 * Pass a `tx` client to write the audit row inside the same transaction as
 * the state mutation — guarantees action and audit row commit (or roll
 * back) atomically, so a payout batch can never advance status without its
 * corresponding audit record.
 */
export async function logPayoutBatchAction(
  entry: PayoutBatchAuditEntry,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: `PAYOUT_BATCH_${entry.action}`,
      metadata: {
        payoutBatchId: entry.payoutBatchId,
        before: entry.before ?? null,
        after: entry.after ?? null,
        note: entry.note ?? null,
      } as object,
    },
  });
}
