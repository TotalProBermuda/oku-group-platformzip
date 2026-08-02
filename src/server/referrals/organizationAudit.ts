import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ReferralOrgAuditAction =
  | "LINK_TO_ENTITY"
  | "CREATE_ENTITY"
  | "MARK_SOLE_PROPRIETOR"
  | "AUTO_RESOLVE";

export interface ReferralOrgAuditEntry {
  actorId: string;
  action: ReferralOrgAuditAction;
  referralActorId: string;
  rawOrganizationName?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

type TxClient = Prisma.TransactionClient;

/**
 * Single-source audit writer for the Referral Organization Resolver.
 * Mirrors the pattern in src/server/revenue/revenueAudit.ts so all
 * org-resolution actions are searchable via `action LIKE 'REFERRAL_ORG_%'`.
 *
 * Pass a `tx` client to write the audit row inside the same transaction as
 * the state mutation — this guarantees action and audit entry commit (or
 * roll back) atomically, so we never have a state change without its
 * corresponding audit record.
 */
export async function logReferralOrgAction(
  entry: ReferralOrgAuditEntry,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: `REFERRAL_ORG_${entry.action}`,
      metadata: {
        referralActorId: entry.referralActorId,
        rawOrganizationName: entry.rawOrganizationName ?? null,
        entityId: entry.entityId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        note: entry.note ?? null,
      } as object,
    },
  });
}
