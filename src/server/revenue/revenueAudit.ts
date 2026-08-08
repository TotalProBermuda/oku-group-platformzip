import { prisma } from "@/lib/prisma";

export type RevenueAuditAction =
  | "ALLOCATION_APPROVE"
  | "ALLOCATION_DISPUTE"
  | "ALLOCATION_REVERSE"
  | "ALLOCATION_MARK_PAID"
  | "TABLE_SESSION_ACCEPT"
  | "TABLE_SESSION_DISPUTE"
  | "TABLE_SESSION_DISMISS_REVIEW";

export interface RevenueAuditEntry {
  actorId: string;
  action: RevenueAuditAction;
  tableSessionId?: string | null;
  allocationId?: string | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
}

export async function logRevenueAction(entry: RevenueAuditEntry): Promise<void> {
  await prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      action: `REVENUE_${entry.action}`,
      metadata: {
        tableSessionId: entry.tableSessionId ?? null,
        allocationId: entry.allocationId ?? null,
        before: entry.before ?? null,
        after: entry.after ?? null,
        note: entry.note ?? null,
      } as object,
    },
  });
}

export async function listAuditForTableSession(tableSessionId: string, take = 200) {
  return prisma.auditLog.findMany({
    where: {
      action: { startsWith: "REVENUE_" },
      metadata: { path: ["tableSessionId"], equals: tableSessionId },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}
