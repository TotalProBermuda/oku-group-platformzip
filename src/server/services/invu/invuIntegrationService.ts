import { prisma } from "@/lib/prisma";
import { safeEnqueue } from "@/server/queue/queue";
import type { SyncScopeType, Prisma } from "@prisma/client";

const DEFAULT_SYNC_SCOPE = {
  closedOrders: true,
  invoiceTotals: true,
  payments: true,
  clients: false,
  creditNotes: true,
  reversals: true,
  orderTotals: true,
};

export async function triggerManualInvuSync(
  credentialId: string,
  scopeType: SyncScopeType = "ALL",
  userId?: string,
  venueId?: string,
  branchMappingId?: string
): Promise<string> {
  const syncRun = await prisma.integrationSyncRun.create({
    data: {
      credentialId,
      venueId: venueId ?? null,
      branchMappingId: branchMappingId ?? null,
      scopeType,
      triggeredByUserId: userId ?? null,
      status: "STARTED",
    },
  });

  try {
    await safeEnqueue("invu_sync", {
      syncRunId: syncRun.id,
      credentialId,
      scopeType,
      userId,
      venueId,
      branchMappingId,
    });
  } catch (err) {
    console.warn("[invu-sync] Queue enqueue failed, sync run created but not queued:", err);
  }

  return syncRun.id;
}

export async function updateBranchMapping(
  mappingId: string,
  data: {
    invuBranchId?: string;
    invuBranchLabel?: string;
    syncIntervalMinutes?: number;
    syncScopeJson?: Record<string, boolean>;
    isSyncEnabled?: boolean;
  }
): Promise<void> {
  await prisma.integrationBranchMapping.update({
    where: { id: mappingId },
    data: {
      invuBranchId: data.invuBranchId,
      invuBranchLabel: data.invuBranchLabel,
      syncIntervalMinutes: data.syncIntervalMinutes,
      syncScopeJson: data.syncScopeJson as Prisma.InputJsonValue,
      isSyncEnabled: data.isSyncEnabled,
    },
  });
}

export async function toggleBranchSync(mappingId: string, enabled: boolean): Promise<void> {
  await prisma.integrationBranchMapping.update({
    where: { id: mappingId },
    data: { isSyncEnabled: enabled },
  });
}

export async function createBranchMapping(data: {
  venueId: string;
  credentialId: string;
  invuBranchId: string;
  invuBranchLabel?: string;
  syncIntervalMinutes?: number;
}): Promise<string> {
  const credential = await prisma.invuIntegrationCredential.findUnique({
    where: { id: data.credentialId },
    select: { venueId: true },
  });

  if (!credential) {
    throw new Error("Credential not found");
  }
  if (credential.venueId !== data.venueId) {
    throw new Error("Credential does not belong to the specified venue");
  }

  const mapping = await prisma.integrationBranchMapping.create({
    data: {
      venueId: data.venueId,
      credentialId: data.credentialId,
      invuBranchId: data.invuBranchId,
      invuBranchLabel: data.invuBranchLabel,
      syncIntervalMinutes: data.syncIntervalMinutes ?? 15,
      syncScopeJson: DEFAULT_SYNC_SCOPE as Prisma.InputJsonValue,
    },
  });
  return mapping.id;
}

export async function deleteBranchMapping(mappingId: string): Promise<void> {
  const activeRun = await prisma.integrationSyncRun.findFirst({
    where: { branchMappingId: mappingId, status: "STARTED" },
  });
  if (activeRun) {
    throw new Error("Cannot delete mapping with an active sync run");
  }
  await prisma.integrationBranchMapping.delete({ where: { id: mappingId } });
}

export async function getBranchMappings(venueId: string) {
  return prisma.integrationBranchMapping.findMany({
    where: { venueId },
    include: {
      syncRuns: {
        orderBy: { startedAt: "desc" },
        take: 1,
        include: { errors: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function getSyncLogs(venueId: string, page = 1, limit = 10) {
  const credential = await prisma.invuIntegrationCredential.findUnique({ where: { venueId } });
  if (!credential) return { runs: [], total: 0 };

  const skip = (page - 1) * limit;
  const [runs, total] = await Promise.all([
    prisma.integrationSyncRun.findMany({
      where: { credentialId: credential.id },
      orderBy: { startedAt: "desc" },
      skip,
      take: limit,
      include: { errors: true },
    }),
    prisma.integrationSyncRun.count({ where: { credentialId: credential.id } }),
  ]);

  return { runs, total };
}
