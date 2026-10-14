import type { Prisma } from "@prisma/client";
import type { EffectiveField, ManagementInput } from "./sessionFields";
import { setAssignmentLifecycle } from "@/server/referrals/referralAssignmentService";

export const financialInclude = { referralActor: { select: { displayName: true, status: true, commissionEligible: true } } } as const;
export type FinancialAssignment = Prisma.ReferralAssignmentGetPayload<{ include: typeof financialInclude }>;
export type FinancialDiff = { field: string; before: EffectiveField; after: EffectiveField };
const reject = (status: number, message: string): never => { throw Object.assign(new Error(message), { status }); };

/** Financial identity/terms belong to canonical scope administration, not session modes. */
export function financialDiffs(seriesId: string, rows: FinancialAssignment[], input: ManagementInput): FinancialDiff[] {
  return (input.assignmentChanges ?? []).flatMap(edit => {
    const row = rows.find(r => r.id === edit.assignmentId);
    if (!row || row.scopeType !== "SERIES" || row.scopeId !== seriesId)
      return reject(400, "Only existing financial assignments scoped to this series can change here. GLOBAL, VENUE and CAMPAIGN assignments stay in canonical scope administration.");
    if (row.status !== "ACTIVE" && row.status !== "PAUSED")
      return reject(409, "Draft or retired assignments require canonical referral administration.");
    if (edit.status === "ACTIVE" && row.referralActor.status !== "ACTIVE")
      return reject(409, "Only an active referral actor can have an assignment activated.");
    const isActive = edit.status === "ACTIVE";
    if (row.status === edit.status && row.isActive === isActive) return [];
    return [{
      field: `referral.${row.id}.status`,
      before: { value: { status: row.status, isActive: row.isActive }, source: "series" as const, mode: "override" as const },
      after: { value: { status: edit.status, isActive }, source: "series" as const, mode: "override" as const },
    }];
  });
}

export async function applyFinancialAssignments(tx: Prisma.TransactionClient, seriesId: string, actorId: string, changeId: string, rows: FinancialAssignment[], input: ManagementInput) {
  // Validation is repeated inside the mutation transaction, after snapshot verification.
  financialDiffs(seriesId, rows, input);
  for (const edit of input.assignmentChanges ?? []) {
    const row = rows.find(r => r.id === edit.assignmentId)!;
    if (row.status === edit.status && row.isActive === (edit.status === "ACTIVE")) continue;
    await setAssignmentLifecycle(row.id, edit.status, tx);
    await tx.auditLog.create({ data: {
      actorId, action: "referrer.assignment.status.changed",
      metadata: { referralAssignmentId: row.id, referralActorId: row.referralActorId, scopeType: row.scopeType, scopeId: row.scopeId,
        before: { status: row.status, isActive: row.isActive }, after: { status: edit.status, isActive: edit.status === "ACTIVE" }, changeId, source: "session-management" },
    } });
  }
}
