import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export type ReferrerAssignmentAuditAction =
  | "actor.find_or_create.matched"
  | "actor.find_or_create.created"
  | "assignment.created"
  | "assignment.updated"
  | "assignment.deactivated"
  | "link.generated"
  | "link.deactivated"
  | "share.opened"
  | "status.changed";

export interface ReferrerAssignmentAuditEntry {
  actorId: string | null;
  action: ReferrerAssignmentAuditAction;
  referralActorId?: string | null;
  referralAssignmentId?: string | null;
  referralLinkId?: string | null;
  matchKey?: "userId" | "email" | "phone" | "whatsapp" | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

type TxClient = Prisma.TransactionClient;

/**
 * Single-source audit writer for the unified referrer assignment lifecycle.
 * All actions are namespaced `referrer.assignment.*` so they can be queried
 * with `action LIKE 'referrer.assignment.%'` for compliance/payout audits.
 *
 * Pass `tx` to write the audit inside the same transaction as the mutation
 * so both commit (or roll back) atomically.
 */
export async function logReferrerAssignmentAction(
  entry: ReferrerAssignmentAuditEntry,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  await client.auditLog.create({
    data: {
      actorId: entry.actorId ?? "system",
      action: `referrer.assignment.${entry.action}`,
      metadata: {
        referralActorId: entry.referralActorId ?? null,
        referralAssignmentId: entry.referralAssignmentId ?? null,
        referralLinkId: entry.referralLinkId ?? null,
        matchKey: entry.matchKey ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        note: entry.note ?? null,
      } as object,
    },
  });
}
